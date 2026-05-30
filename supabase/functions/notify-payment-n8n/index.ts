import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
// El usuario puede definir N8N_WEBHOOK_URL en los secretos de Supabase.
// Si no, usaremos la URL quemada que pasó como fallback, pero se aconseja el secreto.
const N8N_WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL") || "https://n8n-dev.ribentek.com/webhook-test/bca79ee0-b925-43bb-a8f1-541ec8ea5827";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

Deno.serve(async (req) => {
  try {
    // Solo permitimos POST
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // El payload que manda el Database Webhook
    const payload = await req.json();

    console.log("Recibido webhook de BD:", JSON.stringify(payload));

    // Validar que el evento sea de debt_details y tenga record
    if (payload.table !== "debt_details" || !payload.record) {
      return new Response("Invalid payload", { status: 400 });
    }

    const record = payload.record;

    // Solo procesar si el estado es 'Paid'
    if (record.debt_status !== "Paid") {
      return new Response("Not Paid, ignoring.", { status: 200 });
    }

    const invoiceId = record.id;
    const contactId = record.contact_id;
    const debtDescription = record.debt_description || "Sin concepto";
    const amount = record.debt_amount || record.total;

    // 1. Obtener datos del cliente (contacts)
    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("name, phone_number, tenant_id")
      .eq("id", contactId)
      .limit(1)
      .single();

    if (contactErr) {
      console.error("Error obteniendo cliente:", contactErr);
      return new Response(JSON.stringify({ error: "Client fetch error" }), { status: 500 });
    }

    // 2. Obtener datos del tenant
    let tenantName = "AiCobranzas";
    if (contact?.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", contact.tenant_id)
        .limit(1)
        .single();
      
      if (tenant) {
        tenantName = tenant.name;
      }
    }

    // 3. Construir el JSON limpio (Normalizado)
    const pdfUrl = `https://ribentek-cobranza.vercel.app/mcp/receipt/${invoiceId}/pdf`;

    const cleanPayload = {
      invoice_id: invoiceId,
      pdf_url: pdfUrl,
      debt_description: debtDescription,
      amount: amount,
      customer_name: contact?.name || "Cliente",
      phone_number: contact?.phone_number || "",
      tenant_name: tenantName
    };

    console.log("Enviando a n8n:", JSON.stringify(cleanPayload));

    // 4. Mandar a n8n
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cleanPayload)
    });

    if (!n8nResponse.ok) {
      console.error(`Error enviando a n8n: HTTP ${n8nResponse.status}`);
      return new Response(JSON.stringify({ error: "Failed to forward to n8n" }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, forwarded: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Internal Edge Function Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
