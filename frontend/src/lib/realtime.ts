import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { supabase } from '../config/supabase';

export type CrmChangedEvent = {
  resource: string;
  method: string;
  at: string;
};

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const socketOrigin = new URL(apiBase, window.location.origin).origin;
const socket: Socket = io(socketOrigin, { autoConnect: false, withCredentials: true });
let currentStatus: RealtimeStatus = 'disconnected';
let connectionPromise: Promise<void> | null = null;
let authSubscriptionStarted = false;
const statusListeners = new Set<(status: RealtimeStatus) => void>();

const setStatus = (status: RealtimeStatus) => {
  currentStatus = status;
  statusListeners.forEach(listener => listener(status));
};

socket.on('connect', () => setStatus('connected'));
socket.on('disconnect', () => setStatus('disconnected'));
socket.on('connect_error', () => setStatus('disconnected'));

const startAuthSubscription = () => {
  if (authSubscriptionStarted) return;
  authSubscriptionStarted = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.access_token) {
      socket.disconnect();
      return;
    }
    socket.auth = { token: session.access_token };
    if (!socket.connected) {
      setStatus('connecting');
      socket.connect();
    }
  });
};

export const connectRealtime = async () => {
  startAuthSubscription();
  if (socket.connected || connectionPromise) return connectionPromise;
  connectionPromise = supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session?.access_token) return;
    socket.auth = { token: session.access_token };
    setStatus('connecting');
    socket.connect();
  }).finally(() => { connectionPromise = null; });
  return connectionPromise;
};

export const useRealtimeStatus = () => {
  const [status, updateStatus] = useState<RealtimeStatus>(currentStatus);
  useEffect(() => {
    statusListeners.add(updateStatus);
    void connectRealtime();
    return () => { statusListeners.delete(updateStatus); };
  }, []);
  return status;
};

export const useRealtimeRevision = (resources: string[]) => {
  const [revision, setRevision] = useState(0);
  const resourceKey = resources.slice().sort().join('|');
  useEffect(() => {
    const accepted = new Set(resourceKey.split('|').filter(Boolean));
    const onChanged = (event: CrmChangedEvent) => {
      if (accepted.size === 0 || accepted.has(event.resource)) setRevision(value => value + 1);
    };
    socket.on('crm:changed', onChanged);
    void connectRealtime();
    return () => { socket.off('crm:changed', onChanged); };
  }, [resourceKey]);
  return revision;
};
