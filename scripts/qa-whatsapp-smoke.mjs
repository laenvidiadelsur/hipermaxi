import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function logStep(name) {
  console.log(`\n[QA] ${name}`);
}

async function run() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminBaseUrl = process.env.ADMIN_BASE_URL || "http://localhost:3001";
  const challenge = process.env.QA_WEBHOOK_CHALLENGE || "123456";

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  logStep("Loading active whatsapp configuration");
  const { data: cfg, error: cfgErr } = await supabase
    .from("whatsapp_configurations")
    .select("id, tenant_id, phone_number_id, verify_token")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cfgErr) throw new Error(`Config query failed: ${cfgErr.message}`);
  if (!cfg) throw new Error("No active whatsapp_configurations found");
  if (!cfg.phone_number_id) throw new Error("Config exists but phone_number_id is null");
  if (!cfg.verify_token) throw new Error("Config exists but verify_token is null");

  console.log(`[QA] tenant=${cfg.tenant_id} config=${cfg.id} phone_number_id=${cfg.phone_number_id}`);

  logStep("Health check");
  const healthRes = await fetch(`${adminBaseUrl}/health`);
  if (!healthRes.ok) throw new Error(`Health failed: HTTP ${healthRes.status}`);
  const healthJson = await healthRes.json();
  console.log(`[QA] health status=${healthJson.status}`);

  logStep("Webhook verify with valid token");
  const okVerifyRes = await fetch(
    `${adminBaseUrl}/webhooks/meta?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(cfg.verify_token)}&hub.challenge=${challenge}`
  );
  const okVerifyText = await okVerifyRes.text();
  if (okVerifyRes.status !== 200 || okVerifyText !== challenge) {
    throw new Error(`Webhook verify(valid) failed: HTTP ${okVerifyRes.status}, body=${okVerifyText}`);
  }
  console.log("[QA] webhook verify(valid)=PASS");

  logStep("Webhook verify with invalid token");
  const badVerifyRes = await fetch(
    `${adminBaseUrl}/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=1`
  );
  if (badVerifyRes.status !== 403) {
    const body = await badVerifyRes.text();
    throw new Error(`Webhook verify(invalid) expected 403, got ${badVerifyRes.status}, body=${body}`);
  }
  console.log("[QA] webhook verify(invalid)=PASS");

  logStep("Inbound webhook simulation (unknown phone_number_id)");
  const inboundPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "qa-entry",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "qa_unknown_phone_number_id" },
              contacts: [{ profile: { name: "QA Contact" }, wa_id: "573001112233" }],
              messages: [
                {
                  id: "wamid.qa.test",
                  from: "573001112233",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "QA inbound test" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const inboundRes = await fetch(`${adminBaseUrl}/webhooks/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inboundPayload),
  });
  if (inboundRes.status !== 200) {
    const body = await inboundRes.text();
    throw new Error(`Inbound webhook simulation failed: HTTP ${inboundRes.status}, body=${body}`);
  }
  const inboundJson = await inboundRes.json().catch(() => ({ ok: false }));
  console.log(`[QA] inbound webhook status=200 ok=${String(inboundJson.ok)}`);

  logStep("Summary");
  console.log("[QA] PASS - smoke checks completed");
  console.log("[QA] NOTE - protected endpoints (/api/meta/*) require user JWT and were not executed by this script.");
}

run().catch((error) => {
  console.error(`[QA] FAIL - ${error.message}`);
  process.exitCode = 1;
});

