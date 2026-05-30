// ============================================================
// Aicobranzas — Database types (generated from schema)
// Sync with: supabase/migrations/20260406000001_initial_schema.sql
// ============================================================

// ── Enum types ────────────────────────────────────────────────
export type UserRole = 'Superadmin' | 'Admin' | 'Agente';
export type DebtStatus = 'Pending' | 'Active' | 'Paid' | 'Expired';
export type SentStatus = 'Pending' | 'Sent';
export type ReminderActionType = 'manually' | 'automatically';
export type TemplateFormatType = 'named' | 'positional';

// ── Audit base (all tables share these) ───────────────────────
export interface AuditFields {
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_by: string | null;
}

// ── TABLE TYPES ───────────────────────────────────────────────

export interface Tenant extends AuditFields {
  id: string;
  name: string;
  nit: string | null;
  address: string | null;
}

export interface User extends AuditFields {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  role_description: string | null;
  enabled: boolean;
  last_login: string | null;
  tenant_id: string | null;
}

export interface SubscriptionPlan extends AuditFields {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_in_days: number;
  renewable: boolean;
}

export interface Subscription extends AuditFields {
  id: string;
  subscription_plan_id: string;
  tenant_id: string;
  price: number;
  expiration_date: string;   // ISO date string
  enable: boolean;
}

export interface Contact extends AuditFields {
  id: string;
  name: string;
  phone_number: string | null;
  email: string | null;
  last_interaction: string | null;
  tenant_id: string;
}

export interface WhatsappConfiguration extends AuditFields {
  id: string;
  meta_id: string;           // MetaId from Configuracion.tsx
  waba_id: string;           // WhatsApp Business Account ID
  token: string;             // Access Token (store encrypted server-side)
  tenant_id: string;
}

export interface WhatsappTemplate extends AuditFields {
  id: string;
  whatsapp_configuration_id: string;
  template_name: string;
  format_type: TemplateFormatType;
  args: string[];
}

export interface WhatsappThread extends AuditFields {
  id: string;
  contact_id: string;
  last_message: string | null;
  last_interaction: string | null;
  tenant_id: string;
}

export interface WhatsappMessage extends AuditFields {
  id: string;
  whatsapp_thread_id: string;
  message_text: string | null;
  media_url: string | null;
  incoming: boolean;          // true = message from client
  read: boolean;
  read_at: string | null;
  sent_at: string | null;
  reminder_log_id: string | null;
}

export interface Debt extends AuditFields {
  id: string;
  contact_id: string;
  debt_count: number;
  debt_paid_count: number;
  debt_pending_count: number;
  total_debt: number;
  total_paid: number;
  total_pending: number;
  debt_status: DebtStatus;
  tenant_id: string;
}

export interface DebtDetail extends AuditFields {
  id: string;
  contact_id: string;
  debt_id: string;
  debt_amount: number;
  debt_description: string | null;
  penalty_amount: number;
  total: number;
  expiration_date: string;   // ISO date string
  debt_status: DebtStatus;
}

export interface Reminder extends AuditFields {
  id: string;
  debt_id: string;
  action_type: ReminderActionType;
}

export interface ReminderProgram extends AuditFields {
  id: string;
  reminder_id: string;
  days_ref_debt: number;          // negative = before, positive = after expiration
  whatsapp_template_id: string | null;
  reminder_count: number;
  reminder_sent_count: number;
  reminder_sent_pending: number;
  reminder_sent_error: number;
}

export interface ReminderLog extends AuditFields {
  id: string;
  reminder_program_id: string;
  debt_detail_id: string;
  whatsapp_template_id: string | null;
  sent_at: string | null;
  sent_status: SentStatus;
  success: boolean;
  error_message: string | null;
}

export interface Qr extends AuditFields {
  id: string;
  external_id: string | null;
  expiration_date: string | null;
  paid: boolean;
  paid_at: boolean;
  amount: number;
}

export interface SubscriptionQr extends AuditFields {
  id: string;
  subscription_id: string;
  qr_id: string;
}

export interface DebtDetailQr extends AuditFields {
  id: string;
  debt_detail_id: string;
  qr_id: string;
}

// ── JOINED / VIEW TYPES (for UI queries) ──────────────────────

/** Full contact with their debt summary */
export interface ContactWithDebts extends Contact {
  debts?: Debt[];
}

/** Thread with contact info and unread count */
export interface ThreadWithContact extends WhatsappThread {
  contact: Contact;
  unread_count?: number;
  messages?: WhatsappMessage[];
}

/** Debt detail with days overdue computed */
export interface DebtDetailWithDaysOverdue extends DebtDetail {
  days_overdue?: number;     // computed: today - expiration_date (positive = overdue)
  contact?: Contact;
}
