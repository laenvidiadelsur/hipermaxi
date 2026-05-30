// ============================================================
// Supabase Database type definition
// Auto-sync with: supabase/migrations/20260406000001_initial_schema.sql
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          nit: string | null;
          address: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['tenants']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tenants']['Insert']>;
      };

      users: {
        Row: {
          id: string;
          name: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          role_description: string | null;
          enabled: boolean;
          last_login: string | null;
          tenant_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };

      subscription_plans: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price: number;
          duration_in_days: number;
          renewable: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['subscription_plans']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['subscription_plans']['Insert']>;
      };

      subscriptions: {
        Row: {
          id: string;
          subscription_plan_id: string;
          tenant_id: string;
          price: number;
          expiration_date: string;
          enable: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['subscriptions']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
      };

      contacts: {
        Row: {
          id: string;
          name: string;
          phone_number: string | null;
          email: string | null;
          last_interaction: string | null;
          tenant_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['contacts']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>;
      };

      whatsapp_configurations: {
        Row: {
          id: string;
          channel_name: string | null;
          meta_id: string;
          waba_id: string;
          token: string;
          phone_number_id: string | null;
          verify_token: string | null;
          default_template_language: string;
          tenant_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['whatsapp_configurations']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          phone_number_id?: string;
          channel_name?: string | null;
          verify_token?: string | null;
          default_template_language?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_configurations']['Insert']>;
      };

      whatsapp_templates: {
        Row: {
          id: string;
          whatsapp_configuration_id: string;
          template_name: string;
          format_type: Database['public']['Enums']['template_format_type'];
          args: string[];
          meta_status: string;
          meta_template_id: string | null;
          language: string;
          category: string;
          components: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: {
          id?: string;
          whatsapp_configuration_id: string;
          template_name: string;
          format_type: Database['public']['Enums']['template_format_type'];
          args: string[];
          meta_status?: string;
          meta_template_id?: string | null;
          language?: string;
          category?: string;
          components?: Json;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          deleted_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_templates']['Insert']>;
      };

      whatsapp_threads: {
        Row: {
          id: string;
          contact_id: string;
          last_message: string | null;
          last_interaction: string | null;
          last_inbound_at: string | null;
          window_open: boolean;
          window_expires_at: string | null;
          tenant_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['whatsapp_threads']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_threads']['Insert']>;
      };

      whatsapp_messages: {
        Row: {
          id: string;
          whatsapp_thread_id: string;
          message_text: string | null;
          media_url: string | null;
          incoming: boolean;
          read: boolean;
          read_at: string | null;
          sent_at: string | null;
          reminder_log_id: string | null;
          mass_send_id: string | null;
          mass_send_run_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['whatsapp_messages']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_messages']['Insert']>;
      };

      whatsapp_mass_sends: {
        Row: {
          id: string;
          tenant_id: string;
          whatsapp_template_id: string | null;
          name: string;
          template_name: string;
          language: string;
          template_parameters: unknown;
          filters: unknown;
          mode: 'manual' | 'scheduled';
          status: 'draft' | 'active' | 'paused' | 'completed';
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['whatsapp_mass_sends']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_mass_sends']['Insert']>;
      };

      whatsapp_mass_send_schedules: {
        Row: {
          id: string;
          mass_send_id: string;
          cron_expression: string;
          timezone: string;
          next_run_at: string | null;
          last_run_at: string | null;
          enabled: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['whatsapp_mass_send_schedules']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_mass_send_schedules']['Insert']>;
      };

      whatsapp_mass_send_runs: {
        Row: {
          id: string;
          mass_send_id: string;
          tenant_id: string;
          trigger_type: 'manual' | 'scheduled';
          status: 'running' | 'completed' | 'failed';
          total_recipients: number;
          sent_count: number;
          failed_count: number;
          skipped_count: number;
          started_at: string;
          finished_at: string | null;
          error_summary: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['whatsapp_mass_send_runs']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_mass_send_runs']['Insert']>;
      };

      whatsapp_mass_send_recipients: {
        Row: {
          id: string;
          mass_send_id: string;
          mass_send_run_id: string;
          contact_id: string | null;
          phone_number: string;
          template_name: string;
          status: 'sent' | 'failed' | 'skipped';
          error_message: string | null;
          meta_message_id: string | null;
          whatsapp_thread_id: string | null;
          whatsapp_message_id: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['whatsapp_mass_send_recipients']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_mass_send_recipients']['Insert']>;
      };

      notification_events: {
        Row: {
          id: string;
          tenant_id: string;
          event_type: string;
          entity_type: string | null;
          entity_id: string | null;
          payload: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['notification_events']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['notification_events']['Insert']>;
      };

      notifications: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          event_id: string | null;
          title: string;
          body: string;
          severity: 'info' | 'warning' | 'critical';
          action_url: string | null;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      };

      notification_preferences: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          event_type: string;
          enabled_in_app: boolean;
          enabled_email: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['notification_preferences']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['notification_preferences']['Insert']>;
      };

      debts: {
        Row: {
          id: string;
          contact_id: string;
          debt_count: number;
          debt_paid_count: number;
          debt_pending_count: number;
          total_debt: number;
          total_paid: number;
          total_pending: number;
          debt_status: Database['public']['Enums']['debt_status'];
          tenant_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['debts']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['debts']['Insert']>;
      };

      debt_details: {
        Row: {
          id: string;
          contact_id: string;
          debt_id: string;
          debt_amount: number;
          debt_description: string | null;
          penalty_amount: number;
          total: number;
          expiration_date: string;
          debt_status: Database['public']['Enums']['debt_status'];
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['debt_details']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['debt_details']['Insert']>;
      };

      reminders: {
        Row: {
          id: string;
          debt_id: string;
          action_type: Database['public']['Enums']['reminder_action_type'];
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['reminders']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['reminders']['Insert']>;
      };

      reminder_programs: {
        Row: {
          id: string;
          reminder_id: string;
          days_ref_debt: number;
          whatsapp_template_id: string | null;
          reminder_count: number;
          reminder_sent_count: number;
          reminder_sent_pending: number;
          reminder_sent_error: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['reminder_programs']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['reminder_programs']['Insert']>;
      };

      reminder_logs: {
        Row: {
          id: string;
          reminder_program_id: string;
          debt_detail_id: string;
          whatsapp_template_id: string | null;
          sent_at: string | null;
          sent_status: Database['public']['Enums']['sent_status'];
          success: boolean;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['reminder_logs']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['reminder_logs']['Insert']>;
      };

      qrs: {
        Row: {
          id: string;
          external_id: string | null;
          expiration_date: string | null;
          paid: boolean;
          paid_at: boolean;
          amount: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['qrs']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['qrs']['Insert']>;
      };

      subscription_qrs: {
        Row: {
          id: string;
          subscription_id: string;
          qr_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['subscription_qrs']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['subscription_qrs']['Insert']>;
      };

      debt_detail_qrs: {
        Row: {
          id: string;
          debt_detail_id: string;
          qr_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          deleted_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['debt_detail_qrs']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['debt_detail_qrs']['Insert']>;
      };
    };

    Views: {
      v_active_contacts: {
        Row: Database['public']['Tables']['contacts']['Row'];
      };
      v_active_debt_details: {
        Row: Database['public']['Tables']['debt_details']['Row'];
      };
      v_active_debts: {
        Row: Database['public']['Tables']['debts']['Row'];
      };
    };

    Functions: {
      // Add RPC functions here as needed
    };

    Enums: {
      user_role: 'Superadmin' | 'Admin' | 'Agente';
      debt_status: 'Pending' | 'Active' | 'Paid' | 'Expired';
      sent_status: 'Pending' | 'Sent';
      reminder_action_type: 'manually' | 'automatically';
      template_format_type: 'named' | 'positional';
    };
  };
};

// ── Convenience row aliases ─────────────────────────────────
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

export type Tenant = Tables<'tenants'>;
export type DbUser = Tables<'users'>;
export type Contact = Tables<'contacts'>;
export type WhatsappConfiguration = Tables<'whatsapp_configurations'>;
export type WhatsappTemplate = Tables<'whatsapp_templates'>;
export type WhatsappThread = Tables<'whatsapp_threads'>;
export type WhatsappMessage = Tables<'whatsapp_messages'>;
export type Debt = Tables<'debts'>;
export type DebtDetail = Tables<'debt_details'>;
export type Reminder = Tables<'reminders'>;
export type ReminderProgram = Tables<'reminder_programs'>;
export type ReminderLog = Tables<'reminder_logs'>;
export type WhatsappMassSend = Tables<'whatsapp_mass_sends'>;
export type WhatsappMassSendRun = Tables<'whatsapp_mass_send_runs'>;
export type WhatsappMassSendRecipient = Tables<'whatsapp_mass_send_recipients'>;
export type NotificationEvent = Tables<'notification_events'>;
export type Notification = Tables<'notifications'>;
export type NotificationPreference = Tables<'notification_preferences'>;

export type UserRole = Database['public']['Enums']['user_role'];
export type DebtStatus = Database['public']['Enums']['debt_status'];
export type SentStatus = Database['public']['Enums']['sent_status'];
export type ReminderActionType = Database['public']['Enums']['reminder_action_type'];
export type TemplateFormatType = Database['public']['Enums']['template_format_type'];

// ── Label maps for UI rendering ─────────────────────────────
export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = {
  Pending: 'Pendiente',
  Active: 'En Gestión',
  Paid: 'Pagada',
  Expired: 'Vencida',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  Superadmin: 'Superadmin',
  Admin: 'Admin',
  Agente: 'Agente',
};

// ── Joined types for UI queries ──────────────────────────────
export type DebtDetailWithContact = DebtDetail & {
  contacts: Pick<Contact, 'name' | 'phone_number' | 'email'> | null;
  days_overdue?: number;
};

export type ThreadWithContact = WhatsappThread & {
  contacts: Pick<Contact, 'name' | 'phone_number'> | null;
  unread_count?: number;
};
