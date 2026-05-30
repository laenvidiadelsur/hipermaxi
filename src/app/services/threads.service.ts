import { supabase } from '../../lib/supabase';
import type { WhatsappMessage, ThreadWithContact } from '../data/supabase.types';

export const threadsService = {
  /** All threads with contact info, ordered by last interaction */
  async getThreads(tenantId: string): Promise<ThreadWithContact[]> {
    const { data, error } = await supabase
      .from('whatsapp_threads')
      .select(`
        *,
        contacts(name, phone_number)
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('last_interaction', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as ThreadWithContact[];
  },

  /** Messages for a specific thread, oldest first */
  async getMessages(threadId: string): Promise<WhatsappMessage[]> {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('whatsapp_thread_id', threadId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  /** Mark all messages in a thread as read */
  async markThreadRead(threadId: string): Promise<void> {
    const { error } = await supabase
      .from('whatsapp_messages')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('whatsapp_thread_id', threadId)
      .eq('read', false);
    if (error) throw error;
  },
};
