import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';

// Live CRM updates run on Supabase Realtime rather than a self-hosted Socket.IO
// server, so the API stays stateless and can be deployed to request-scoped
// serverless functions. See supabase/migrations/..._039_realtime_publication.sql.
//
// As before, only an invalidation signal reaches the client -- never row data. The
// affected screens refetch through the authenticated HTTP endpoints, preserving
// every role and PIC filter. Realtime also applies RLS, so a user is only told
// about rows they could already read.

export type CrmChangedEvent = {
  resource: string;
  method: string;
  at: string;
};

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

// Maps a changed table to the resource key screens subscribe to via
// useRealtimeRevision(). Tables absent here are ignored, so publishing an extra
// table is harmless.
const TABLE_RESOURCES: Record<string, string> = {
  prospect_clients: 'leads',
  warm_leads: 'leads',
  inquiries: 'leads',
  companies: 'leads',
  contacts: 'leads',
  removed_entries: 'leads',
  quotations: 'deals',
  sales: 'deals',
  contracts: 'contracts',
  inventory: 'inventory',
  notifications: 'notifications',
};

// Postgres operations mapped back to the HTTP verbs the old event used, so any
// consumer reading `method` keeps working.
const METHOD_BY_EVENT: Record<string, string> = {
  INSERT: 'POST',
  UPDATE: 'PATCH',
  DELETE: 'DELETE',
};

let channel: RealtimeChannel | null = null;
let currentStatus: RealtimeStatus = 'disconnected';
let connectionPromise: Promise<void> | null = null;
let authSubscriptionStarted = false;

const statusListeners = new Set<(status: RealtimeStatus) => void>();
const changeListeners = new Set<(event: CrmChangedEvent) => void>();

const setStatus = (status: RealtimeStatus) => {
  currentStatus = status;
  statusListeners.forEach(listener => listener(status));
};

const teardown = () => {
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  setStatus('disconnected');
};

const openChannel = () => {
  if (channel) return;
  setStatus('connecting');

  // Subscribing to the whole schema keeps the table list in one place -- the
  // publication in migration 039 -- instead of duplicating it here.
  channel = supabase
    .channel('crm-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public' },
      payload => {
        const resource = TABLE_RESOURCES[payload.table];
        if (!resource) return;
        const event: CrmChangedEvent = {
          resource,
          method: METHOD_BY_EVENT[payload.eventType] ?? payload.eventType,
          at: new Date().toISOString(),
        };
        changeListeners.forEach(listener => listener(event));
      },
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') setStatus('connected');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setStatus('disconnected');
      }
    });
};

const startAuthSubscription = () => {
  if (authSubscriptionStarted) return;
  authSubscriptionStarted = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.access_token) {
      teardown();
      return;
    }
    // Realtime needs the current token to evaluate RLS on the replication stream;
    // without this the channel connects but delivers nothing on protected tables.
    supabase.realtime.setAuth(session.access_token);
    if (!channel) openChannel();
  });
};

export const connectRealtime = async () => {
  startAuthSubscription();
  if (channel || connectionPromise) return connectionPromise ?? undefined;
  connectionPromise = supabase.auth.getSession()
    .then(({ data: { session } }) => {
      if (!session?.access_token) return;
      supabase.realtime.setAuth(session.access_token);
      openChannel();
    })
    .finally(() => { connectionPromise = null; });
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
    changeListeners.add(onChanged);
    void connectRealtime();
    return () => { changeListeners.delete(onChanged); };
  }, [resourceKey]);
  return revision;
};
