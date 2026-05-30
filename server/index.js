import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));

// ── Supabase Admin Client (service_role) ──────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const INVITE_EMAIL_WINDOW_MS = 60 * 1000;
const INVITE_EMAIL_MAX_ATTEMPTS = 5;
const inviteRateLimitByActor = new Map();
const RICH_MSG_PREFIX = '__AIC_MSG__';

function enforceInviteRateLimit(actorKey) {
  const now = Date.now();
  const existing = inviteRateLimitByActor.get(actorKey) ?? { count: 0, resetAt: now + INVITE_EMAIL_WINDOW_MS };
  if (now > existing.resetAt) {
    inviteRateLimitByActor.set(actorKey, { count: 1, resetAt: now + INVITE_EMAIL_WINDOW_MS });
    return null;
  }
  if (existing.count >= INVITE_EMAIL_MAX_ATTEMPTS) {
    return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  }
  inviteRateLimitByActor.set(actorKey, { ...existing, count: existing.count + 1 });
  return null;
}

function getInviteUrl(inviteId) {
  const appBaseUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${appBaseUrl}/invite?token=${inviteId}`;
}

function encodeRichMessage(payload) {
  try {
    return `${RICH_MSG_PREFIX}${JSON.stringify(payload)}`;
  } catch {
    return payload?.text || null;
  }
}

const MESSAGE_TEXT_DB_MAX_LEN = 1000;

function buildTemplateRichMessageForDb(payload, fallbackText = '') {
  const safeText = String(payload?.text || fallbackText || '').slice(0, 320);
  const safeTemplateName = String(payload?.template_name || '').slice(0, 120);
  const safeLanguage = String(payload?.language || '').slice(0, 32);
  const safeTs = payload?.ts || new Date().toISOString();

  const candidates = [
    payload,
    {
      kind: 'template',
      template_name: safeTemplateName,
      language: safeLanguage,
      text: safeText,
      ts: safeTs,
      sent_components: Array.isArray(payload?.sent_components) ? payload.sent_components : [],
    },
    {
      kind: 'template',
      template_name: safeTemplateName,
      language: safeLanguage,
      text: safeText || `[TPL] ${safeTemplateName || 'template'}`,
      ts: safeTs,
    },
  ];

  for (const candidate of candidates) {
    const encoded = encodeRichMessage(candidate);
    if (encoded && encoded.length <= MESSAGE_TEXT_DB_MAX_LEN) return encoded;
  }

  return String(safeText || fallbackText || `[TPL] ${safeTemplateName || 'template'}`).slice(0, MESSAGE_TEXT_DB_MAX_LEN);
}

function decodeRichMessage(messageText) {
  const raw = String(messageText || '');
  if (!raw.startsWith(RICH_MSG_PREFIX)) return null;
  try {
    return JSON.parse(raw.slice(RICH_MSG_PREFIX.length));
  } catch {
    return null;
  }
}

async function resolveMetaMediaUrl({ token, mediaId }) {
  if (!token || !mediaId) return null;
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const metaData = await metaRes.json();
    if (!metaRes.ok) return null;
    return metaData?.url || null;
  } catch {
    return null;
  }
}

async function buildInboundRichMessage({ msg, token }) {
  const kind = String(msg?.type || 'text').toLowerCase();
  const timestampIso = msg?.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();

  if (kind === 'text') {
    const text = String(msg?.text?.body || '').trim();
    return {
      message_text: text || 'Mensaje',
      media_url: null,
      payload: {
        kind: 'text',
        text,
        ts: timestampIso,
      },
    };
  }

  if (['image', 'audio', 'video', 'document'].includes(kind)) {
    const mediaNode = msg?.[kind] || {};
    const mediaId = mediaNode?.id || null;
    const mediaUrl = mediaNode?.link || await resolveMetaMediaUrl({ token, mediaId });
    const caption = String(mediaNode?.caption || '').trim();
    const filename = String(mediaNode?.filename || '').trim();
    const mimeType = String(mediaNode?.mime_type || '').trim();

    const preview = caption || filename || `${kind} recibido`;
    return {
      message_text: encodeRichMessage({
        kind,
        caption,
        filename,
        mime_type: mimeType || null,
        media_id: mediaId,
        media_url: mediaUrl,
        text: preview,
        ts: timestampIso,
      }),
      media_url: mediaUrl,
      payload: {
        kind,
        caption,
        filename,
        mime_type: mimeType || null,
        media_id: mediaId,
        media_url: mediaUrl,
        text: preview,
        ts: timestampIso,
      },
    };
  }

  if (kind === 'button') {
    const text = String(msg?.button?.text || 'Respuesta por botón').trim();
    return {
      message_text: encodeRichMessage({ kind: 'button', text, ts: timestampIso }),
      media_url: null,
      payload: { kind: 'button', text, ts: timestampIso },
    };
  }

  if (kind === 'interactive') {
    const btnReply = msg?.interactive?.button_reply;
    const listReply = msg?.interactive?.list_reply;
    const text = String(btnReply?.title || listReply?.title || 'Respuesta interactiva').trim();
    return {
      message_text: encodeRichMessage({ kind: 'interactive', text, ts: timestampIso }),
      media_url: null,
      payload: { kind: 'interactive', text, ts: timestampIso },
    };
  }

  const fallbackText = String(msg?.text?.body || kind || 'Mensaje recibido');
  return {
    message_text: encodeRichMessage({ kind, text: fallbackText, ts: timestampIso }),
    media_url: null,
    payload: { kind, text: fallbackText, ts: timestampIso },
  };
}

// ── Nodemailer transporter (lazy-built from env) ─────────────
function buildSmtpTransporter() {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt((process.env.SMTP_PORT || '587').trim(), 10);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const secure = (process.env.SMTP_SECURE || '').trim() === 'true' || port === 465;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587, // force STARTTLS on port 587
    auth: { user, pass },
    tls: { rejectUnauthorized: false },  // needed in some serverless envs
  });
}

function buildInviteEmailHtml(inviteUrl) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Acceso a AiCobranzas</title></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f4ff;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" border="0"
      style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(79,70,229,.10);max-width:560px;width:100%;">
      <tr>
        <td align="center" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:40px 40px 32px;">
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" style="background:rgba(255,255,255,.15);border-radius:16px;width:64px;height:64px;text-align:center;vertical-align:middle;">
              <span style="font-size:32px;line-height:64px;">&#9889;</span>
            </td></tr></table>
          <p style="margin:20px 0 0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-.3px;">AiCobranzas</p>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.75);letter-spacing:.5px;text-transform:uppercase;">Plataforma de Cobranza Inteligente</p>
        </td>
      </tr>
      <tr>
        <td style="padding:40px 48px 32px;">
          <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1e1b4b;letter-spacing:-.5px;">Tu enlace de acceso</p>
          <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
            Haz clic en el bot&oacute;n para acceder a tu cuenta de forma segura.<br/>
            Este enlace es v&aacute;lido por <strong style="color:#4f46e5;">72 horas</strong> y solo puede usarse una vez.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding:8px 0 32px;">
              <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:12px;letter-spacing:.2px;box-shadow:0 4px 14px rgba(79,70,229,.4);">
                Acceder a AiCobranzas &rarr;
              </a>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="border-top:1px solid #e5e7eb;padding-top:28px;">
              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">&#x00BF;El bot&oacute;n no funciona? Copia y pega este enlace:</p>
              <p style="margin:0;font-size:12px;color:#4f46e5;word-break:break-all;background:#f5f3ff;border-radius:8px;padding:10px 14px;border-left:3px solid #7c3aed;">${inviteUrl}</p>
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 48px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;">
              <p style="margin:0;font-size:12px;color:#92400e;line-height:1.6;">
                &#128274; <strong>Seguridad:</strong> Si no solicitaste este acceso, ignora este correo. Nadie de AiCobranzas te pedir&aacute; tu contrase&ntilde;a.
              </p>
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:24px 48px;border-radius:0 0 16px 16px;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">&copy; 2025 AiCobranzas &middot; Todos los derechos reservados</p>
          <p style="margin:0;font-size:12px;color:#d1d5db;">Este es un mensaje autom&aacute;tico, no respondas a este correo.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function sendInviteEmail(email, rawInviteUrl) {
  // Try to generate a Supabase magic link that redirects to our rawInviteUrl
  // This gives the user a session automatically when they click the link in the email
  let finalInviteUrl = rawInviteUrl;
  try {
    let linkRes = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: { redirectTo: rawInviteUrl }
    });
    // If magiclink fails (e.g. user doesn't exist), try signup
    if (linkRes.error && linkRes.error.message.includes('not found')) {
      linkRes = await supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email: email,
        password: Math.random().toString(36).slice(-10) + 'A1!', // Dummy password for signup link
        options: { redirectTo: rawInviteUrl }
      });
    }
    if (!linkRes.error && linkRes.data?.properties?.action_link) {
      finalInviteUrl = linkRes.data.properties.action_link;
    }
  } catch (err) {
    console.warn('[invite] Failed to generate magic link, falling back to raw url', err);
  }

  // ── Try direct SMTP first (bypasses Supabase GoTrue rate limits on email sending) ──
  const transporter = buildSmtpTransporter();
  if (transporter) {
    try {
      const fromName = process.env.SMTP_FROM_NAME || 'AiCobranzas';
      const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER;
      await transporter.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: email,
        subject: 'Tu acceso a AiCobranzas',
        html: buildInviteEmailHtml(finalInviteUrl),
        text: `Accede a AiCobranzas usando este enlace (válido 72h):\n\n${finalInviteUrl}`,
      });
      return { email_sent: true, email_error: null };
    } catch (smtpErr) {
      console.error('[invite] SMTP send failed:', smtpErr.message);
      return { email_sent: false, email_error: smtpErr.message };
    }
  }

  // ── Fallback: Supabase inviteUserByEmail (has GoTrue rate limits) ──
  const { error: authEmailError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: rawInviteUrl }
  );
  if (authEmailError) {
    const alreadyRegistered =
      authEmailError.message?.toLowerCase().includes('already registered') ||
      authEmailError.message?.toLowerCase().includes('already been registered') ||
      authEmailError.status === 422;
    if (alreadyRegistered) {
      return { email_sent: false, email_error: 'El usuario ya tiene una cuenta. Comparte el enlace de invitación directamente.' };
    }
    return { email_sent: false, email_error: authEmailError.message };
  }
  return { email_sent: true, email_error: null };
}

function computeWindowState(lastInboundAt) {
  if (!lastInboundAt) return { windowOpen: false, windowExpiresAt: null };
  const windowExpiresAt = new Date(new Date(lastInboundAt).getTime() + WINDOW_DURATION_MS).toISOString();
  return {
    windowOpen: new Date(windowExpiresAt).getTime() > Date.now(),
    windowExpiresAt,
  };
}

const PHONE_E164_MIN_LENGTH = 8;
const PHONE_E164_MAX_LENGTH = 15;

/** Canonical phone for DB and Meta `to`: E.164 digits only, no leading +. */
function normalizePhoneCanonical(rawPhone) {
  const raw = String(rawPhone || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  while (digits.startsWith('00')) digits = digits.slice(2);
  // Bolivia: occasional bad export "591" + "0" + 8-digit mobile (12 digits)
  if (digits.startsWith('5910') && digits.length === 12) {
    digits = `591${digits.slice(4)}`;
  }
  if (digits.length < PHONE_E164_MIN_LENGTH || digits.length > PHONE_E164_MAX_LENGTH) return '';
  return digits;
}

/** Meta Cloud API `to` field: E.164 digits only, no leading +. */
function normalizeWhatsAppPhone(rawPhone) {
  return normalizePhoneCanonical(rawPhone);
}

function mapMetaError(metaError = null) {
  const code = Number(metaError?.code || 0) || null;
  const message = String(metaError?.message || 'Meta API Error');

  if (code === 131030 || /not in allowed list/i.test(message)) {
    return {
      code: 'META_RECIPIENT_NOT_ALLOWED',
      message: 'Recipient phone number not in allowed list',
      hint: 'El número no está permitido en la allow list del entorno Meta (modo test). Agrega el destinatario en Meta o usa credenciales de producción.',
      meta_code: code,
    };
  }
  if (code === 131031 || /not registered/i.test(message)) {
    return {
      code: 'META_ACCOUNT_NOT_REGISTERED',
      message: 'The account is not registered',
      hint: 'Meta no reconoce el número como cuenta de WhatsApp activa. Verifica MSISDN exacto y formato E.164.',
      meta_code: code,
    };
  }
  if (code === 132001 || /does not exist in the translation/i.test(message)) {
    return {
      code: 'META_TEMPLATE_LANGUAGE_MISMATCH',
      message: 'Template name does not exist in the translation',
      hint: 'El idioma enviado no coincide con el idioma aprobado para esa plantilla en Meta. Sincroniza plantillas y usa el language exacto de Meta.',
      meta_code: code,
    };
  }
  return {
    code: 'META_SEND_ERROR',
    message,
    hint: null,
    meta_code: code,
  };
}

async function findContactIdByTenantAndPhone(tenantId, rawPhone) {
  const digits = normalizeWhatsAppPhone(rawPhone);
  if (!digits) return null;
  const variants = Array.from(new Set([
    String(rawPhone || '').trim(),
    digits,
    `+${digits}`,
  ].filter(Boolean)));
  for (const v of variants) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone_number', v)
      .is('deleted_at', null)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  const { data: rows } = await supabaseAdmin
    .from('contacts')
    .select('id, phone_number')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .limit(2000);
  const found = (rows || []).find((r) => normalizeWhatsAppPhone(r.phone_number) === digits);
  return found?.id || null;
}

async function resolveContactAndThread({ tenantId, phoneNumber, userId, seedLastMessage }) {
  let contactId = null;
  const canonicalPhone = normalizeWhatsAppPhone(phoneNumber) || String(phoneNumber || '').trim();
  contactId = await findContactIdByTenantAndPhone(tenantId, phoneNumber);

  if (contactId) {
    // found
  } else {
    const { data: newContact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        name: canonicalPhone,
        phone_number: canonicalPhone,
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single();
    if (contactError || !newContact?.id) throw new Error(contactError?.message || 'Could not create contact');
    contactId = newContact.id;
  }

  let threadId = null;
  const { data: existingThread } = await supabaseAdmin
    .from('whatsapp_threads')
    .select('id')
    .eq('contact_id', contactId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingThread?.id) {
    threadId = existingThread.id;
  } else {
    const { data: newThread, error: threadError } = await supabaseAdmin
      .from('whatsapp_threads')
      .insert({
        contact_id: contactId,
        tenant_id: tenantId,
        last_message: seedLastMessage ?? null,
        last_interaction: new Date().toISOString(),
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single();
    if (threadError || !newThread?.id) throw new Error(threadError?.message || 'Could not create thread');
    threadId = newThread.id;
  }

  return { contactId, threadId };
}

async function getConversationWindowState({ tenantId, phoneNumber, explicitThreadId = null }) {
  let threadId = explicitThreadId;

  if (!threadId) {
    const contactId = await findContactIdByTenantAndPhone(tenantId, phoneNumber);
    if (!contactId) return { threadId: null, lastInboundAt: null, windowOpen: false, windowExpiresAt: null };

    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', contactId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!contact?.id) return { threadId: null, lastInboundAt: null, windowOpen: false, windowExpiresAt: null };

    const { data: thread } = await supabaseAdmin
      .from('whatsapp_threads')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contact.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!thread?.id) return { threadId: null, lastInboundAt: null, windowOpen: false, windowExpiresAt: null };
    threadId = thread.id;
  }

  const { data: lastInboundMsg } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('sent_at, created_at')
    .eq('whatsapp_thread_id', threadId)
    .eq('incoming', true)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastInboundAt = lastInboundMsg?.sent_at || lastInboundMsg?.created_at || null;
  const { windowOpen, windowExpiresAt } = computeWindowState(lastInboundAt);
  return { threadId, lastInboundAt, windowOpen, windowExpiresAt };
}

// ── Middleware: validate service token ────────────────────────
// Frontend sends its own JWT; we verify it's a valid Superadmin session
async function requireSuperadmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authorization header' });
  }
  const token = authHeader.split(' ')[1];

  // Verify JWT with Supabase
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  // Check role in users table
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('role, tenant_id, enabled')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'Superadmin' || !profile.enabled) {
    return res.status(403).json({ error: 'Forbidden: Superadmin only' });
  }

  req.adminUser = { ...user, profile };
  next();
}

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const refMatch = supabaseUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  const supabaseRef = refMatch?.[1] ?? null;

  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
    env: {
      supabaseRef,
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasFrontendUrl: Boolean(process.env.FRONTEND_URL),
      nodeEnv: process.env.NODE_ENV ?? null,
      smtp: {
        hasHost: Boolean(process.env.SMTP_HOST),
        host: process.env.SMTP_HOST || null,
        port: process.env.SMTP_PORT || null,
        secure: process.env.SMTP_SECURE || null,
        hasUser: Boolean(process.env.SMTP_USER),
        hasPass: Boolean(process.env.SMTP_PASS),
        from: process.env.SMTP_FROM || null,
      },
    },
  });
});

// ── SMTP connection test ───────────────────────────────────────
app.get('/health/smtp', async (req, res) => {
  const transporter = buildSmtpTransporter();
  if (!transporter) {
    return res.status(503).json({
      ok: false,
      error: 'SMTP not configured — missing SMTP_HOST, SMTP_USER or SMTP_PASS env vars',
      vars: {
        SMTP_HOST: process.env.SMTP_HOST || null,
        SMTP_PORT: process.env.SMTP_PORT || null,
        SMTP_USER: process.env.SMTP_USER || null,
        SMTP_PASS: process.env.SMTP_PASS ? '***set***' : null,
      },
    });
  }
  try {
    await transporter.verify();
    return res.json({ ok: true, message: 'SMTP connection verified OK' });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message });
  }
});

const AUTH_BOOTSTRAP_WINDOW_MS = 60 * 1000;
const AUTH_BOOTSTRAP_MAX_ATTEMPTS = 20;
const authBootstrapRateLimitByUser = new Map();

function enforceAuthBootstrapRateLimit(userId) {
  const now = Date.now();
  const existing = authBootstrapRateLimitByUser.get(userId) ?? { count: 0, resetAt: now + AUTH_BOOTSTRAP_WINDOW_MS };
  if (now > existing.resetAt) {
    authBootstrapRateLimitByUser.set(userId, { count: 1, resetAt: now + AUTH_BOOTSTRAP_WINDOW_MS });
    return null;
  }
  if (existing.count >= AUTH_BOOTSTRAP_MAX_ATTEMPTS) {
    return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  }
  authBootstrapRateLimitByUser.set(userId, { ...existing, count: existing.count + 1 });
  return null;
}

/**
 * POST /auth/bootstrap
 * Headers: Authorization Bearer <Supabase access token>
 * Creates public.users profile if missing (OAuth/password parity).
 */
app.post('/auth/bootstrap', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No authorization header' });
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const refMatch = supabaseUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
    const supabaseRef = refMatch?.[1] ?? null;
    return res.status(401).json({
      error: 'Invalid token',
      detail: error?.message ?? null,
      supabaseRef,
    });
  }

  const retryAfter = enforceAuthBootstrapRateLimit(user.id);
  if (retryAfter) return res.status(429).json({ error: `Rate limit exceeded. Retry in ${retryAfter}s` });

  const email = (user.email ?? '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Auth user has no email' });

  const { data: existing, error: readError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) return res.status(500).json({ error: readError.message });
  if (existing?.id) return res.json({ created: false });

  const name =
    user.user_metadata?.full_name
    || user.user_metadata?.name
    || email.split('@')[0]
    || 'Usuario';

  const { error: insertError } = await supabaseAdmin
    .from('users')
    .insert({
      id: user.id,
      name,
      email,
      role: 'Agente',
      tenant_id: null,
      enabled: true,
    });
  if (insertError) return res.status(500).json({ error: insertError.message });
  return res.status(201).json({ created: true });
});

function verifyMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return false;
  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !signature.startsWith('sha256=')) return false;
  const incoming = signature.slice('sha256='.length);
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || Buffer.from(JSON.stringify(req.body || {})))
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(incoming, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function shouldEnforceMetaSignature() {
  const mode = String(process.env.META_WEBHOOK_SIGNATURE_MODE || 'warn').toLowerCase();
  return mode === 'strict';
}

app.get('/webhooks/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe' || !challenge || !token) return res.status(400).send('Invalid webhook challenge');

  // Use verify token stored in whatsapp_configurations (app-level webhook setup),
  // fallback to env token for backward compatibility.
  (async () => {
    const { data: cfg } = await supabaseAdmin
      .from('whatsapp_configurations')
      .select('id')
      .eq('verify_token', String(token))
      .is('deleted_at', null)
      .maybeSingle();

    const envVerifyToken = process.env.META_VERIFY_TOKEN;
    const isValid = Boolean(cfg) || (!!envVerifyToken && token === envVerifyToken);
    if (!isValid) return res.status(403).send('Forbidden');
    return res.status(200).send(String(challenge));
  })().catch(() => res.status(500).send('Webhook verification error'));
});

app.post('/webhooks/meta', async (req, res) => {
  const startedAt = Date.now();
  console.log('[webhook] POST /webhooks/meta received');

  try {
    const payload = req.body ?? {};
    console.log('[webhook] object:', payload.object, '| entries:', Array.isArray(payload.entry) ? payload.entry.length : 0);

    // Signature check — only enforced when META_APP_SECRET is set
    if (process.env.META_APP_SECRET) {
      if (!verifyMetaSignature(req)) {
        if (shouldEnforceMetaSignature()) {
          console.warn('[webhook] invalid signature — rejecting (strict mode)');
          return res.status(200).json({ ok: true, note: 'invalid_signature' });
        }
        console.warn('[webhook] invalid signature — continuing (warn mode)');
      } else {
        console.log('[webhook] signature OK');
      }
    } else {
      console.log('[webhook] META_APP_SECRET not set — skipping signature check');
    }

    if (!Array.isArray(payload.entry)) {
      console.log('[webhook] no entries — done');
      return res.status(200).json({ ok: true });
    }

    for (const entry of payload.entry) {
      for (const change of (entry.changes ?? [])) {
        const value = change.value ?? {};
        const phoneNumberId = value.metadata?.phone_number_id;
        console.log('[webhook] change field:', change.field, '| phone_number_id:', phoneNumberId);

        // ── 1. Find tenant config by the receiving phone_number_id ──
        let config = null;
        if (phoneNumberId) {
          const { data, error: cfgErr } = await supabaseAdmin
            .from('whatsapp_configurations')
            .select('id, tenant_id, token')
            .eq('phone_number_id', phoneNumberId)
            .is('deleted_at', null)
            .maybeSingle();
          config = data;
          if (cfgErr) console.error('[webhook] config lookup error:', cfgErr.message);
          console.log('[webhook] config found:', config ? `tenant=${config.tenant_id}` : 'null — no match for phone_number_id');
        }

        // ── 2. Handle incoming messages ────────────────────────────
        if (Array.isArray(value.messages)) {
          console.log('[webhook] messages count:', value.messages.length);
          for (const msg of value.messages) {
            const from = msg.from;
            const fromPhone = normalizeWhatsAppPhone(from);
            const inbound = await buildInboundRichMessage({ msg, token: config?.token || null });
            const text = inbound.payload?.text || msg.text?.body || msg.type || '';
            console.log('[webhook] msg from:', from, '| normalized:', fromPhone, '| type:', msg.type, '| text:', text.slice(0, 80));

            if (!config || !fromPhone) {
              console.warn('[webhook] skipping message — no config or no from');
              continue;
            }

            const tenantId = config.tenant_id;

            // Upsert contact
            let contactId;
            const { data: existingContact, error: cErr } = await supabaseAdmin
              .from('contacts')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('phone_number', fromPhone)
              .is('deleted_at', null)
              .maybeSingle();
            if (cErr) console.error('[webhook] contact lookup error:', cErr.message);

            if (existingContact) {
              contactId = existingContact.id;
              await supabaseAdmin.from('contacts').update({ last_interaction: new Date().toISOString() }).eq('id', contactId);
              console.log('[webhook] existing contact:', contactId);
            } else {
              const displayName = value.contacts?.[0]?.profile?.name ?? from;
              const { data: newContact, error: ncErr } = await supabaseAdmin
                .from('contacts')
                .insert({ name: displayName, phone_number: fromPhone, tenant_id: tenantId })
                .select('id')
                .single();
              if (ncErr) console.error('[webhook] contact insert error:', ncErr.message);
              contactId = newContact?.id;
              console.log('[webhook] created contact:', contactId, 'name:', displayName);
            }
            if (!contactId) { console.error('[webhook] no contactId, skipping'); continue; }

            // Upsert thread
            let threadId;
            const { data: existingThread, error: tErr } = await supabaseAdmin
              .from('whatsapp_threads')
              .select('id')
              .eq('contact_id', contactId)
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .maybeSingle();
            if (tErr) console.error('[webhook] thread lookup error:', tErr.message);

            if (existingThread) {
              threadId = existingThread.id;
            } else {
              // Avoid duplicate threads: create-or-reuse via upsert
              const { data: upsertedThread, error: ntErr } = await supabaseAdmin
                .from('whatsapp_threads')
                .upsert(
                  { contact_id: contactId, tenant_id: tenantId, last_message: text, last_interaction: new Date().toISOString() },
                  { onConflict: 'tenant_id,contact_id' }
                )
                .select('id')
                .single();
              if (ntErr) console.error('[webhook] thread upsert error:', ntErr.message);
              threadId = upsertedThread?.id;
              console.log('[webhook] upserted thread:', threadId);
            }
            if (!threadId) { console.error('[webhook] no threadId, skipping'); continue; }

            // Insert message
            const { error: msgErr } = await supabaseAdmin
              .from('whatsapp_messages')
              .insert({
                whatsapp_thread_id: threadId,
                  message_text: inbound.message_text,
                  media_url: inbound.media_url,
                incoming: true,
                read: false,
                sent_at: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
              });
            if (msgErr) console.error('[webhook] message insert error:', msgErr.message);
            else console.log('[webhook] message saved OK in thread:', threadId);

            // Update thread snapshot
            const inboundAtIso = msg.timestamp
              ? new Date(Number(msg.timestamp) * 1000).toISOString()
              : new Date().toISOString();
            const inboundWindow = computeWindowState(inboundAtIso);

            await supabaseAdmin
              .from('whatsapp_threads')
              .update({
                last_message: text,
                last_interaction: new Date().toISOString(),
                last_inbound_at: inboundAtIso,
                window_open: inboundWindow.windowOpen,
                window_expires_at: inboundWindow.windowExpiresAt,
              })
              .eq('id', threadId);

            await emitNotificationEvent({
              tenantId,
              actorUserId: null,
              eventType: NOTIFICATION_EVENT_TYPES.THREAD_INBOUND_MESSAGE,
              entityType: 'whatsapp_thread',
              entityId: threadId,
              payload: {
                thread_id: threadId,
                contact_id: contactId,
                contact_phone: from,
                preview: String(text || '').slice(0, 120),
              },
              roles: ['Agente', 'Admin'],
              title: `Nuevo mensaje de ${value.contacts?.[0]?.profile?.name || from}`,
              body: String(text || '').slice(0, 180) || 'Nuevo mensaje recibido en bandeja.',
              severity: 'info',
              actionUrl: '/bandeja',
            }).catch((error) => console.error('[notifications] inbound message emit error:', error.message));
          }
        }

        // ── 3. Handle status updates ────────────────────────────────
        if (Array.isArray(value.statuses) && config) {
          for (const status of value.statuses) {
            console.log('[webhook] status update:', status.status, 'recipient:', status.recipient_id);
            if (status.status === 'read') {
              const { data: contact } = await supabaseAdmin
                .from('contacts').select('id').eq('tenant_id', config.tenant_id).eq('phone_number', status.recipient_id).maybeSingle();
              if (contact) {
                const { data: thread } = await supabaseAdmin
                  .from('whatsapp_threads').select('id').eq('contact_id', contact.id).maybeSingle();
                if (thread) {
                  await supabaseAdmin.from('whatsapp_messages')
                    .update({ read: true, read_at: new Date().toISOString() })
                    .eq('whatsapp_thread_id', thread.id).eq('incoming', false).eq('read', false);
                }
              }
            }
          }
        }
      }
    }

    console.log('[webhook] done in', Date.now() - startedAt, 'ms');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook] fatal error:', err?.message || err);
    return res.status(200).json({ ok: true, error: err?.message }); // always 200 to Meta
  }
});

// ════════════════════════════════════════════════════════════════
// META API PROXY — Send outbound message
// ════════════════════════════════════════════════════════════════


/**
 * POST /api/meta/messages/send
 * Sends a free-form text message to a contact via Meta Cloud API
 * and stores the outbound record in whatsapp_messages.
 * Body: { phone_number, message_text, thread_id? }
 */
app.post('/api/meta/messages/send', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId, userId } = req.workspaceAdmin;
  const { phone_number, message_text, thread_id } = req.body;

  if (!phone_number || !message_text) {
    return res.status(400).json({ error: 'phone_number and message_text are required' });
  }

  const toPhone = normalizeWhatsAppPhone(phone_number);
  if (!toPhone) {
    return res.status(400).json({ error: 'Invalid phone_number: use E.164 (ej. 59169160323 o +59169160323)' });
  }

  try {
    // 1. Get WhatsApp config for tenant
    const { data: config, error: configError } = await supabaseAdmin
      .from('whatsapp_configurations')
      .select('id, phone_number_id, token, tenant_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (configError || !config?.phone_number_id) {
      return res.status(400).json({ error: 'WhatsApp not configured or phone_number_id missing' });
    }

    const windowState = await getConversationWindowState({
      tenantId,
      phoneNumber: toPhone,
      explicitThreadId: thread_id || null,
    });
    if (!windowState.windowOpen) {
      return res.status(409).json({
        error: 'WINDOW_CLOSED',
        message: 'Ventana de 24h cerrada. Usa una plantilla aprobada.',
        window_open: false,
        window_expires_at: windowState.windowExpiresAt,
        last_inbound_at: windowState.lastInboundAt,
      });
    }

    // 2. Send via Meta Cloud API
    const metaRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${config.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'text',
          text: { preview_url: false, body: message_text },
        }),
      }
    );

    const metaData = await metaRes.json();
    if (!metaRes.ok) {
      const mapped = mapMetaError(metaData.error);
      return res.status(metaRes.status).json({
        error: mapped.message,
        code: mapped.code,
        hint: mapped.hint,
        details: metaData.error,
      });
    }

    // 3. Resolve or create thread
    let resolvedThreadId = thread_id;
    if (!resolvedThreadId) {
      const resolved = await resolveContactAndThread({
        tenantId,
        phoneNumber: toPhone,
        userId,
        seedLastMessage: message_text,
      });
      resolvedThreadId = resolved.threadId;
    }

    // 4. Store outbound message
    if (resolvedThreadId) {
      const { data: saved, error: saveError } = await supabaseAdmin
        .from('whatsapp_messages')
        .insert({
          whatsapp_thread_id: resolvedThreadId,
          message_text,
          incoming: false,
          read: false,
          sent_at: new Date().toISOString(),
          created_by: userId,
          updated_by: userId,
        })
        .select()
        .single();
      if (saveError || !saved?.id) {
        return res.status(500).json({ error: saveError?.message || 'Could not persist outbound message in whatsapp_messages' });
      }

      // Update thread snapshot
      await supabaseAdmin
        .from('whatsapp_threads')
        .update({
          last_message: message_text,
          last_interaction: new Date().toISOString(),
          window_open: true,
          window_expires_at: windowState.windowExpiresAt,
          last_inbound_at: windowState.lastInboundAt,
          updated_by: userId,
        })
        .eq('id', resolvedThreadId);

      return res.status(201).json({ success: true, message: saved, wa_response: metaData });
    }

    return res.status(201).json({ success: true, wa_response: metaData });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/meta/messages/send-template
 * Body: { phone_number, template_id?, template_name?, language?, template_parameters?, thread_id? }
 */
app.post('/api/meta/messages/send-template', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId, userId } = req.workspaceAdmin;
  const { phone_number, template_id, template_name, language, template_parameters, thread_id } = req.body || {};

  if (!phone_number) return res.status(400).json({ error: 'phone_number is required' });
  if (!template_id && !template_name) {
    return res.status(400).json({ error: 'template_id or template_name is required' });
  }

  const toPhone = normalizeWhatsAppPhone(phone_number);
  if (!toPhone) {
    return res.status(400).json({ error: 'Invalid phone_number: use E.164 (ej. 59169160323 o +59169160323)' });
  }

  try {
    const { data: config, error: configError } = await supabaseAdmin
      .from('whatsapp_configurations')
      .select('id, phone_number_id, token, default_template_language')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();

    if (configError || !config?.phone_number_id) {
      return res.status(400).json({ error: 'WhatsApp not configured or phone_number_id missing' });
    }

    let templateQuery = supabaseAdmin
      .from('whatsapp_templates')
      .select('id, template_name, language, meta_status, whatsapp_configuration_id, components')
      .eq('whatsapp_configuration_id', config.id)
      .eq('meta_status', 'APPROVED')
      .is('deleted_at', null)
      .limit(1);

    if (template_id) templateQuery = templateQuery.eq('id', String(template_id));
    else templateQuery = templateQuery.eq('template_name', String(template_name));

    const { data: approvedTemplate, error: templateError } = await templateQuery.maybeSingle();
    if (templateError || !approvedTemplate) {
      return res.status(400).json({ error: 'Approved template not found for this workspace' });
    }

    let effectiveParams = Array.isArray(template_parameters) ? template_parameters.map((v) => String(v ?? '')) : [];
    const templateNameLower = String(approvedTemplate.template_name || '').toLowerCase();
    if (templateNameLower === 'payment_overdue_2' && effectiveParams.length === 0) {
      effectiveParams = await resolvePaymentOverdue2Params({ tenantId, phoneNumber: toPhone });
    }

    let components;
    if (effectiveParams.length > 0) {
      components = [{
        type: 'body',
        parameters: effectiveParams.map((value) => ({ type: 'text', text: String(value) })),
      }];
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhone,
      type: 'template',
      template: {
        name: approvedTemplate.template_name,
        language: { code: String(language || approvedTemplate.language || config.default_template_language || 'es_LA') },
        ...(components ? { components } : {}),
      },
    };

    const metaRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${config.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const metaData = await metaRes.json();
    if (!metaRes.ok) {
      const mapped = mapMetaError(metaData.error);
      return res.status(metaRes.status).json({
        error: mapped.message,
        code: mapped.code,
        hint: mapped.hint,
        details: metaData.error,
      });
    }

    let resolvedThreadId = thread_id;
    if (!resolvedThreadId) {
      const resolved = await resolveContactAndThread({
        tenantId,
        phoneNumber: toPhone,
        userId,
        seedLastMessage: `[TPL] ${approvedTemplate.template_name}`,
      });
      resolvedThreadId = resolved.threadId;
    }

    const savedText = `[TPL] ${approvedTemplate.template_name}`;
    const templatePreviewBody = components?.[0]?.parameters?.map((p) => p?.text).filter(Boolean).join(' | ') || '';
    const richTemplatePayload = buildTemplateRichMessageForDb({
      kind: 'template',
      template_name: approvedTemplate.template_name,
      language: String(language || approvedTemplate.language || config.default_template_language || 'es_LA'),
      template_components: approvedTemplate.components || [],
      sent_components: components || [],
      text: templatePreviewBody || savedText,
      ts: new Date().toISOString(),
    }, savedText);
    const { data: saved, error: saveError } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        whatsapp_thread_id: resolvedThreadId,
        message_text: richTemplatePayload,
        incoming: false,
        read: false,
        sent_at: new Date().toISOString(),
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (saveError || !saved?.id) {
      return res.status(500).json({ error: saveError?.message || 'Could not persist template message in whatsapp_messages' });
    }

    const windowState = await getConversationWindowState({
      tenantId,
      phoneNumber: toPhone,
      explicitThreadId: resolvedThreadId || null,
    });

    await supabaseAdmin
      .from('whatsapp_threads')
      .update({
        last_message: savedText,
        last_interaction: new Date().toISOString(),
        window_open: windowState.windowOpen,
        window_expires_at: windowState.windowExpiresAt,
        last_inbound_at: windowState.lastInboundAt,
        updated_by: userId,
      })
      .eq('id', resolvedThreadId);

    return res.status(201).json({
      success: true,
      message: saved,
      wa_response: metaData,
      template_name: approvedTemplate.template_name,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/meta/media/:mediaId
 * Secure proxy for WhatsApp media that requires workspace membership.
 * Prevents exposing Graph API auth errors in the browser.
 */
app.get('/api/meta/media/:mediaId', requireWorkspaceMember, async (req, res) => {
  const { tenantId } = req.workspaceMember;
  const mediaId = String(req.params.mediaId || '').trim();
  if (!mediaId) return res.status(400).json({ error: 'mediaId is required' });

  try {
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from('whatsapp_configurations')
      .select('token')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (cfgErr || !config?.token) {
      return res.status(400).json({ error: 'WhatsApp configuration token not found for workspace' });
    }

    const headers = { Authorization: `Bearer ${config.token}` };
    const metaRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(mediaId)}`,
      { headers }
    );
    const metaData = await metaRes.json();
    if (!metaRes.ok || !metaData?.url) {
      return res.status(metaRes.status || 400).json({ error: metaData?.error?.message || 'Unable to resolve media URL' });
    }

    const fileRes = await fetch(metaData.url, { headers });
    if (!fileRes.ok) {
      const fallback = await fileRes.text().catch(() => '');
      return res.status(fileRes.status || 400).json({ error: fallback || 'Unable to download media file' });
    }

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected media proxy error' });
  }
});

