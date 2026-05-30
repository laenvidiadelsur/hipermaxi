import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

readEnvFile(path.resolve("server/.env"));
readEnvFile(path.resolve(".env.local"));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_URL = process.env.VITE_ADMIN_SERVER_URL || "http://localhost:3001";

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now();
const inviterEmail = `inviter.${stamp}@example.com`;
const inviteeEmail = `invitee.${stamp}@example.com`;
const password = "TmpFlow123!";
let inviterAuthId = null;
let inviteeAuthId = null;

async function main() {
  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .select("id,name")
    .is("deleted_at", null)
    .limit(1)
    .single();
  if (tenantErr || !tenant) throw new Error(`No tenant found: ${tenantErr?.message ?? "unknown"}`);

  const inviterAuth = await admin.auth.admin.createUser({
    email: inviterEmail,
    password,
    email_confirm: true,
  });
  if (inviterAuth.error || !inviterAuth.data.user) throw new Error(`Create inviter auth failed: ${inviterAuth.error?.message}`);
  inviterAuthId = inviterAuth.data.user.id;

  const inviteeAuth = await admin.auth.admin.createUser({
    email: inviteeEmail,
    password,
    email_confirm: true,
  });
  if (inviteeAuth.error || !inviteeAuth.data.user) throw new Error(`Create invitee auth failed: ${inviteeAuth.error?.message}`);
  inviteeAuthId = inviteeAuth.data.user.id;

  const { error: inviterProfileErr } = await admin.from("users").insert({
    id: inviterAuthId,
    name: "Inviter QA",
    email: inviterEmail,
    role: "Admin",
    tenant_id: tenant.id,
    enabled: true,
  });
  if (inviterProfileErr) throw new Error(`Inviter profile insert failed: ${inviterProfileErr.message}`);

  const { error: inviteeProfileErr } = await admin.from("users").insert({
    id: inviteeAuthId,
    name: "Invitee QA",
    email: inviteeEmail,
    role: "Agente",
    tenant_id: tenant.id,
    enabled: true,
  });
  if (inviteeProfileErr) throw new Error(`Invitee profile insert failed: ${inviteeProfileErr.message}`);

  const { error: membershipErr } = await admin.from("tenant_members").upsert(
    {
      tenant_id: tenant.id,
      user_id: inviterAuthId,
      role: "Admin",
      enabled: true,
    },
    { onConflict: "tenant_id,user_id" }
  );
  if (membershipErr) throw new Error(`Inviter membership failed: ${membershipErr.message}`);

  const inviterLogin = await anon.auth.signInWithPassword({ email: inviterEmail, password });
  if (inviterLogin.error || !inviterLogin.data.session) {
    throw new Error(`Inviter login failed: ${inviterLogin.error?.message}`);
  }
  const inviteeLogin = await anon.auth.signInWithPassword({ email: inviteeEmail, password });
  if (inviteeLogin.error || !inviteeLogin.data.session) {
    throw new Error(`Invitee login failed: ${inviteeLogin.error?.message}`);
  }

  const createInviteRes = await fetch(`${ADMIN_URL}/admin/invites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${inviterLogin.data.session.access_token}`,
      "x-tenant-id": tenant.id,
    },
    body: JSON.stringify({ email: inviteeEmail, role: "Agente" }),
  });
  const createInviteJson = await createInviteRes.json();
  if (!createInviteRes.ok) throw new Error(`Create invite failed: ${JSON.stringify(createInviteJson)}`);
  const token = createInviteJson.id;

  const validateRes = await fetch(`${ADMIN_URL}/invites/${token}`);
  const validateJson = await validateRes.json();
  if (!validateRes.ok) throw new Error(`Validate invite failed: ${JSON.stringify(validateJson)}`);

  const acceptRes = await fetch(`${ADMIN_URL}/invites/${token}/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${inviteeLogin.data.session.access_token}`,
    },
  });
  const acceptJson = await acceptRes.json();
  if (!acceptRes.ok) throw new Error(`Accept invite failed: ${JSON.stringify(acceptJson)}`);

  const { data: finalMember, error: finalMemberErr } = await admin
    .from("tenant_members")
    .select("tenant_id,user_id,role,enabled")
    .eq("tenant_id", tenant.id)
    .eq("user_id", inviteeAuthId)
    .maybeSingle();
  if (finalMemberErr || !finalMember) {
    throw new Error(`Membership verification failed: ${finalMemberErr?.message ?? "not found"}`);
  }

  console.log("E2E invite flow OK");
  console.log(
    JSON.stringify(
      {
        tenant: tenant.name,
        invite_token: token,
        invite_validation_email: validateJson.email,
        accept_result: acceptJson.success,
        final_role: finalMember.role,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error("E2E invite flow FAILED:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (inviterAuthId) {
      await admin.from("tenant_members").delete().eq("user_id", inviterAuthId);
      await admin.from("users").delete().eq("id", inviterAuthId);
      await admin.auth.admin.deleteUser(inviterAuthId);
    }
    if (inviteeAuthId) {
      await admin.from("tenant_members").delete().eq("user_id", inviteeAuthId);
      await admin.from("users").delete().eq("id", inviteeAuthId);
      await admin.auth.admin.deleteUser(inviteeAuthId);
    }
  });
