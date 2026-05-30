import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { threadsService } from '../services/threads.service';
import { useAuth } from '../context/AuthContext';
import type { WhatsappMessage } from '../data/supabase.types';

export const THREADS_KEY = 'threads';
export const MESSAGES_KEY = 'messages';

export function useThreads() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [THREADS_KEY, tenantId],
    queryFn: () => threadsService.getThreads(tenantId!),
    enabled: !!tenantId,
    refetchInterval: false, // Realtime subscription handles updates
  });
}

export function useMessages(threadId: string | null) {
  return useQuery({
    queryKey: [MESSAGES_KEY, threadId],
    queryFn: () => threadsService.getMessages(threadId!),
    enabled: !!threadId,
    refetchInterval: false,
  });
}

/**
 * Supabase Realtime subscription for new messages on a thread.
 * Appends new messages to local state without refetching the full list.
 */
export function useRealtimeMessages(threadId: string | null): WhatsappMessage[] {
  const [realtimeMessages, setRealtimeMessages] = useState<WhatsappMessage[]>([]);

  useEffect(() => {
    if (!threadId) {
      setRealtimeMessages([]);
      return;
    }

    // Supabase Realtime channel for this specific thread
    const channel = supabase
      .channel(`thread-messages:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `whatsapp_thread_id=eq.${threadId}`,
        },
        (payload) => {
          setRealtimeMessages(prev => [...prev, payload.new as WhatsappMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      setRealtimeMessages([]);
    };
  }, [threadId]);

  return realtimeMessages;
}

/**
 * Supabase Realtime subscription for thread list updates (new threads, last_message changes).
 */
export function useRealtimeThreads(tenantId: string | null, onUpdate: () => void) {
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`threads:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_threads',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => onUpdate()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, onUpdate]);
}