function toDayKey(isoDate) {
  return new Date(isoDate).toISOString().slice(0, 10);
}

function conversationStateFromLastInteraction(lastInteraction) {
  if (!lastInteraction) return 'pendiente';
  const hrs = (Date.now() - new Date(lastInteraction).getTime()) / 3_600_000;
  if (hrs < 1) return 'activo';
  if (hrs < 48) return 'pendiente';
  return 'resuelto';
}

function extractTemplateName(messageText) {
  const rich = decodeRichMessage(messageText);
  if (rich?.kind === 'template' && rich?.template_name) return String(rich.template_name).trim();
  const text = String(messageText || '').trim();
  if (!text.startsWith('[TPL]')) return null;
  return text.replace(/^\[TPL\]\s*/i, '').trim() || null;
}

function normalizeMassSendFilters(input = {}) {
  const normalizeIds = (value) => {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((id) => String(id || '').trim()).filter(Boolean)));
  };
  return {
    min_days_overdue: Number.isFinite(Number(input.min_days_overdue)) ? Number(input.min_days_overdue) : null,
    max_days_overdue: Number.isFinite(Number(input.max_days_overdue)) ? Number(input.max_days_overdue) : null,
    min_amount_due: Number.isFinite(Number(input.min_amount_due)) ? Number(input.min_amount_due) : null,
    max_amount_due: Number.isFinite(Number(input.max_amount_due)) ? Number(input.max_amount_due) : null,
    debt_status: input.debt_status ? String(input.debt_status) : null,
    included_contact_ids: normalizeIds(input.included_contact_ids),
    excluded_contact_ids: normalizeIds(input.excluded_contact_ids),
  };
}

