import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';

// Live CRM updates run on Supabase Realtime and local mutation broadcasting.
// When rows are updated or created, change signals trigger cache invalidation
// and automatic table re-fetching across active screens.

export type CrmChangedEvent = {
  resource: string;
  method: string;
  at: string;
};

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

// Maps a changed table to the resource key screens subscribe to via
// useRealtimeRevision().
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
  customer_accounts: 'deals',
  masterpay_records: 'deals',
  notifications: 'notifications',
};

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

export const addCrmChangeListener = (listener: (event: CrmChangedEvent) => void) => {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
};

export const broadcastCrmChange = (resource: string, method = 'POST') => {
  const event: CrmChangedEvent = {
    resource,
    method,
    at: new Date().toISOString(),
  };
  changeListeners.forEach(listener => listener(event));
};

let isOpeningChannel = false;

const teardown = async () => {
  if (channel) {
    const ch = channel;
    channel = null;
    try {
      await supabase.removeChannel(ch);
    } catch {
      // ignore teardown errors
    }
  }
  setStatus('disconnected');
};

const openChannel = async () => {
  if (channel || isOpeningChannel) return;
  isOpeningChannel = true;
  setStatus('connecting');

  try {
    const existing = supabase.getChannels().find(ch => ch.topic === 'realtime:crm-changes');
    if (existing) {
      await supabase.removeChannel(existing);
    }

    if (channel) return;

    const newChannel = supabase
      .channel('crm-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        payload => {
          const resource = TABLE_RESOURCES[payload.table];
          if (!resource) return;
          broadcastCrmChange(resource, METHOD_BY_EVENT[payload.eventType] ?? payload.eventType);
        },
      );

    channel = newChannel;

    newChannel.subscribe(status => {
      if (status === 'SUBSCRIBED') setStatus('connected');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setStatus('disconnected');
      }
    });
  } catch (err) {
    console.warn('Failed to initialize realtime channel:', err);
    setStatus('disconnected');
  } finally {
    isOpeningChannel = false;
  }
};

const startAuthSubscription = () => {
  if (authSubscriptionStarted) return;
  authSubscriptionStarted = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.access_token) {
      void teardown();
      return;
    }
    supabase.realtime.setAuth(session.access_token);
    if (!channel) void openChannel();
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

// An import or bulk delete arrives as one change event per row, and every revision bump
// makes a screen re-read its whole list. Bumps wait for the burst to go quiet, and a long
// burst still refreshes every MAX_WAIT so the screen does not sit stale until it ends.
const REVISION_QUIET_MS = 1_000;
const REVISION_MAX_WAIT_MS = 10_000;

export const useRealtimeRevision = (resources: string[]) => {
  const [revision, setRevision] = useState(0);
  const resourceKey = resources.slice().sort().join('|');
  useEffect(() => {
    const accepted = new Set(resourceKey.split('|').filter(Boolean));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstPendingAt = 0;
    const flush = () => {
      timer = undefined;
      firstPendingAt = 0;
      setRevision(value => value + 1);
    };
    const onChanged = (event: CrmChangedEvent) => {
      if (accepted.size > 0 && event.resource !== '*' && !accepted.has(event.resource)) return;
      const now = Date.now();
      if (!firstPendingAt) firstPendingAt = now;
      clearTimeout(timer);
      timer = setTimeout(flush, Math.min(REVISION_QUIET_MS, Math.max(0, firstPendingAt + REVISION_MAX_WAIT_MS - now)));
    };
    changeListeners.add(onChanged);
    void connectRealtime();
    return () => {
      clearTimeout(timer);
      changeListeners.delete(onChanged);
    };
  }, [resourceKey]);
  return revision;
};
