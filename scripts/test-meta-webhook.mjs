import crypto from "node:crypto";

const baseUrl = process.env.WEBHOOK_BASE_URL || "http://localhost:3002";
const verifyToken = process.env.META_VERIFY_TOKEN || "meta_verify_demo";
const appSecret = process.env.META_APP_SECRET || "meta_app_secret_demo";

async function main() {
  const challenge = "123456";
  const getOk = await fetch(
    `${baseUrl}/webhooks/meta?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${challenge}`
  );
  const getOkText = await getOk.text();
  if (getOk.status !== 200 || getOkText !== challenge) {
    throw new Error(`GET challenge failed: status=${getOk.status} body=${getOkText}`);
  }

  const getFail = await fetch(
    `${baseUrl}/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=1`
  );
  if (getFail.status !== 403) {
    throw new Error(`GET wrong token expected 403, got ${getFail.status}`);
  }

  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "waba-test" }],
  });
  const validSig = crypto.createHmac("sha256", appSecret).update(payload).digest("hex");

  const postOk = await fetch(`${baseUrl}/webhooks/meta`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": `sha256=${validSig}`,
    },
    body: payload,
  });
  if (postOk.status !== 200) {
    const body = await postOk.text();
    throw new Error(`POST valid signature failed: status=${postOk.status} body=${body}`);
  }

  const postFail = await fetch(`${baseUrl}/webhooks/meta`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": "sha256=deadbeef",
    },
    body: payload,
  });
  if (postFail.status !== 401) {
    const body = await postFail.text();
    throw new Error(`POST invalid signature expected 401, got ${postFail.status} body=${body}`);
  }

  console.log("Meta webhook tests OK");
}

main().catch((err) => {
  console.error("Meta webhook tests FAILED:", err.message);
  process.exitCode = 1;
});