const NOTIFICATION_EVENT_TYPES = {
  MASS_SEND_FAILED: 'mass_send_failed',
  THREAD_INBOUND_MESSAGE: 'thread_inbound_message',
  DEBT_OVERDUE_THRESHOLD: 'debt_overdue_threshold',
};

async function resolveNotificationRecipients({ tenantId, audience = 'all_members', roles = [], userIds = [] }) {
  if (audience === 'users' && userIds.length > 0) {
    return Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
  }
  let query = supabaseAdmin
    .from('tenant_members')
    .select('user_id, role, enabled')
    .eq('tenant_id', tenantId)
    .eq('enabled', true);
  if (roles.length > 0) query = query.in('role', roles);
  const { data = [], error } = await query;
  if (error) throw new Error(error.message);
  return Array.from(new Set(data.map((row) => row.user_id)));
}

async function isInAppNotificationEnabled({ tenantId, userId, eventType }) {
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('enabled_in_app')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return true;
  if (!data) return true;
  return Boolean(data.enabled_in_app);
}

async function emitNotificationEvent({
  tenantId,
  actorUserId = null,
  eventType,
  entityType = null,
  entityId = null,
  payload = {},
  audience = 'all_members',
  roles = [],
  userIds = [],
  title,
  body,
  severity = 'info',
  actionUrl = null,
}) {
  const recipients = await resolveNotificationRecipients({ tenantId, audience, roles, userIds });
  if (recipients.length === 0) return { event: null, notificationsCreated: 0 };

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from('notification_events')
    .insert({
      tenant_id: tenantId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      payload,
      created_by: actorUserId,
      updated_by: actorUserId,
    })
    .select()
    .single();
  if (eventError || !eventRow) throw new Error(eventError?.message || 'Could not create notification event');

  const notificationRows = [];
  for (const recipientId of recipients) {
    const enabled = await isInAppNotificationEnabled({ tenantId, userId: recipientId, eventType });
    if (!enabled) continue;
    notificationRows.push({
      tenant_id: tenantId,
      user_id: recipientId,
      event_id: eventRow.id,
      title,
      body,
      severity,
      action_url: actionUrl,
      is_read: false,
      created_by: actorUserId,
      updated_by: actorUserId,
    });
  }

  if (notificationRows.length > 0) {
    const { error: notifError } = await supabaseAdmin.from('notifications').insert(notificationRows);
    if (notifError) throw new Error(notifError.message);
  }

  return { event: eventRow, notificationsCreated: notificationRows.length };
}

async function resolveApprovedTemplateForTenant({ tenantId, templateId, templateName }) {
  const { data: config, error: configError } = await supabaseAdmin
    .from('whatsapp_configurations')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .single();
  if (configError || !config) throw new Error('WhatsApp config not found');

  let query = supabaseAdmin
    .from('whatsapp_templates')
    .select('id, template_name, language, meta_status, components')
    .eq('whatsapp_configuration_id', config.id)
    .eq('meta_status', 'APPROVED')
    .is('deleted_at', null)
    .limit(1);

  if (templateId) query = query.eq('id', String(templateId));
  else if (templateName) query = query.eq('template_name', String(templateName));
  else throw new Error('template_id or template_name is required');

  const { data: approvedTemplate, error: templateError } = await query.maybeSingle();
  if (templateError || !approvedTemplate) throw new Error('Approved template not found for this workspace');
  return approvedTemplate;
}

function formatTemplateDate(dateValue) {
  const d = new Date(dateValue);
  if (!Number.isFinite(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function toTemplateMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');
}

async function resolvePaymentOverdue2Params({ tenantId, contactId = null, phoneNumber = null }) {
  let effectiveContactId = contactId;
  if (!effectiveContactId && phoneNumber) {
    effectiveContactId = await findContactIdByTenantAndPhone(tenantId, phoneNumber);
  }
  if (!effectiveContactId) {
    throw new Error('No se pudo resolver el contacto para payment_overdue_2');
  }

  const { data: contact, error: contactError } = await supabaseAdmin
    .from('contacts')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('id', effectiveContactId)
    .is('deleted_at', null)
    .maybeSingle();
  if (contactError || !contact) throw new Error(contactError?.message || 'Contacto no encontrado');

  const { data: details = [], error: detailsError } = await supabaseAdmin
    .from('debt_details')
    .select('id, debt_description, total, expiration_date, debt_status')
    .eq('contact_id', effectiveContactId)
    .is('deleted_at', null)
    .in('debt_status', ['Pending', 'Active', 'Expired'])
    .order('expiration_date', { ascending: true, nullsFirst: false })
    .limit(1);
  if (detailsError) throw new Error(detailsError.message);
  const detail = details[0];
  if (!detail) throw new Error('No hay deuda pendiente/activa para payment_overdue_2');

  return [
    String(contact.name || 'Cliente'),
    String(detail.debt_description || `DEUDA-${String(detail.id).slice(0, 8)}`),
    toTemplateMoney(detail.total),
    formatTemplateDate(detail.expiration_date),
  ];
}

async function buildMassSendCandidates({ tenantId, filters, sampleLimit = 20 }) {
  const normalizedFilters = normalizeMassSendFilters(filters || {});
  let debtsQuery = supabaseAdmin
    .from('debts')
    .select(`
      id,
      contact_id,
      total_pending,
      debt_status,
      contacts!inner(id, name, phone_number)
    `)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (normalizedFilters.debt_status) debtsQuery = debtsQuery.eq('debt_status', normalizedFilters.debt_status);
  if (normalizedFilters.min_amount_due !== null) debtsQuery = debtsQuery.gte('total_pending', normalizedFilters.min_amount_due);
  if (normalizedFilters.max_amount_due !== null) debtsQuery = debtsQuery.lte('total_pending', normalizedFilters.max_amount_due);

  const { data: debtsRows = [], error: debtsError } = await debtsQuery;
  if (debtsError) throw new Error(debtsError.message);

  const contactsMap = new Map();
  for (const debt of debtsRows) {
    const phone = normalizePhoneCanonical(debt.contacts?.phone_number);
    if (!phone) continue;
    const existing = contactsMap.get(debt.contact_id);
    if (!existing || Number(debt.total_pending || 0) > Number(existing.total_pending || 0)) {
      contactsMap.set(debt.contact_id, {
        contact_id: debt.contact_id,
        phone_number: phone,
        contact_name: debt.contacts?.name || phone,
        total_pending: Number(debt.total_pending || 0),
        debt_status: debt.debt_status,
      });
    }
  }

  const contactIds = Array.from(contactsMap.keys());
  let maxOverdueByContact = new Map();
  if (contactIds.length > 0) {
    const { data: detailRows = [], error: detailsError } = await supabaseAdmin
      .from('debt_details')
      .select('contact_id, expiration_date, debt_status')
      .in('contact_id', contactIds)
      .is('deleted_at', null);
    if (detailsError) throw new Error(detailsError.message);

    const now = Date.now();
    for (const row of detailRows) {
      if (String(row.debt_status || '').toLowerCase() === 'paid') continue;
      const expirationTs = new Date(row.expiration_date).getTime();
      if (!Number.isFinite(expirationTs)) continue;
      const overdue = Math.max(0, Math.floor((now - expirationTs) / 86_400_000));
      const curr = maxOverdueByContact.get(row.contact_id) || 0;
      if (overdue > curr) maxOverdueByContact.set(row.contact_id, overdue);
    }
  }

  let candidates = Array.from(contactsMap.values()).map((item) => ({
    ...item,
    max_days_overdue: maxOverdueByContact.get(item.contact_id) || 0,
  }));

  if (normalizedFilters.min_days_overdue !== null) {
    candidates = candidates.filter((item) => item.max_days_overdue >= normalizedFilters.min_days_overdue);
  }
  if (normalizedFilters.max_days_overdue !== null) {
    candidates = candidates.filter((item) => item.max_days_overdue <= normalizedFilters.max_days_overdue);
  }

  // Manual include must override debt filters; add contacts after all filter gates.
  const existingContactIds = new Set(candidates.map((item) => item.contact_id));
  const manualIncludedIds = (normalizedFilters.included_contact_ids || []).filter((id) => !existingContactIds.has(id));
  if (manualIncludedIds.length > 0) {
    const { data: manualContacts = [], error: manualContactsError } = await supabaseAdmin
      .from('contacts')
      .select('id, name, phone_number')
      .eq('tenant_id', tenantId)
      .in('id', manualIncludedIds)
      .is('deleted_at', null);
    if (manualContactsError) throw new Error(manualContactsError.message);

    for (const contact of manualContacts) {
      const phone = normalizePhoneCanonical(contact.phone_number);
      if (!phone) continue;
      candidates.push({
        contact_id: contact.id,
        phone_number: phone,
        contact_name: contact.name || phone,
        total_pending: 0,
        debt_status: 'manual_include',
        max_days_overdue: 0,
      });
    }
  }

  if (normalizedFilters.excluded_contact_ids.length > 0) {
    const excludedSet = new Set(normalizedFilters.excluded_contact_ids);
    candidates = candidates.filter((item) => !excludedSet.has(item.contact_id));
  }

  candidates.sort((a, b) => b.total_pending - a.total_pending);
  return {
    filters: normalizedFilters,
    total: candidates.length,
    sample: candidates.slice(0, sampleLimit),
    candidates,
  };
}

/**
 * GET /api/meta/metrics
 * Query: from, to, conversation_state?, message_type?, window_state?, template?, search?
 */
app.get('/api/meta/metrics', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId } = req.workspaceAdmin;
  const {
    from,
    to,
    conversation_state,
    message_type,
    window_state,
    template,
    search,
  } = req.query || {};

  const fromIso = from ? new Date(String(from)).toISOString() : null;
  const toIso = to ? new Date(String(to)).toISOString() : null;

  if (!fromIso || !toIso || Number.isNaN(new Date(fromIso).getTime()) || Number.isNaN(new Date(toIso).getTime())) {
    return res.status(400).json({ error: 'Valid from/to query params are required (ISO date)' });
  }
  if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
    return res.status(400).json({ error: 'from date must be before to date' });
  }

  const normalizedSearch = String(search || '').trim().toLowerCase();
  const normalizedTemplate = String(template || '').trim().toLowerCase();
  const normalizedConversationState = String(conversation_state || '').trim().toLowerCase();
  const normalizedMessageType = String(message_type || '').trim().toLowerCase(); // all | text | template
  const normalizedWindowState = String(window_state || '').trim().toLowerCase(); // all | open | closed

  try {
    const { data: threadsData, error: threadsError } = await supabaseAdmin
      .from('whatsapp_threads')
      .select(`
        id,
        contact_id,
        last_interaction,
        window_open,
        contacts(name, phone_number)
      `)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (threadsError) return res.status(500).json({ error: threadsError.message });
    const threads = threadsData || [];

    const filteredThreads = threads.filter((thread) => {
      const state = conversationStateFromLastInteraction(thread.last_interaction);
      if (normalizedConversationState && normalizedConversationState !== 'all' && state !== normalizedConversationState) {
        return false;
      }
      if (normalizedWindowState === 'open' && !thread.window_open) return false;
      if (normalizedWindowState === 'closed' && thread.window_open) return false;
      if (!normalizedSearch) return true;
      const name = String(thread.contacts?.name || '').toLowerCase();
      const phone = String(thread.contacts?.phone_number || '').toLowerCase();
      return name.includes(normalizedSearch) || phone.includes(normalizedSearch) || String(thread.id).toLowerCase().includes(normalizedSearch);
    });

    const filteredThreadIds = filteredThreads.map((thread) => thread.id);
    if (filteredThreadIds.length === 0) {
      return res.json({
        success: true,
        kpis: {
          sent_messages: 0,
          responded_messages: 0,
          response_rate: 0,
          templates_sent: 0,
          active_conversations: 0,
          closed_window_conversations: 0,
          mass_sent_messages: 0,
          mass_send_runs: 0,
        },
        timeseries: [],
        template_stats: [],
        top_contacts: [],
        top_mass_sends: [],
        conversation_stats: { activo: 0, pendiente: 0, resuelto: 0 },
        detail: [],
        applied_filters: {
          from: fromIso,
          to: toIso,
          conversation_state: normalizedConversationState || 'all',
          message_type: normalizedMessageType || 'all',
          window_state: normalizedWindowState || 'all',
          template: normalizedTemplate || null,
          search: normalizedSearch || null,
        },
      });
    }

    const { data: messagesData, error: messagesError } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('id, whatsapp_thread_id, message_text, incoming, read, created_at, mass_send_id')
      .in('whatsapp_thread_id', filteredThreadIds)
      .is('deleted_at', null)
      .gte('created_at', fromIso)
      .lte('created_at', toIso);

    if (messagesError) return res.status(500).json({ error: messagesError.message });
    const allMessages = messagesData || [];

    const threadById = new Map(filteredThreads.map((thread) => [thread.id, thread]));
    const filteredMessages = allMessages.filter((message) => {
      const templateName = extractTemplateName(message.message_text);
      const isTemplate = !!templateName;

      if (normalizedMessageType === 'text' && isTemplate) return false;
      if (normalizedMessageType === 'template' && !isTemplate) return false;
      if (normalizedTemplate && (!templateName || !templateName.toLowerCase().includes(normalizedTemplate))) return false;

      if (!normalizedSearch) return true;
      const thread = threadById.get(message.whatsapp_thread_id);
      const contactName = String(thread?.contacts?.name || '').toLowerCase();
      const contactPhone = String(thread?.contacts?.phone_number || '').toLowerCase();
      const messageText = String(message.message_text || '').toLowerCase();
      return (
        messageText.includes(normalizedSearch)
        || contactName.includes(normalizedSearch)
        || contactPhone.includes(normalizedSearch)
      );
    });

    const outgoingMessages = filteredMessages.filter((message) => !message.incoming);
    const incomingMessages = filteredMessages.filter((message) => message.incoming);
    const templateMessages = outgoingMessages.filter((message) => extractTemplateName(message.message_text));

    const timeseriesMap = new Map();
    filteredMessages.forEach((message) => {
      const day = toDayKey(message.created_at);
      if (!timeseriesMap.has(day)) {
        timeseriesMap.set(day, { day, sent: 0, responded: 0 });
      }
      const bucket = timeseriesMap.get(day);
      if (message.incoming) bucket.responded += 1;
      else bucket.sent += 1;
    });
    const timeseries = Array.from(timeseriesMap.values()).sort((a, b) => a.day.localeCompare(b.day));

    const templateCounter = new Map();
    templateMessages.forEach((message) => {
      const tpl = extractTemplateName(message.message_text);
      if (!tpl) return;
      templateCounter.set(tpl, (templateCounter.get(tpl) || 0) + 1);
    });
    const templateStats = Array.from(templateCounter.entries())
      .map(([template_name, sent]) => ({ template_name, sent }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 10);

    const contactCounter = new Map();
    filteredMessages.forEach((message) => {
      const thread = threadById.get(message.whatsapp_thread_id);
      const key = message.whatsapp_thread_id;
      const current = contactCounter.get(key) || {
        thread_id: key,
        contact_name: thread?.contacts?.name || 'Desconocido',
        phone_number: thread?.contacts?.phone_number || null,
        total: 0,
      };
      current.total += 1;
      contactCounter.set(key, current);
    });
    const topContacts = Array.from(contactCounter.values()).sort((a, b) => b.total - a.total).slice(0, 10);

    const conversationStats = { activo: 0, pendiente: 0, resuelto: 0 };
    filteredThreads.forEach((thread) => {
      const state = conversationStateFromLastInteraction(thread.last_interaction);
      conversationStats[state] += 1;
    });

    const detail = filteredMessages
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 100)
      .map((message) => {
        const thread = threadById.get(message.whatsapp_thread_id);
        const tpl = extractTemplateName(message.message_text);
        return {
          id: message.id,
          created_at: message.created_at,
          thread_id: message.whatsapp_thread_id,
          contact_name: thread?.contacts?.name || 'Desconocido',
          phone_number: thread?.contacts?.phone_number || null,
          direction: message.incoming ? 'inbound' : 'outbound',
          message_type: tpl ? 'template' : 'text',
          template_name: tpl,
          read: message.read,
          preview: String(message.message_text || '').slice(0, 140),
          window_open: !!thread?.window_open,
          conversation_state: conversationStateFromLastInteraction(thread?.last_interaction || null),
        };
      });

    const responseRate = outgoingMessages.length > 0
      ? Number(((incomingMessages.length / outgoingMessages.length) * 100).toFixed(2))
      : 0;

    const massSendMessageCount = outgoingMessages.filter((message) => !!message.mass_send_id).length;
    const { data: massRuns = [] } = await supabaseAdmin
      .from('whatsapp_mass_send_runs')
      .select('id, sent_count, failed_count, started_at, whatsapp_mass_sends(name)')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .gte('started_at', fromIso)
      .lte('started_at', toIso);

    const topMassSends = (massRuns || [])
      .map((run) => ({ name: run.whatsapp_mass_sends?.name || 'Sin nombre', sent: Number(run.sent_count || 0), failed: Number(run.failed_count || 0) }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 5);

    return res.json({
      success: true,
      kpis: {
        sent_messages: outgoingMessages.length,
        responded_messages: incomingMessages.length,
        response_rate: responseRate,
        templates_sent: templateMessages.length,
        active_conversations: conversationStats.activo,
        closed_window_conversations: filteredThreads.filter((thread) => !thread.window_open).length,
        mass_sent_messages: massSendMessageCount,
        mass_send_runs: (massRuns || []).length,
      },
      timeseries,
      template_stats: templateStats,
      top_contacts: topContacts,
      top_mass_sends: topMassSends,
      conversation_stats: conversationStats,
      detail,
      applied_filters: {
        from: fromIso,
        to: toIso,
        conversation_state: normalizedConversationState || 'all',
        message_type: normalizedMessageType || 'all',
        window_state: normalizedWindowState || 'all',
        template: normalizedTemplate || null,
        search: normalizedSearch || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/meta/mass-sends/preview
 * Body: { filters }
 */
app.post('/api/meta/mass-sends/preview', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId } = req.workspaceAdmin;
  try {
    const { filters = {} } = req.body || {};
    const result = await buildMassSendCandidates({ tenantId, filters, sampleLimit: 25 });
    return res.json({
      success: true,
      total_recipients: result.total,
      sample: result.sample,
      applied_filters: result.filters,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/meta/mass-sends
 * Body: { name, template_id|template_name, language?, template_parameters?, filters?, mode?, schedule? }
 */
app.post('/api/meta/mass-sends', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId, userId } = req.workspaceAdmin;
  const {
    name,
    template_id,
    template_name,
    language,
    template_parameters = [],
    filters = {},
    mode = 'manual',
    schedule = null,
  } = req.body || {};

  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const approvedTemplate = await resolveApprovedTemplateForTenant({ tenantId, templateId: template_id, templateName: template_name });
    const normalizedFilters = normalizeMassSendFilters(filters);
    const finalMode = String(mode).toLowerCase() === 'scheduled' ? 'scheduled' : 'manual';

    const { data: created, error: createError } = await supabaseAdmin
      .from('whatsapp_mass_sends')
      .insert({
        tenant_id: tenantId,
        whatsapp_template_id: approvedTemplate.id,
        name: String(name).trim(),
        template_name: approvedTemplate.template_name,
        // Always persist Meta-approved template language to avoid translation mismatches at send time.
        language: String(approvedTemplate.language || language || 'es_LA'),
        template_parameters: Array.isArray(template_parameters) ? template_parameters : [],
        filters: normalizedFilters,
        mode: finalMode,
        status: finalMode === 'scheduled' ? 'active' : 'draft',
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (createError || !created) return res.status(500).json({ error: createError?.message || 'Could not create mass send' });

    if (finalMode === 'scheduled' && schedule?.cron_expression) {
      await supabaseAdmin
        .from('whatsapp_mass_send_schedules')
        .insert({
          mass_send_id: created.id,
          cron_expression: String(schedule.cron_expression),
          timezone: String(schedule.timezone || 'America/Bogota'),
          next_run_at: schedule.next_run_at || null,
          enabled: schedule.enabled !== false,
          created_by: userId,
          updated_by: userId,
        });
    }

    return res.status(201).json({ success: true, mass_send: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/meta/mass-sends', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId } = req.workspaceAdmin;
  try {
    const { data: massSends = [], error } = await supabaseAdmin
      .from('whatsapp_mass_sends')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    const ids = massSends.map((row) => row.id);
    let runs = [];
    if (ids.length > 0) {
      const { data } = await supabaseAdmin
        .from('whatsapp_mass_send_runs')
        .select('*')
        .in('mass_send_id', ids)
        .is('deleted_at', null)
        .order('started_at', { ascending: false });
      runs = data || [];
    }

    const runByMassSend = new Map();
    for (const run of runs) {
      if (!runByMassSend.has(run.mass_send_id)) runByMassSend.set(run.mass_send_id, run);
    }

    return res.json({
      success: true,
      items: massSends.map((item) => ({
        ...item,
        last_run: runByMassSend.get(item.id) || null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/meta/mass-sends/:id', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId } = req.workspaceAdmin;
  const { id } = req.params;
  try {
    const { data: massSend, error } = await supabaseAdmin
      .from('whatsapp_mass_sends')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !massSend) return res.status(404).json({ error: 'Mass send not found' });

    const { data: schedules = [] } = await supabaseAdmin
      .from('whatsapp_mass_send_schedules')
      .select('*')
      .eq('mass_send_id', id)
      .is('deleted_at', null);

    const { data: runs = [] } = await supabaseAdmin
      .from('whatsapp_mass_send_runs')
      .select('*')
      .eq('mass_send_id', id)
      .is('deleted_at', null)
      .order('started_at', { ascending: false })
      .limit(20);

    return res.json({ success: true, mass_send: massSend, schedules, runs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/meta/mass-sends/:id/run', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId, userId } = req.workspaceAdmin;
  const { id } = req.params;
  const triggerType = String(req.body?.trigger_type || 'manual').toLowerCase() === 'scheduled' ? 'scheduled' : 'manual';

  try {
    const { data: massSend, error: massSendError } = await supabaseAdmin
      .from('whatsapp_mass_sends')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (massSendError || !massSend) return res.status(404).json({ error: 'Mass send not found' });

    const { data: config, error: configError } = await supabaseAdmin
      .from('whatsapp_configurations')
      .select('id, phone_number_id, token')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single();
    if (configError || !config?.phone_number_id) {
      return res.status(400).json({ error: 'WhatsApp not configured or phone_number_id missing' });
    }

    const approvedTemplate = await resolveApprovedTemplateForTenant({
      tenantId,
      templateId: massSend.whatsapp_template_id || null,
      templateName: massSend.template_name || null,
    });
    const runtimeTemplateName = String(approvedTemplate.template_name || massSend.template_name || '');
    const runtimeLanguage = String(approvedTemplate.language || massSend.language || 'es_LA');

    const candidatesResult = await buildMassSendCandidates({ tenantId, filters: massSend.filters, sampleLimit: 5000 });
    const recipients = candidatesResult.candidates;

    const { data: runRow, error: runError } = await supabaseAdmin
      .from('whatsapp_mass_send_runs')
      .insert({
        mass_send_id: massSend.id,
        tenant_id: tenantId,
        trigger_type: triggerType,
        status: 'running',
        total_recipients: recipients.length,
        started_at: new Date().toISOString(),
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (runError || !runRow) return res.status(500).json({ error: runError?.message || 'Could not create run' });

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const recipient of recipients) {
      const normalizedPhone = normalizeWhatsAppPhone(recipient.phone_number);
      if (!normalizedPhone) {
        skippedCount += 1;
        await supabaseAdmin.from('whatsapp_mass_send_recipients').insert({
          mass_send_id: massSend.id,
          mass_send_run_id: runRow.id,
          contact_id: recipient.contact_id,
          phone_number: String(recipient.phone_number || ''),
          template_name: runtimeTemplateName,
          status: 'skipped',
            error_message: 'Missing or invalid phone number',
          created_by: userId,
          updated_by: userId,
        });
        continue;
      }

      try {
        const massTemplateName = String(runtimeTemplateName || '').toLowerCase();
        let effectiveParams = Array.isArray(massSend.template_parameters)
          ? massSend.template_parameters.map((v) => String(v ?? ''))
          : [];
        if (massTemplateName === 'payment_overdue_2' && effectiveParams.length === 0) {
          effectiveParams = await resolvePaymentOverdue2Params({
            tenantId,
            contactId: recipient.contact_id || null,
            phoneNumber: normalizedPhone,
          });
        }

        const components = effectiveParams.length > 0
          ? [{
            type: 'body',
            parameters: effectiveParams.map((value) => ({ type: 'text', text: String(value) })),
          }]
          : undefined;

        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'template',
          template: {
            name: runtimeTemplateName,
            language: { code: runtimeLanguage },
            ...(components ? { components } : {}),
          },
        };

        const metaRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${config.phone_number_id}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const metaData = await metaRes.json();
        if (!metaRes.ok) {
          const mapped = mapMetaError(metaData.error);
          throw new Error(`${mapped.code}: ${mapped.message}${mapped.hint ? ` — ${mapped.hint}` : ''}`);
        }

        const resolved = await resolveContactAndThread({
          tenantId,
          phoneNumber: String(recipient.phone_number || normalizedPhone),
          userId,
          seedLastMessage: `[MASIVO] ${runtimeTemplateName}`,
        });
        const resolvedThreadId = resolved.threadId;
        if (!resolvedThreadId) throw new Error('Could not resolve whatsapp thread for recipient');
        const savedText = `[MASIVO] ${runtimeTemplateName}`;
        const templatePreviewBody = effectiveParams.join(' | ');
        const richTemplatePayload = buildTemplateRichMessageForDb({
          kind: 'template',
          template_name: runtimeTemplateName,
          language: runtimeLanguage,
          template_components: approvedTemplate.components || [],
          sent_components: components || [],
          text: templatePreviewBody || savedText,
          ts: new Date().toISOString(),
        }, savedText);

        const { data: savedMessage, error: saveMessageError } = await supabaseAdmin
          .from('whatsapp_messages')
          .insert({
            whatsapp_thread_id: resolvedThreadId,
            message_text: richTemplatePayload,
            incoming: false,
            read: false,
            sent_at: new Date().toISOString(),
            mass_send_id: massSend.id,
            mass_send_run_id: runRow.id,
            created_by: userId,
            updated_by: userId,
          })
          .select()
          .single();
        if (saveMessageError || !savedMessage?.id) {
          throw new Error(saveMessageError?.message || 'Could not persist mass-send message in whatsapp_messages');
        }

        const windowState = await getConversationWindowState({
          tenantId,
          phoneNumber: String(recipient.phone_number || normalizedPhone),
          explicitThreadId: resolvedThreadId || null,
        });

        await supabaseAdmin
          .from('whatsapp_threads')
          .update({
            last_message: savedText,
            last_interaction: new Date().toISOString(),
            window_open: windowState.windowOpen,
            window_expires_at: windowState.windowExpiresAt,
            last_inbound_at: windowState.lastInboundAt,
            updated_by: userId,
          })
          .eq('id', resolvedThreadId);

        await supabaseAdmin
          .from('whatsapp_mass_send_recipients')
          .insert({
            mass_send_id: massSend.id,
            mass_send_run_id: runRow.id,
            contact_id: resolved.contactId,
            phone_number: String(recipient.phone_number || normalizedPhone),
            template_name: runtimeTemplateName,
            status: 'sent',
            meta_message_id: metaData?.messages?.[0]?.id || null,
            whatsapp_thread_id: resolvedThreadId,
            whatsapp_message_id: savedMessage?.id || null,
            sent_at: new Date().toISOString(),
            created_by: userId,
            updated_by: userId,
          });
        sentCount += 1;
      } catch (sendErr) {
        failedCount += 1;
        const metaError = sendErr?.message ? String(sendErr.message) : 'Unknown send error';
        await supabaseAdmin
          .from('whatsapp_mass_send_recipients')
          .insert({
            mass_send_id: massSend.id,
            mass_send_run_id: runRow.id,
            contact_id: recipient.contact_id || null,
            phone_number: String(recipient.phone_number || normalizedPhone || ''),
            template_name: runtimeTemplateName,
            status: 'failed',
            error_message: metaError,
            created_by: userId,
            updated_by: userId,
          });
      }
    }

    const { data: failedRecipients = [] } = await supabaseAdmin
      .from('whatsapp_mass_send_recipients')
      .select('phone_number, error_message')
      .eq('mass_send_run_id', runRow.id)
      .eq('status', 'failed')
      .limit(5);

    const finalStatus = failedCount > 0 && sentCount === 0 ? 'failed' : 'completed';
    await supabaseAdmin
      .from('whatsapp_mass_send_runs')
      .update({
        status: finalStatus,
        sent_count: sentCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        finished_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('id', runRow.id);

    await supabaseAdmin
      .from('whatsapp_mass_sends')
      .update({
        status: massSend.mode === 'scheduled' ? 'active' : 'completed',
        updated_by: userId,
      })
      .eq('id', massSend.id);

    if (failedCount > 0) {
      await emitNotificationEvent({
        tenantId,
        actorUserId: userId,
        eventType: NOTIFICATION_EVENT_TYPES.MASS_SEND_FAILED,
        entityType: 'whatsapp_mass_send_run',
        entityId: runRow.id,
        payload: {
          mass_send_id: massSend.id,
          mass_send_name: massSend.name,
          failed_count: failedCount,
          sent_count: sentCount,
          skipped_count: skippedCount,
        },
        roles: ['Admin', 'Superadmin'],
        title: `Fallo en envío masivo: ${massSend.name}`,
        body: `El envío registró ${failedCount} fallo(s). Revisa el detalle en mensajería.`,
        severity: failedCount > 5 ? 'critical' : 'warning',
        actionUrl: '/mensajeria/masivos',
      }).catch((error) => console.error('[notifications] mass_send_failed emit error:', error.message));
    }

    return res.json({
      success: true,
      run_id: runRow.id,
      summary: {
        total_recipients: recipients.length,
        sent: sentCount,
        failed: failedCount,
        skipped: skippedCount,
      },
      audience_debug: {
        filters_applied: massSend.filters || {},
        recipient_count: recipients.length,
      },
      failed_samples: failedRecipients,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', requireWorkspaceMember, async (req, res) => {
  const { tenantId, userId } = req.workspaceMember;
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  try {
    const { data = [], error, count } = await supabaseAdmin
      .from('notifications')
      .select('id, tenant_id, user_id, event_id, title, body, severity, action_url, is_read, read_at, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, items: data, total: count || 0, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications/unread-count', requireWorkspaceMember, async (req, res) => {
  const { tenantId, userId } = req.workspaceMember;
  try {
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('is_read', false)
      .is('deleted_at', null);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, unread_count: count || 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch('/api/notifications/:id/read', requireWorkspaceMember, async (req, res) => {
  const { tenantId, userId } = req.workspaceMember;
  const { id } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('id, is_read, read_at')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Notification not found' });
    return res.json({ success: true, notification: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch('/api/notifications/read-all', requireWorkspaceMember, async (req, res) => {
  const { tenantId, userId } = req.workspaceMember;
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('is_read', false)
      .is('deleted_at', null);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications/preferences', requireWorkspaceMember, async (req, res) => {
  const { tenantId, userId } = req.workspaceMember;
  try {
    const { data = [], error } = await supabaseAdmin
      .from('notification_preferences')
      .select('id, event_type, enabled_in_app, enabled_email, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('event_type', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, items: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/preferences', requireWorkspaceMember, async (req, res) => {
  const { tenantId, userId } = req.workspaceMember;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) return res.status(400).json({ error: 'items[] is required' });
  try {
    const rows = items
      .filter((item) => item?.event_type)
      .map((item) => ({
        tenant_id: tenantId,
        user_id: userId,
        event_type: String(item.event_type),
        enabled_in_app: item.enabled_in_app !== false,
        enabled_email: item.enabled_email === true,
        updated_by: userId,
      }));
    if (rows.length === 0) return res.status(400).json({ error: 'No valid preference rows provided' });
    const { error } = await supabaseAdmin
      .from('notification_preferences')
      .upsert(rows, { onConflict: 'tenant_id,user_id,event_type' });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, updated: rows.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/debt-threshold/check', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId, userId } = req.workspaceAdmin;
  const minDaysOverdue = Number(req.body?.min_days_overdue || 30);
  if (!Number.isFinite(minDaysOverdue) || minDaysOverdue < 0) {
    return res.status(400).json({ error: 'min_days_overdue must be a positive number' });
  }
  try {
    const { data: detailRows = [], error } = await supabaseAdmin
      .from('debt_details')
      .select('id, contact_id, expiration_date, debt_status, contacts(name)')
      .eq('debt_status', 'Expired')
      .is('deleted_at', null);
    if (error) return res.status(500).json({ error: error.message });
    const now = Date.now();
    const matches = detailRows.filter((row) => {
      const ts = new Date(row.expiration_date).getTime();
      if (!Number.isFinite(ts)) return false;
      const overdueDays = Math.max(0, Math.floor((now - ts) / 86_400_000));
      return overdueDays >= minDaysOverdue;
    });
    if (matches.length === 0) return res.json({ success: true, emitted: 0, matches: 0 });

    await emitNotificationEvent({
      tenantId,
      actorUserId: userId,
      eventType: NOTIFICATION_EVENT_TYPES.DEBT_OVERDUE_THRESHOLD,
      entityType: 'debt_details_threshold',
      entityId: null,
      payload: { min_days_overdue: minDaysOverdue, matches: matches.length },
      roles: ['Admin', 'Agente'],
      title: 'Deudas vencidas en umbral',
      body: `${matches.length} deudas superan ${minDaysOverdue} días de mora.`,
      severity: 'warning',
      actionUrl: '/deudas',
    });
    return res.json({ success: true, emitted: 1, matches: matches.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// DEBTS — Manual create + batch import
// ════════════════════════════════════════════════════════════════

function normalizePhone(phone) {
  const normalized = normalizePhoneCanonical(phone);
  return normalized || null;
}

async function upsertContactByIdentity({ tenantId, actorUserId, name, phone_number, email }) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  const normalizedPhone = normalizePhone(phone_number);
  const hasRawPhone = Boolean(String(phone_number || '').trim());
  if (hasRawPhone && !normalizedPhone) {
    throw new Error('INVALID_PHONE_FORMAT: Usa E.164 con código país (ej: 59172654203)');
  }
  if (!normalizedPhone && !normalizedEmail) {
    throw new Error('MISSING_CONTACT_IDENTITY: phone_number o email es requerido');
  }

  let existing = null;
  if (normalizedPhone) {
    const existingId = await findContactIdByTenantAndPhone(tenantId, normalizedPhone);
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', existingId || '00000000-0000-0000-0000-000000000000')
      .is('deleted_at', null)
      .maybeSingle();
    if (data) existing = data;
  }

  if (!existing && normalizedEmail) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('email', normalizedEmail)
      .is('deleted_at', null)
      .maybeSingle();
    if (data) existing = data;
  }

  if (existing?.id) return { ...existing, _created: false };

  const { data: created, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      tenant_id: tenantId,
      name: name || normalizedPhone || normalizedEmail || 'Contacto',
      phone_number: normalizedPhone,
      email: normalizedEmail,
      created_by: actorUserId,
      updated_by: actorUserId,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return { ...created, _created: true };
}

async function getOrCreateDebtAggregate({ tenantId, actorUserId, contactId }) {
  const { data: existing } = await supabaseAdmin
    .from('debts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from('debts')
    .insert({
      tenant_id: tenantId,
      contact_id: contactId,
      created_by: actorUserId,
      updated_by: actorUserId,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}

/**
 * POST /api/debts/create
 * Headers: Authorization Bearer <token>, x-tenant-id
 * Body: { contactId?, contact?: { name, phone_number, email }, items: [{ amount, penalty?, total?, description?, expiration_date }] }
 */
app.post('/api/debts/create', requireWorkspaceAdmin, async (req, res) => {
  try {
    const tenantId = req.workspaceAdmin.tenantId;
    const actorUserId = req.workspaceAdmin.userId;
    const { contactId, contact, items } = req.body || {};
    const firstItem = Array.isArray(items) ? items[0] : null;
    if ((!contactId && !contact) || !firstItem) {
      return res.status(400).json({ error: 'Missing required fields: contactId/contact and items[0]' });
    }

    if (contact && String(contact.phone_number || '').trim() && !normalizePhone(contact.phone_number)) {
      return res.status(400).json({ error: 'INVALID_PHONE_FORMAT: Usa E.164 con código país (ej: 59172654203)' });
    }

    const resolvedContact = contactId
      ? (await supabaseAdmin.from('contacts').select('*').eq('id', contactId).eq('tenant_id', tenantId).is('deleted_at', null).single()).data
      : await upsertContactByIdentity({ tenantId, actorUserId, ...contact });
    if (!resolvedContact?.id) return res.status(400).json({ error: 'Contact not found' });

    const debtId = await getOrCreateDebtAggregate({ tenantId, actorUserId, contactId: resolvedContact.id });

    const inserts = items.map((it) => {
      const amount = Number(it.amount ?? it.debt_amount ?? 0);
      const penalty = Number(it.penalty ?? it.penalty_amount ?? 0);
      const total = Number(it.total ?? amount + penalty);
      return {
        contact_id: resolvedContact.id,
        debt_id: debtId,
        debt_amount: amount,
        penalty_amount: penalty,
        total,
        debt_description: it.description ?? it.debt_description ?? null,
        expiration_date: it.expiration_date,
        debt_status: 'Pending',
        created_by: actorUserId,
        updated_by: actorUserId,
      };
    });

    const { data: createdItems, error } = await supabaseAdmin
      .from('debt_details')
      .insert(inserts)
      .select('*');
    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ success: true, contact: { id: resolvedContact.id, name: resolvedContact.name }, debt_id: debtId, items: createdItems });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/debts/import
 * Headers: Authorization Bearer <token>, x-tenant-id
 * Body: { rows: [{ name?, phone_number?, email?, amount, penalty?, total?, description?, expiration_date }] }
 */
app.post('/api/debts/import', requireWorkspaceAdmin, async (req, res) => {
  try {
    const tenantId = req.workspaceAdmin.tenantId;
    const actorUserId = req.workspaceAdmin.userId;
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows[] is required' });

    const results = { created_contacts: 0, created_items: 0, invalid_rows: [], errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const rawPhone = String(r.phone_number ?? r.phone ?? r.telefono ?? '').trim();
        const normalizedPhone = normalizePhone(rawPhone);
        const normalizedEmail = String(r.email ?? '').trim().toLowerCase() || null;
        const amount = Number(r.amount ?? r.debt_amount ?? 0);
        const penalty = Number(r.penalty ?? r.penalty_amount ?? 0);
        const total = Number(r.total ?? amount + penalty);
        const expiration_date = String(r.expiration_date ?? '').trim();
        const expirationTs = new Date(expiration_date).getTime();

        if (!normalizedPhone && !normalizedEmail) {
          results.invalid_rows.push({
            row: i + 1,
            raw_phone: rawPhone || null,
            normalized_phone: null,
            reason: 'MISSING_CONTACT_IDENTITY',
          });
          continue;
        }
        if (rawPhone && !normalizedPhone) {
          results.invalid_rows.push({
            row: i + 1,
            raw_phone: rawPhone,
            normalized_phone: null,
            reason: 'INVALID_PHONE_FORMAT',
          });
          continue;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          results.invalid_rows.push({
            row: i + 1,
            raw_phone: rawPhone || null,
            normalized_phone: normalizedPhone,
            reason: 'INVALID_AMOUNT',
          });
          continue;
        }
        if (!expiration_date || !Number.isFinite(expirationTs)) {
          results.invalid_rows.push({
            row: i + 1,
            raw_phone: rawPhone || null,
            normalized_phone: normalizedPhone,
            reason: 'INVALID_EXPIRATION_DATE',
          });
          continue;
        }

        const contactRow = await upsertContactByIdentity({
          tenantId,
          actorUserId,
          name: r.name ?? r.contact_name,
          phone_number: normalizedPhone,
          email: normalizedEmail,
        });
        if (contactRow?._created) results.created_contacts++;

        const debtId = await getOrCreateDebtAggregate({ tenantId, actorUserId, contactId: contactRow.id });

        const { error: insertError } = await supabaseAdmin.from('debt_details').insert({
          contact_id: contactRow.id,
          debt_id: debtId,
          debt_amount: amount,
          penalty_amount: penalty,
          total,
          debt_description: r.description ?? r.debt_description ?? null,
          expiration_date,
          debt_status: 'Pending',
          created_by: actorUserId,
          updated_by: actorUserId,
        });
        if (insertError) throw new Error(insertError.message);
        results.created_items++;
      } catch (e) {
        results.errors.push({ row: i + 1, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return res.json({ success: true, ...results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

async function requireWorkspaceMember(req, res, next) {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'];
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No authorization header' });
  if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({
      error: 'Invalid token',
      detail: error?.message || null,
    });
  }

  const { data: membership } = await supabaseAdmin
    .from('tenant_members')
    .select('role, enabled')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || !membership.enabled) return res.status(403).json({ error: 'Forbidden: workspace membership required' });

  req.workspaceMember = { userId: user.id, tenantId, role: membership.role };
  next();
}

async function requireWorkspaceAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'];
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No authorization header' });
  if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: membership } = await supabaseAdmin
    .from('tenant_members')
    .select('role, enabled')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || !membership.enabled || !['Admin', 'Superadmin'].includes(membership.role)) {
    return res.status(403).json({ error: 'Forbidden: Admin role required in selected workspace' });
  }

  req.workspaceAdmin = { userId: user.id, tenantId };
  next();
}

/**
 * Like requireWorkspaceAdmin, but global users.role === 'Superadmin' may target any tenant
 * (superadmin console selects workspace via x-tenant-id without tenant_members in that tenant).
 * Tenant-scoped Admins still require membership as before.
 */
async function requireWorkspaceAdminOrGlobalSuperadminForTenant(req, res, next) {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers['x-tenant-id'];
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No authorization header' });
  if (!tenantId) return res.status(400).json({ error: 'Missing x-tenant-id header' });

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('role, enabled')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.enabled) return res.status(403).json({ error: 'Forbidden: account disabled' });

  if (profile.role === 'Superadmin') {
    req.workspaceAdmin = { userId: user.id, tenantId };
    return next();
  }

  const { data: membership } = await supabaseAdmin
    .from('tenant_members')
    .select('role, enabled')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || !membership.enabled || !['Admin', 'Superadmin'].includes(membership.role)) {
    return res.status(403).json({ error: 'Forbidden: Admin role required in selected workspace' });
  }

  req.workspaceAdmin = { userId: user.id, tenantId };
  next();
}

// ════════════════════════════════════════════════════════════════
// USERS — Admin operations
// ════════════════════════════════════════════════════════════════

/**
 * POST /admin/users
 * Create a new Supabase Auth user + profile row
 * Body: { email, password, name, role, tenant_id }
 */
app.post('/admin/users', requireSuperadmin, async (req, res) => {
  const { email, password, name, role, tenant_id } = req.body;

  if (!email || !password || !name || !role || !tenant_id) {
    return res.status(400).json({ error: 'Missing required fields: email, password, name, role, tenant_id' });
  }

  // 1. Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,  // auto-confirm so they can log in immediately
  });

  if (authError) return res.status(400).json({ error: authError.message });

  // 2. Insert global profile (users).
  // tenant_id is kept as legacy/default-workspace compatibility; authorization uses tenant_members.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authData.user.id,
      name,
      email,
      role,
      tenant_id,
      enabled: true,
      created_by: req.adminUser.id,
      updated_by: req.adminUser.id,
    })
    .select()
    .single();

  if (profileError) {
    // Rollback auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: profileError.message });
  }

  // 3. Insert tenant membership (source of truth for tenant permissions)
  const { error: membershipError } = await supabaseAdmin
    .from('tenant_members')
    .insert({
      tenant_id,
      user_id: authData.user.id,
      role,
      enabled: true,
      created_by: req.adminUser.id,
      updated_by: req.adminUser.id,
    });

  if (membershipError) {
    await supabaseAdmin.from('users').delete().eq('id', authData.user.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: membershipError.message });
  }

  res.status(201).json({ ...profile, tenant_membership_created: true });
});

/**
 * DELETE /admin/users/:id
 * Soft-delete profile + disable auth account
 */
app.delete('/admin/users/:id', requireSuperadmin, async (req, res) => {
  const { id } = req.params;
  const now = new Date().toISOString();

  const { error: profileError } = await supabaseAdmin
    .from('users')
    .update({ deleted_at: now, deleted_by: req.adminUser.id, enabled: false })
    .eq('id', id);

  if (profileError) return res.status(500).json({ error: profileError.message });

  const { error: membershipError } = await supabaseAdmin
    .from('tenant_members')
    .update({ deleted_at: now, enabled: false, deleted_by: req.adminUser.id })
    .eq('user_id', id)
    .is('deleted_at', null);
  if (membershipError) return res.status(500).json({ error: membershipError.message });

  await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '87600h' }); // ~10 years

  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════
// TENANTS — Admin operations
// ════════════════════════════════════════════════════════════════

/** GET /admin/tenants — All tenants with user/subscription counts */
app.get('/admin/tenants', requireSuperadmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select(`
      *,
      users(count),
      subscriptions(id, enable, expiration_date, subscription_plans(name, price))
    `)
    .is('deleted_at', null)
    .order('name');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** POST /admin/tenants — Create tenant */
app.post('/admin/tenants', requireSuperadmin, async (req, res) => {
  const { name, nit, address } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .insert({ name, nit, address, created_by: req.adminUser.id, updated_by: req.adminUser.id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

/** PUT /admin/tenants/:id — Update tenant */
app.put('/admin/tenants/:id', requireSuperadmin, async (req, res) => {
  const { name, nit, address } = req.body;
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update({ name, nit, address, updated_by: req.adminUser.id })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** DELETE /admin/tenants/:id — Soft delete */
app.delete('/admin/tenants/:id', requireSuperadmin, async (req, res) => {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ deleted_at: now, deleted_by: req.adminUser.id })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ════════════════════════════════════════════════════════════════

/** GET /admin/subscriptions — All with tenant + plan info */
app.get('/admin/subscriptions', requireSuperadmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*, tenants(name), subscription_plans(name, price)')
    .is('deleted_at', null)
    .order('expiration_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** POST /admin/subscriptions */
app.post('/admin/subscriptions', requireSuperadmin, async (req, res) => {
  const { tenant_id, subscription_plan_id, price, expiration_date } = req.body;
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .insert({ tenant_id, subscription_plan_id, price, expiration_date, enable: true, created_by: req.adminUser.id, updated_by: req.adminUser.id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

/** PATCH /admin/subscriptions/:id/toggle */
app.patch('/admin/subscriptions/:id/toggle', requireSuperadmin, async (req, res) => {
  // Get current state first
  const { data: current } = await supabaseAdmin.from('subscriptions').select('enable').eq('id', req.params.id).single();
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .update({ enable: !current?.enable, updated_by: req.adminUser.id })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/** GET /admin/plans */
app.get('/admin/plans', requireSuperadmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('subscription_plans')
    .select('*')
    .is('deleted_at', null)
    .order('price');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ════════════════════════════════════════════════════════════════
// FIRST-TIME SETUP — Public endpoints (no auth required)
// ════════════════════════════════════════════════════════════════

/**
 * GET /setup/check
 * Returns { needsSetup: true } if no Superadmin exists yet.
 * Safe to call publicly — reveals no sensitive data.
 */
app.get('/setup/check', async (req, res) => {
  const { count, error } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'Superadmin')
    .is('deleted_at', null);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ needsSetup: (count ?? 0) === 0 });
});

/**
 * POST /setup/init
 * Creates the first tenant + Superadmin user atomically.
 * Body: { tenantName, adminName, email, password }
 * Blocked with 409 if a Superadmin already exists.
 */
app.post('/setup/init', async (req, res) => {
  // Re-check: block if already initialized (idempotency guard)
  const { count } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'Superadmin')
    .is('deleted_at', null);

  if ((count ?? 0) > 0) {
    return res.status(409).json({ error: 'El sistema ya fue configurado. Usa el panel de administración para crear más usuarios.' });
  }

  const { tenantName, adminName, email, password } = req.body;

  if (!tenantName || !adminName || !email || !password) {
    return res.status(400).json({ error: 'Campos requeridos: tenantName, adminName, email, password' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  // 1. Create tenant
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({ name: tenantName })
    .select()
    .single();

  if (tenantError) return res.status(500).json({ error: `Error creando tenant: ${tenantError.message}` });

  // 2. Create auth user (or reuse existing)
  let authUserId = null;
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    // If email already exists in Auth, reuse it for bootstrap setup.
    if ((authError.message || '').toLowerCase().includes('already been registered')) {
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) {
        await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
        return res.status(400).json({ error: `Error buscando usuario existente: ${listError.message}` });
      }
      const existing = (listData?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === String(email).toLowerCase());
      if (!existing?.id) {
        await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
        return res.status(400).json({ error: 'El email ya existe en Auth, pero no se pudo resolver el usuario.' });
      }
      authUserId = existing.id;
      // Ensure password is updated so they can log in.
      await supabaseAdmin.auth.admin.updateUserById(authUserId, { password, email_confirm: true });
    } else {
      // Rollback tenant
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      return res.status(400).json({ error: `Error creando usuario: ${authError.message}` });
    }
  } else {
    authUserId = authData.user.id;
  }

  // 3. Create user profile as Superadmin
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authUserId,
      name: adminName,
      email,
      role: 'Superadmin',
      tenant_id: tenant.id,
      enabled: true,
      created_by: authUserId,
      updated_by: authUserId,
    })
    .select()
    .single();

  if (profileError) {
    // Rollback both
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
    return res.status(500).json({ error: `Error creando perfil: ${profileError.message}` });
  }

  // 4. Create first workspace membership
  await supabaseAdmin
    .from('tenant_members')
    .insert({
      tenant_id: tenant.id,
      user_id: authUserId,
      role: 'Superadmin',
      enabled: true,
    });

  console.log(`✅ Setup complete. Superadmin: ${email}, Tenant: ${tenantName}`);
  res.status(201).json({ success: true, tenant, profile: { id: profile.id, name: profile.name, email: profile.email, role: profile.role } });
});

/**
 * POST /admin/invites
 * Headers: Authorization Bearer <token>, x-tenant-id
 * Body: { email, role }
 */
app.post('/admin/invites', requireWorkspaceAdminOrGlobalSuperadminForTenant, async (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) return res.status(400).json({ error: 'Missing required fields: email, role' });
  if (!['Admin', 'Agente'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const normalizedEmail = String(email).toLowerCase().trim();
  const actorKey = `${req.workspaceAdmin.tenantId}:${req.workspaceAdmin.userId}:${req.ip ?? 'na'}`;
  const retryAfter = enforceInviteRateLimit(actorKey);
  if (retryAfter) return res.status(429).json({ error: `Rate limit exceeded. Retry in ${retryAfter}s` });

  const { data: existingPending } = await supabaseAdmin
    .from('tenant_invites')
    .select('id, tenant_id, email, role, status, expires_at, created_at, updated_at')
    .eq('tenant_id', req.workspaceAdmin.tenantId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPending) {
    const inviteUrl = getInviteUrl(existingPending.id);
    const emailResult = await sendInviteEmail(normalizedEmail, inviteUrl);
    return res.status(200).json({ ...existingPending, invite_url: inviteUrl, ...emailResult, reused: true });
  }

  const { data: invite, error } = await supabaseAdmin
    .from('tenant_invites')
    .insert({
      tenant_id: req.workspaceAdmin.tenantId,
      email: normalizedEmail,
      role,
      status: 'pending',
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      created_by: req.workspaceAdmin.userId,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const inviteUrl = getInviteUrl(invite.id);
  const emailResult = await sendInviteEmail(normalizedEmail, inviteUrl);
  return res.status(201).json({ ...invite, invite_url: inviteUrl, ...emailResult });
});

/**
 * GET /admin/invites
 * Headers: Authorization Bearer <token>, x-tenant-id
 * Query: status=all|pending|accepted|expired|revoked
 */
app.get('/admin/invites', requireWorkspaceAdminOrGlobalSuperadminForTenant, async (req, res) => {
  const status = String(req.query.status || 'all');
  const allowed = ['all', 'pending', 'accepted', 'expired', 'revoked'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status filter' });

  let query = supabaseAdmin
    .from('tenant_invites')
    .select('id, tenant_id, email, role, status, expires_at, created_at, updated_at')
    .eq('tenant_id', req.workspaceAdmin.tenantId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ items: data ?? [] });
});

/**
 * POST /admin/invites/:id/resend
 * Headers: Authorization Bearer <token>, x-tenant-id
 */
app.post('/admin/invites/:id/resend', requireWorkspaceAdminOrGlobalSuperadminForTenant, async (req, res) => {
  const inviteId = req.params.id;
  const actorKey = `${req.workspaceAdmin.tenantId}:${req.workspaceAdmin.userId}:${req.ip ?? 'na'}`;
  const retryAfter = enforceInviteRateLimit(actorKey);
  if (retryAfter) return res.status(429).json({ error: `Rate limit exceeded. Retry in ${retryAfter}s` });

  const { data: invite, error } = await supabaseAdmin
    .from('tenant_invites')
    .select('id, tenant_id, email, role, status, expires_at')
    .eq('id', inviteId)
    .eq('tenant_id', req.workspaceAdmin.tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !invite) return res.status(404).json({ error: 'Invitación no encontrada' });
  if (invite.status !== 'pending') return res.status(400).json({ error: 'Solo se puede reenviar invitaciones pendientes' });

  const inviteUrl = getInviteUrl(invite.id);
  const emailResult = await sendInviteEmail(invite.email, inviteUrl);
  return res.json({ success: true, invite_url: inviteUrl, ...emailResult });
});

/**
 * DELETE /admin/invites/:id
 * Headers: Authorization Bearer <token>, x-tenant-id
 */
app.delete('/admin/invites/:id', requireWorkspaceAdminOrGlobalSuperadminForTenant, async (req, res) => {
  const inviteId = req.params.id;
  const { data: invite, error: readError } = await supabaseAdmin
    .from('tenant_invites')
    .select('id, status')
    .eq('id', inviteId)
    .eq('tenant_id', req.workspaceAdmin.tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError || !invite) return res.status(404).json({ error: 'Invitación no encontrada' });
  if (invite.status !== 'pending') return res.status(400).json({ error: 'Solo se puede revocar invitaciones pendientes' });

  const { error } = await supabaseAdmin
    .from('tenant_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('tenant_id', req.workspaceAdmin.tenantId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

/**
 * GET /invites/:token
 * Public endpoint to validate invite token
 */
app.get('/invites/:token', async (req, res) => {
  const { token } = req.params;
  const { data: invite, error } = await supabaseAdmin
    .from('tenant_invites')
    .select('id, tenant_id, email, role, status, expires_at, tenants(name)')
    .eq('id', token)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !invite) return res.status(404).json({ error: 'Invitación no encontrada' });
  if (invite.status !== 'pending') return res.status(400).json({ error: 'Invitación ya utilizada o expirada' });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from('tenant_invites').update({ status: 'expired' }).eq('id', token);
    return res.status(400).json({ error: 'Invitación expirada' });
  }

  const tenant = Array.isArray(invite.tenants) ? invite.tenants[0] : invite.tenants;

  // Check if user already has an account in Supabase Auth
  let userAlreadyExists = false;
  try {
    const { data: existingUsers } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', invite.email)
      .is('deleted_at', null)
      .limit(1);
    userAlreadyExists = !!(existingUsers && existingUsers.length > 0);
  } catch (_) { /* ignore */ }

  return res.json({
    token: invite.id,
    tenantId: invite.tenant_id,
    tenantName: tenant?.name ?? 'Workspace',
    email: invite.email, // Returning real email so frontend can login/signup
    role: invite.role,
    userAlreadyExists,
  });
});

/**
 * POST /invites/:token/accept
 * Requires authenticated user session token
 */
app.post('/invites/:token/accept', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No authorization header' });
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const inviteToken = req.params.token;
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('tenant_invites')
    .select('*')
    .eq('id', inviteToken)
    .is('deleted_at', null)
    .maybeSingle();
  if (inviteError || !invite) return res.status(404).json({ error: 'Invitación no encontrada' });
  if (invite.status !== 'pending') return res.status(400).json({ error: 'Invitación ya utilizada o expirada' });
  if (invite.email.toLowerCase() !== (user.email ?? '').toLowerCase()) {
    return res.status(403).json({ error: 'La invitación pertenece a otro email' });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from('tenant_invites').update({ status: 'expired' }).eq('id', inviteToken);
    return res.status(400).json({ error: 'Invitación expirada' });
  }

  const defaultRole = invite.role === 'Admin' ? 'Admin' : 'Agente';
  const profileName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuario';
  const { data: existingProfile } = await supabaseAdmin
    .from('users')
    .select('id, tenant_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!existingProfile) {
    // New user — create profile with tenant assigned
    const { error: createProfileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: user.id,
        name: profileName,
        email: user.email,
        role: defaultRole,
        tenant_id: invite.tenant_id,
        enabled: true,
      });
    if (createProfileError) return res.status(500).json({ error: createProfileError.message });
  } else if (!existingProfile.tenant_id) {
    // Existing user but no tenant set yet — assign this tenant
    const { error: updateTenantErr } = await supabaseAdmin
      .from('users')
      .update({ tenant_id: invite.tenant_id, role: defaultRole })
      .eq('id', user.id);
    if (updateTenantErr) return res.status(500).json({ error: updateTenantErr.message });
  }
  // (If user already has a tenant_id, we keep theirs — the tenant_members table handles multi-workspace)

  const { error: memberError } = await supabaseAdmin
    .from('tenant_members')
    .upsert({
      tenant_id: invite.tenant_id,
      user_id: user.id,
      role: invite.role,
      enabled: true,
    }, { onConflict: 'tenant_id,user_id' });
  if (memberError) return res.status(500).json({ error: memberError.message });

  const { error: markAcceptedError } = await supabaseAdmin
    .from('tenant_invites')
    .update({ status: 'accepted' })
    .eq('id', inviteToken)
    .eq('status', 'pending');
  if (markAcceptedError) return res.status(500).json({ error: markAcceptedError.message });
  return res.json({ success: true, tenant_id: invite.tenant_id, role: invite.role });
});

// ════════════════════════════════════════════════════════════════
// META API PROXIES (WhatsApp Templates)
// ════════════════════════════════════════════════════════════════

/**
 * POST /api/meta/configurations/upsert
 * Validates connectivity against Meta Graph API and only then persists config.
 */
app.post('/api/meta/configurations/upsert', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId, userId } = req.workspaceAdmin;
  const {
    channel_name,
    meta_id,
    waba_id,
    phone_number_id,
    token,
    verify_token,
    default_template_language,
  } = req.body || {};

  if (!meta_id || !waba_id || !phone_number_id || !token || !verify_token) {
    return res.status(400).json({
      error: 'Missing required fields: meta_id, waba_id, phone_number_id, token, verify_token',
    });
  }

  const headers = { Authorization: `Bearer ${token}` };
  const graphVersion = process.env.META_GRAPH_VERSION || 'v23.0';

  try {
    // Validate Facebook App ID with current token.
    const appRes = await fetch(`https://graph.facebook.com/${graphVersion}/${meta_id}?fields=id,name`, { headers });
    const appData = await appRes.json();
    if (!appRes.ok || !appData?.id) {
      return res.status(400).json({ error: appData?.error?.message || 'No se pudo validar Facebook App ID con el token' });
    }

    // Validate WABA access.
    const wabaRes = await fetch(`https://graph.facebook.com/${graphVersion}/${waba_id}?fields=id,name`, { headers });
    const wabaData = await wabaRes.json();
    if (!wabaRes.ok || !wabaData?.id) {
      return res.status(400).json({ error: wabaData?.error?.message || 'No se pudo validar WABA ID con el token' });
    }

    // Validate phone number access.
    const phoneRes = await fetch(`https://graph.facebook.com/${graphVersion}/${phone_number_id}?fields=id,display_phone_number,verified_name`, { headers });
    const phoneData = await phoneRes.json();
    if (!phoneRes.ok || !phoneData?.id) {
      return res.status(400).json({ error: phoneData?.error?.message || 'No se pudo validar Phone Number ID con el token' });
    }

    // Persist only after successful validations.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('whatsapp_configurations')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingError) return res.status(500).json({ error: existingError.message });

    const payload = {
      channel_name: channel_name || null,
      meta_id: String(meta_id),
      waba_id: String(waba_id),
      phone_number_id: String(phone_number_id),
      token: String(token),
      verify_token: String(verify_token),
      default_template_language: String(default_template_language || 'es_LA'),
      updated_by: userId,
    };

    let dbRes;
    if (existing?.id) {
      dbRes = await supabaseAdmin
        .from('whatsapp_configurations')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      dbRes = await supabaseAdmin
        .from('whatsapp_configurations')
        .insert({
          ...payload,
          tenant_id: tenantId,
          created_by: userId,
        })
        .select()
        .single();
    }

    if (dbRes.error) return res.status(500).json({ error: dbRes.error.message });

    return res.status(200).json({
      success: true,
      connection_check: {
        app: { id: appData.id, name: appData.name || null },
        waba: { id: wabaData.id, name: wabaData.name || null },
        phone: {
          id: phoneData.id,
          display_phone_number: phoneData.display_phone_number || null,
          verified_name: phoneData.verified_name || null,
        },
      },
      configuration: dbRes.data,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error validando conexión con Meta' });
  }
});

/**
 * POST /api/meta/templates/create
 * Creates a template in Meta Cloud API and if successful, saves it to Supabase as PENDING
 */
app.post('/api/meta/templates/create', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId, userId } = req.workspaceAdmin;
  const { name, language, category, components, args, template_type } = req.body || {};

  if (!name || !category || !Array.isArray(components) || components.length === 0) {
    return res.status(400).json({
      error: 'Missing required fields: name, category, components[]',
    });
  }

  try {
    const TEMPLATE_TYPES = new Set(['STANDARD', 'CAROUSEL', 'FLOW']);
    const normalizedTemplateType = String(template_type || 'STANDARD').toUpperCase();
    if (!TEMPLATE_TYPES.has(normalizedTemplateType)) {
      return res.status(400).json({ error: 'Invalid template_type', detail: 'Use STANDARD, CAROUSEL, or FLOW' });
    }

    const normalizedCategory = String(category).trim().toUpperCase();
    if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(normalizedCategory)) {
      return res.status(400).json({ error: 'Invalid category', detail: 'Use MARKETING, UTILITY, or AUTHENTICATION' });
    }

    // Basic components validation by type (Meta API will still validate in depth).
    const comps = components;
    const getComp = (type) => comps.find((c) => String(c?.type || '').toUpperCase() === type);
    const header = getComp('HEADER');
    const body = getComp('BODY');
    const buttons = getComp('BUTTONS');
    const carousel = getComp('CAROUSEL');

    if (!body || typeof body.text !== 'string' || body.text.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid components', detail: 'BODY.text is required' });
    }

    if (normalizedTemplateType === 'STANDARD') {
      if (carousel) return res.status(400).json({ error: 'Invalid components', detail: 'STANDARD cannot include CAROUSEL' });
      if (buttons && !Array.isArray(buttons.buttons)) {
        return res.status(400).json({ error: 'Invalid components', detail: 'BUTTONS.buttons must be an array' });
      }
    }

    if (normalizedTemplateType === 'FLOW') {
      if (!buttons || !Array.isArray(buttons.buttons) || buttons.buttons.length === 0) {
        return res.status(400).json({ error: 'Invalid components', detail: 'FLOW templates require BUTTONS.buttons[]' });
      }
      const hasFlow = buttons.buttons.some((b) => String(b?.type || '').toUpperCase() === 'FLOW');
      if (!hasFlow) {
        return res.status(400).json({ error: 'Invalid components', detail: 'FLOW templates require at least one FLOW button' });
      }
    }

    if (normalizedTemplateType === 'CAROUSEL') {
      if (!carousel) {
        return res.status(400).json({ error: 'Invalid components', detail: 'CAROUSEL templates require a CAROUSEL component' });
      }
      // Keep validation light: Meta will enforce card constraints.
    }

    // 1. Get configurations for this tenant
    const { data: config, error: configError } = await supabaseAdmin
      .from('whatsapp_configurations')
      .select('id, waba_id, token, default_template_language')
      .eq('tenant_id', tenantId)
      .single();

    if (configError || !config) {
      return res.status(400).json({ error: 'WhatsApp config not found for this workspace' });
    }

    // 2. Build payload for Meta
    const normalizedName = String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const payload = {
      name: normalizedName,
      language: language || config.default_template_language || 'es_LA',
      category: normalizedCategory,
      components: comps,
    };

    // 3. Send to Meta API
    const metaRes = await fetch(`https://graph.facebook.com/v23.0/${config.waba_id}/message_templates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const metaData = await metaRes.json();
    if (!metaRes.ok) {
      return res.status(metaRes.status).json({
        error: metaData.error?.message || 'Meta API Error',
        details: metaData.error || null,
        meta: {
          type: metaData.error?.type || null,
          code: metaData.error?.code || null,
          error_subcode: metaData.error?.error_subcode || null,
          fbtrace_id: metaData.error?.fbtrace_id || null,
        },
      });
    }

    const normalizedHeaderFormat = (() => {
      if (!header) return 'NONE';
      const fmt = String(header.format || '').toUpperCase();
      if (fmt === 'TEXT') return 'TEXT';
      if (fmt === 'IMAGE') return 'IMAGE';
      if (fmt === 'VIDEO') return 'VIDEO';
      if (fmt === 'DOCUMENT') return 'DOCUMENT';
      return 'NONE';
    })();

    // 4. Save to Supabase DB
    const { data: template, error: dbError } = await supabaseAdmin
      .from('whatsapp_templates')
      .insert({
        whatsapp_configuration_id: config.id,
        template_name: normalizedName,
        format_type: 'positional',
        args: args || [],
        meta_status: String(metaData.status || 'PENDING').toUpperCase(),
        meta_template_id: metaData.id,
        language: payload.language,
        category: normalizedCategory,
        components: comps,
        template_type: normalizedTemplateType,
        header_format: normalizedHeaderFormat,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (dbError) return res.status(500).json({ error: dbError.message });
    return res.status(201).json(template);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/meta/templates/validate
 * Validates/normalizes a template payload without calling Meta API.
 * Useful for wizard preview and detailed UX errors.
 */
app.post('/api/meta/templates/validate', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId } = req.workspaceAdmin;
  const { name, language, category, components, template_type } = req.body || {};

  if (!name || !category || !Array.isArray(components) || components.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: name, category, components[]' });
  }

  try {
    const TEMPLATE_TYPES = new Set(['STANDARD', 'CAROUSEL', 'FLOW']);
    const normalizedTemplateType = String(template_type || 'STANDARD').toUpperCase();
    if (!TEMPLATE_TYPES.has(normalizedTemplateType)) {
      return res.status(400).json({ error: 'Invalid template_type', detail: 'Use STANDARD, CAROUSEL, or FLOW' });
    }

    const normalizedCategory = String(category).trim().toUpperCase();
    if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(normalizedCategory)) {
      return res.status(400).json({ error: 'Invalid category', detail: 'Use MARKETING, UTILITY, or AUTHENTICATION' });
    }

    const comps = components;
    const getComp = (type) => comps.find((c) => String(c?.type || '').toUpperCase() === type);
    const header = getComp('HEADER');
    const body = getComp('BODY');
    const buttons = getComp('BUTTONS');
    const carousel = getComp('CAROUSEL');

    if (!body || typeof body.text !== 'string' || body.text.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid components', detail: 'BODY.text is required' });
    }

    if (normalizedTemplateType === 'STANDARD') {
      if (carousel) return res.status(400).json({ error: 'Invalid components', detail: 'STANDARD cannot include CAROUSEL' });
      if (buttons && !Array.isArray(buttons.buttons)) {
        return res.status(400).json({ error: 'Invalid components', detail: 'BUTTONS.buttons must be an array' });
      }
    }

    if (normalizedTemplateType === 'FLOW') {
      if (!buttons || !Array.isArray(buttons.buttons) || buttons.buttons.length === 0) {
        return res.status(400).json({ error: 'Invalid components', detail: 'FLOW templates require BUTTONS.buttons[]' });
      }
      const hasFlow = buttons.buttons.some((b) => String(b?.type || '').toUpperCase() === 'FLOW');
      if (!hasFlow) {
        return res.status(400).json({ error: 'Invalid components', detail: 'FLOW templates require at least one FLOW button' });
      }
    }

    if (normalizedTemplateType === 'CAROUSEL') {
      if (!carousel) {
        return res.status(400).json({ error: 'Invalid components', detail: 'CAROUSEL templates require a CAROUSEL component' });
      }
    }

    const { data: config, error: configError } = await supabaseAdmin
      .from('whatsapp_configurations')
      .select('default_template_language')
      .eq('tenant_id', tenantId)
      .single();
    if (configError || !config) return res.status(400).json({ error: 'WhatsApp config not found for this workspace' });

    const normalizedName = String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const normalizedLanguage = language || config.default_template_language || 'es_LA';
    const normalizedHeaderFormat = (() => {
      if (!header) return 'NONE';
      const fmt = String(header.format || '').toUpperCase();
      if (fmt === 'TEXT') return 'TEXT';
      if (fmt === 'IMAGE') return 'IMAGE';
      if (fmt === 'VIDEO') return 'VIDEO';
      if (fmt === 'DOCUMENT') return 'DOCUMENT';
      return 'NONE';
    })();

    return res.json({
      success: true,
      normalized: {
        name: normalizedName,
        language: normalizedLanguage,
        category: normalizedCategory,
        template_type: normalizedTemplateType,
        header_format: normalizedHeaderFormat,
        components: comps,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/meta/templates/sync
 * Syncs the status of local templates with Meta
 */
app.get('/api/meta/templates/sync', requireWorkspaceAdmin, async (req, res) => {
  const { tenantId } = req.workspaceAdmin;
  const mode = String(req.query.mode || 'pending').toLowerCase(); // pending | all

  try {
    const { data: config, error: configError } = await supabaseAdmin
      .from('whatsapp_configurations')
      .select('id, waba_id, token')
      .eq('tenant_id', tenantId)
      .single();

    if (configError || !config) return res.status(400).json({ error: 'WhatsApp config not found' });

    // 1) Fetch all templates from Meta
    const metaRes = await fetch(`https://graph.facebook.com/v23.0/${config.waba_id}/message_templates?limit=100`, {
      headers: { 'Authorization': `Bearer ${config.token}` },
    });

    const metaData = await metaRes.json();
    if (!metaRes.ok) return res.status(metaRes.status).json({ error: metaData.error?.message });

    const metaTemplates = metaData.data || [];
    let syncedCount = 0;
    let importedCount = 0;

    // 2) Read all local templates for this tenant config so we can both update and import.
    const { data: localTemplates = [] } = await supabaseAdmin
      .from('whatsapp_templates')
      .select('id, meta_template_id, template_name, meta_status')
      .eq('whatsapp_configuration_id', config.id)
      .is('deleted_at', null);

    const localByMetaId = new Map(localTemplates.filter((t) => t.meta_template_id).map((t) => [t.meta_template_id, t]));
    const localByName = new Map(localTemplates.map((t) => [t.template_name, t]));

    // 3) Update existing local templates from Meta statuses/details.
    for (const local of localTemplates) {
      // Keep old "pending-only" behavior for status update unless mode=all.
      if (mode !== 'all' && local.meta_status !== 'PENDING') continue;
      const match = metaTemplates.find((t) => t.id === local.meta_template_id || t.name === local.template_name);
      if (!match) continue;

      const matchComponents = match.components || undefined;
      const headerComp = Array.isArray(matchComponents)
        ? matchComponents.find((c) => String(c?.type || '').toUpperCase() === 'HEADER')
        : null;
      const headerFormat = (() => {
        if (!headerComp) return undefined;
        const fmt = String(headerComp.format || '').toUpperCase();
        if (fmt === 'TEXT') return 'TEXT';
        if (fmt === 'IMAGE') return 'IMAGE';
        if (fmt === 'VIDEO') return 'VIDEO';
        if (fmt === 'DOCUMENT') return 'DOCUMENT';
        return 'NONE';
      })();

      await supabaseAdmin
        .from('whatsapp_templates')
        .update({
          meta_status: String(match.status || 'PENDING').toUpperCase(),
          meta_template_id: match.id,
          language: match.language || undefined,
          category: match.category || undefined,
          components: matchComponents,
          quality_score: match.quality_score || undefined,
          rejection_reason: match.rejected_reason || match.rejection_reason || undefined,
          header_format: headerFormat,
        })
        .eq('id', local.id);
      syncedCount++;
    }

    // 4) Import templates created directly in Meta but missing locally.
    for (const remote of metaTemplates) {
      const exists = localByMetaId.has(remote.id) || localByName.has(remote.name);
      if (exists) continue;

      const { error: insertError } = await supabaseAdmin
        .from('whatsapp_templates')
        .insert({
          whatsapp_configuration_id: config.id,
          template_name: String(remote.name || '').trim(),
          format_type: 'positional',
          args: [],
          meta_status: String(remote.status || 'PENDING').toUpperCase(),
          meta_template_id: remote.id || null,
          language: remote.language || 'es_LA',
          category: remote.category || 'UTILITY',
          components: remote.components || [],
        });

      if (!insertError) importedCount++;
    }

    return res.json({
      success: true,
      mode: mode === 'all' ? 'all' : 'pending',
      synced: syncedCount,
      imported: importedCount,
      total_remote: metaTemplates.length,
      total_local: localTemplates.length + importedCount,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Admin server running on http://localhost:${PORT}`);
    console.log(`   Supabase: ${process.env.SUPABASE_URL}`);
  });
}

export default app;
