import express from 'express';
import cors from 'cors';
import PDFDocument from 'pdfkit';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const mcpApp = express();
mcpApp.use(cors());
mcpApp.use(express.json());

// Función constructora para aislar el estado de cada conexión
function createMcpServer() {
  const server = new Server(
    { name: 'AiCobranzas-MCP', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'obtener_resumen_cliente',
          description: 'Obtiene un resumen general de la deuda del cliente (total adeudado, cantidad de facturas pendientes).',
          inputSchema: {
            type: 'object',
            properties: {
              tenant_id: { type: 'string', description: 'El ID del workspace (empresa)' },
              phone_number: { type: 'string', description: 'El teléfono del cliente' }
            },
            required: ['tenant_id', 'phone_number'],
          },
        },
        {
          name: 'listar_facturas_cliente',
          description: 'Lista todas las facturas/deudas específicas de un cliente.',
          inputSchema: {
            type: 'object',
            properties: {
              tenant_id: { type: 'string', description: 'El ID del workspace (empresa)' },
              phone_number: { type: 'string', description: 'El teléfono del cliente' },
              status: { type: 'string', description: 'Estado de la factura (Pending, Paid). Por defecto es Pending.', enum: ['Pending', 'Paid'] }
            },
            required: ['tenant_id', 'phone_number'],
          },
        },
        {
          name: 'ver_detalle_factura',
          description: 'Obtiene los detalles específicos de una factura mediante su ID.',
          inputSchema: {
            type: 'object',
            properties: {
              invoice_id: { type: 'string', description: 'El ID único de la factura (debt_details id)' }
            },
            required: ['invoice_id'],
          },
        },
        {
          name: 'buscar_tenants_por_telefono',
          description: 'Busca todas las empresas (tenants) a las que está asociado un número de teléfono de cliente.',
          inputSchema: {
            type: 'object',
            properties: {
              phone_number: { type: 'string', description: 'El teléfono del cliente a buscar' }
            },
            required: ['phone_number'],
          },
        },
        {
          name: 'generar_qr_factura',
          description: 'Genera un código QR de pago asociado a una factura (debt_detail). Retorna el ID del QR, el monto, y la URL de simulación de pago.',
          inputSchema: {
            type: 'object',
            properties: {
              debt_detail_id: { type: 'string', description: 'El ID de la factura (debt_details) a la que se asociará el QR' },
              base_url: { type: 'string', description: 'URL base del servidor (ej: https://tudominio.vercel.app). Necesario para construir la URL de simulación.' }
            },
            required: ['debt_detail_id', 'base_url'],
          },
        },
        {
          name: 'simular_pago_qr',
          description: 'Simula el pago de un código QR. Marca el QR como pagado y actualiza la factura vinculada a estado Paid.',
          inputSchema: {
            type: 'object',
            properties: {
              qr_id: { type: 'string', description: 'El ID del QR a pagar' }
            },
            required: ['qr_id'],
          },
        }
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    
    // Función auxiliar para buscar cliente
    const getContact = async (tenant_id, phone_number) => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name')
        .eq('tenant_id', tenant_id)
        .eq('phone_number', phone_number)
        .is('deleted_at', null)
        .limit(1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return null;
      return data[0];
    };

    // 1. OBTENER RESUMEN
    if (request.params.name === 'obtener_resumen_cliente') {
      const { tenant_id, phone_number } = request.params.arguments;
      try {
        const contact = await getContact(tenant_id, phone_number);
        if (!contact) return { content: [{ type: 'text', text: `No se encontró cliente con el teléfono ${phone_number}.` }], isError: true };

        const { data: debts, error: debtsErr } = await supabase
          .from('debts')
          .select('total_pending, debt_pending_count, debt_status')
          .eq('tenant_id', tenant_id)
          .eq('contact_id', contact.id)
          .is('deleted_at', null)
          .limit(1);

        if (debtsErr) throw new Error(debtsErr.message);
        if (!debts || debts.length === 0) {
          return { content: [{ type: 'text', text: `El cliente ${contact.name} no tiene registros de deuda globales.` }] };
        }

        const summary = {
          cliente: contact.name,
          estado_general: debts[0].debt_status,
          cantidad_facturas_pendientes: debts[0].debt_pending_count,
          total_adeudado: debts[0].total_pending
        };

        return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error interno: ${err.message}` }], isError: true };
      }
    }

    // 2. LISTAR FACTURAS
    if (request.params.name === 'listar_facturas_cliente') {
      const { tenant_id, phone_number, status = 'Pending' } = request.params.arguments;
      try {
        const contact = await getContact(tenant_id, phone_number);
        if (!contact) return { content: [{ type: 'text', text: `No se encontró cliente con el teléfono ${phone_number}.` }], isError: true };

        const { data: debtDetails, error: debtErr } = await supabase
          .from('debt_details')
          .select('id, debt_description, total, expiration_date, debt_status')
          .eq('contact_id', contact.id)
          .eq('debt_status', status)
          .is('deleted_at', null);

        if (debtErr) throw new Error(debtErr.message);
        if (!debtDetails || debtDetails.length === 0) {
          return { content: [{ type: 'text', text: `El cliente ${contact.name} no tiene facturas en estado ${status}.` }] };
        }

        const list = debtDetails.map(d => ({
          id_factura: d.id,
          concepto: d.debt_description || 'Sin concepto',
          monto: Number(d.total),
          estado: d.debt_status,
          fecha_vencimiento: d.expiration_date
        }));

        return { content: [{ type: 'text', text: JSON.stringify({ cliente: contact.name, facturas: list }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error interno: ${err.message}` }], isError: true };
      }
    }

    // 3. VER DETALLE DE FACTURA
    if (request.params.name === 'ver_detalle_factura') {
      const { invoice_id } = request.params.arguments;
      try {
        const { data: detail, error } = await supabase
          .from('debt_details')
          .select('*')
          .eq('id', invoice_id)
          .is('deleted_at', null)
          .limit(1);

        if (error) throw new Error(error.message);
        if (!detail || detail.length === 0) {
          return { content: [{ type: 'text', text: `No se encontró la factura con ID ${invoice_id}.` }], isError: true };
        }

        return { content: [{ type: 'text', text: JSON.stringify(detail[0], null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error interno: ${err.message}` }], isError: true };
      }
    }

    // 4. BUSCAR TENANTS POR TELÉFONO
    if (request.params.name === 'buscar_tenants_por_telefono') {
      const { phone_number } = request.params.arguments;
      try {
        const { data: contacts, error: contactErr } = await supabase
          .from('contacts')
          .select('tenant_id')
          .eq('phone_number', phone_number)
          .is('deleted_at', null);

        if (contactErr) throw new Error(contactErr.message);
        if (!contacts || contacts.length === 0) {
          return { content: [{ type: 'text', text: JSON.stringify({ asociado: false, tenants: [] }) }] };
        }

        const tenantIds = [...new Set(contacts.map(c => c.tenant_id).filter(Boolean))];
        if (tenantIds.length === 0) {
          return { content: [{ type: 'text', text: JSON.stringify({ asociado: false, tenants: [] }) }] };
        }

        const { data: tenants, error: tenantErr } = await supabase
          .from('tenants')
          .select('id, name')
          .in('id', tenantIds)
          .is('deleted_at', null);

        if (tenantErr) throw new Error(tenantErr.message);

        const list = (tenants || []).map(t => ({
          tenant_id: t.id,
          nombre: t.name
        }));

        return { content: [{ type: 'text', text: JSON.stringify({ asociado: true, tenants: list }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error interno: ${err.message}` }], isError: true };
      }
    }

    // 5. GENERAR QR FACTURA
    if (request.params.name === 'generar_qr_factura') {
      const { debt_detail_id, base_url } = request.params.arguments;
      try {
        // Fetch invoice
        const { data: detail, error: detailErr } = await supabase
          .from('debt_details')
          .select('id, total, debt_status, debt_description, contact_id')
          .eq('id', debt_detail_id)
          .is('deleted_at', null)
          .limit(1);

        if (detailErr) throw new Error(detailErr.message);
        if (!detail || detail.length === 0) {
          return { content: [{ type: 'text', text: `No se encontró factura con ID ${debt_detail_id}.` }], isError: true };
        }

        const invoice = detail[0];
        if (invoice.debt_status === 'Paid') {
          return { content: [{ type: 'text', text: 'Esta factura ya está pagada.' }], isError: true };
        }

        // Create QR
        const { data: qr, error: qrErr } = await supabase
          .from('qrs')
          .insert({ amount: invoice.total, paid: false, paid_at: false })
          .select()
          .single();

        if (qrErr) throw new Error(qrErr.message);

        // Link QR to debt_detail
        const { error: linkErr } = await supabase
          .from('debt_detail_qrs')
          .insert({ debt_detail_id: invoice.id, qr_id: qr.id });

        if (linkErr) throw new Error(linkErr.message);

        const cleanBase = base_url.replace(/\/+$/, '');
        const result = {
          qr_id: qr.id,
          amount: qr.amount,
          paid: false,
          debt_detail_id: invoice.id,
          simulate_url: `${cleanBase}/mcp/qr/simulate/${qr.id}`,
          pay_url: `${cleanBase}/mcp/qr/pay/${qr.id}`,
        };

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error interno: ${err.message}` }], isError: true };
      }
    }

    // 6. SIMULAR PAGO QR
    if (request.params.name === 'simular_pago_qr') {
      const { qr_id } = request.params.arguments;
      try {
        // Verify QR
        const { data: qrData, error: qrErr } = await supabase
          .from('qrs')
          .select('id, paid')
          .eq('id', qr_id)
          .limit(1);

        if (qrErr) throw new Error(qrErr.message);
        if (!qrData || qrData.length === 0) {
          return { content: [{ type: 'text', text: `QR no encontrado con ID ${qr_id}.` }], isError: true };
        }
        if (qrData[0].paid) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Este QR ya fue pagado previamente.' }) }] };
        }

        // Mark QR paid
        const { error: updateQrErr } = await supabase
          .from('qrs')
          .update({ paid: true, paid_at: true })
          .eq('id', qr_id);

        if (updateQrErr) throw new Error(updateQrErr.message);

        // Get linked debt_details and update to Paid
        const { data: links, error: linkErr } = await supabase
          .from('debt_detail_qrs')
          .select('debt_detail_id')
          .eq('qr_id', qr_id);

        if (linkErr) throw new Error(linkErr.message);

        const updatedIds = [];
        if (links && links.length > 0) {
          for (const link of links) {
            const { error: updateErr } = await supabase
              .from('debt_details')
              .update({ debt_status: 'Paid' })
              .eq('id', link.debt_detail_id);

            if (!updateErr) updatedIds.push(link.debt_detail_id);
          }
        }

        const result = {
          success: true,
          message: 'Pago simulado procesado correctamente.',
          qr_id,
          facturas_actualizadas: updatedIds,
        };

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error interno: ${err.message}` }], isError: true };
      }
    }

    throw new Error(`Herramienta no encontrada: ${request.params.name}`);
  });

  return server;
}

// Endpoint de validación rápida para el navegador
mcpApp.get('/mcp/status', (req, res) => {
  res.json({
    status: 'online',
    protocol: 'mcp',
    transport: 'sse',
    version: '1.0.0',
    tools: [
      'obtener_resumen_cliente',
      'listar_facturas_cliente',
      'ver_detalle_factura',
      'buscar_tenants_por_telefono',
      'generar_qr_factura',
      'simular_pago_qr'
    ]
  });
});

// Endpoint directo HTTP REST para buscar tenants sin requerir protocolo MCP completo
mcpApp.get('/mcp/tenants-by-phone', async (req, res) => {
  const { phone_number } = req.query;
  if (!phone_number) {
    return res.status(400).json({ error: 'Falta el parámetro phone_number en la query' });
  }

  try {
    const { data: contacts, error: contactErr } = await supabase
      .from('contacts')
      .select('tenant_id')
      .eq('phone_number', phone_number)
      .is('deleted_at', null);

    if (contactErr) throw new Error(contactErr.message);
    if (!contacts || contacts.length === 0) {
      return res.json({ asociado: false, tenants: [] });
    }

    const tenantIds = [...new Set(contacts.map(c => c.tenant_id).filter(Boolean))];
    if (tenantIds.length === 0) {
      return res.json({ asociado: false, tenants: [] });
    }

    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, name')
      .in('id', tenantIds)
      .is('deleted_at', null);

    if (tenantErr) throw new Error(tenantErr.message);

    const list = (tenants || []).map(t => ({
      tenant_id: t.id,
      nombre: t.name
    }));

    return res.json({ asociado: true, tenants: list });
  } catch (err) {
    return res.status(500).json({ error: `Error interno: ${err.message}` });
  }
});

// ==========================================
// QR Payment Simulation Endpoints
// ==========================================

// Helper: resolve base URL from request
function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// POST /mcp/qr/generate — Generate a QR linked to a debt_detail
mcpApp.post('/mcp/qr/generate', async (req, res) => {
  const { debt_detail_id } = req.body;
  if (!debt_detail_id) {
    return res.status(400).json({ error: 'Falta debt_detail_id en el body' });
  }

  try {
    // 1. Fetch the invoice
    const { data: detail, error: detailErr } = await supabase
      .from('debt_details')
      .select('id, total, debt_status, debt_description, contact_id')
      .eq('id', debt_detail_id)
      .is('deleted_at', null)
      .limit(1);

    if (detailErr) throw new Error(detailErr.message);
    if (!detail || detail.length === 0) {
      return res.status(404).json({ error: `No se encontró factura con ID ${debt_detail_id}` });
    }

    const invoice = detail[0];

    if (invoice.debt_status === 'Paid') {
      return res.status(409).json({ error: 'Esta factura ya está pagada' });
    }

    // 2. Create QR record
    const { data: qr, error: qrErr } = await supabase
      .from('qrs')
      .insert({
        amount: invoice.total,
        paid: false,
        paid_at: false,
      })
      .select()
      .single();

    if (qrErr) throw new Error(qrErr.message);

    // 3. Link QR to debt_detail
    const { error: linkErr } = await supabase
      .from('debt_detail_qrs')
      .insert({
        debt_detail_id: invoice.id,
        qr_id: qr.id,
      });

    if (linkErr) throw new Error(linkErr.message);

    const baseUrl = getBaseUrl(req);
    const simulateUrl = `${baseUrl}/mcp/qr/simulate/${qr.id}`;

    return res.json({
      qr_id: qr.id,
      amount: qr.amount,
      paid: qr.paid,
      debt_detail_id: invoice.id,
      simulate_url: simulateUrl,
    });
  } catch (err) {
    return res.status(500).json({ error: `Error interno: ${err.message}` });
  }
});

// GET /mcp/qr/simulate/:qr_id — Interactive payment simulation page
mcpApp.get('/mcp/qr/simulate/:qr_id', async (req, res) => {
  const { qr_id } = req.params;

  try {
    // Fetch QR
    const { data: qrData, error: qrErr } = await supabase
      .from('qrs')
      .select('*')
      .eq('id', qr_id)
      .limit(1);

    if (qrErr) throw new Error(qrErr.message);
    if (!qrData || qrData.length === 0) {
      return res.status(404).send('QR no encontrado');
    }
    const qr = qrData[0];

    // Fetch linked debt_detail
    const { data: links } = await supabase
      .from('debt_detail_qrs')
      .select('debt_detail_id')
      .eq('qr_id', qr_id)
      .limit(1);

    let invoice = null;
    let contact = null;
    let tenant = null;

    if (links && links.length > 0) {
      const { data: dd } = await supabase
        .from('debt_details')
        .select('id, debt_description, total, expiration_date, debt_status, contact_id, debt_id')
        .eq('id', links[0].debt_detail_id)
        .limit(1);

      if (dd && dd.length > 0) {
        invoice = dd[0];

        const { data: ct } = await supabase
          .from('contacts')
          .select('id, name, phone_number, tenant_id')
          .eq('id', invoice.contact_id)
          .limit(1);

        if (ct && ct.length > 0) {
          contact = ct[0];

          const { data: tn } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('id', contact.tenant_id)
            .limit(1);

          if (tn && tn.length > 0) tenant = tn[0];
        }
      }
    }

    const baseUrl = getBaseUrl(req);
    const payUrl = `${baseUrl}/mcp/qr/pay/${qr_id}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`${baseUrl}/mcp/qr/simulate/${qr_id}`)}`;
    const isPaid = qr.paid;

    const amountFormatted = Number(qr.amount).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pago QR — ${tenant ? tenant.name : 'AiCobranzas'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
      color: #e2e8f0;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 440px;
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 24px;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 32px 64px rgba(0,0,0,0.4);
      animation: slideUp 0.6s ease-out;
    }
    @keyframes slideUp {
      from { opacity:0; transform:translateY(30px); }
      to   { opacity:1; transform:translateY(0); }
    }
    .logo { font-size: 14px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #a78bfa; margin-bottom: 8px; }
    .company { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #94a3b8; margin-bottom: 28px; }
    .qr-wrap {
      display: inline-block;
      padding: 16px;
      background: #fff;
      border-radius: 16px;
      margin-bottom: 28px;
      box-shadow: 0 8px 24px rgba(167,139,250,0.25);
      transition: transform 0.3s;
    }
    .qr-wrap:hover { transform: scale(1.04); }
    .qr-wrap img { display: block; width: 200px; height: 200px; }
    .amount-label { font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .amount { font-size: 38px; font-weight: 800; color: #fff; margin-bottom: 8px; }
    .amount span { font-size: 18px; font-weight: 600; color: #a78bfa; }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 24px 0;
      text-align: left;
    }
    .info-item { background: rgba(255,255,255,0.04); border-radius: 12px; padding: 12px 14px; }
    .info-item .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .info-item .value { font-size: 14px; font-weight: 600; color: #e2e8f0; word-break: break-word; }
    .info-full { grid-column: 1 / -1; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 24px;
    }
    .badge-pending { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
    .badge-paid { background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
    .badge svg { width: 16px; height: 16px; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 16px 24px;
      border: none;
      border-radius: 14px;
      font-family: 'Inter', sans-serif;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.25s;
      position: relative;
      overflow: hidden;
    }
    .btn-pay {
      background: linear-gradient(135deg, #8b5cf6, #6d28d9);
      color: #fff;
      box-shadow: 0 8px 24px rgba(139,92,246,0.35);
    }
    .btn-pay:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 12px 32px rgba(139,92,246,0.5);
    }
    .btn-pay:active:not(:disabled) { transform: translateY(0); }
    .btn-pay:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-paid {
      background: linear-gradient(135deg, #059669, #047857);
      color: #fff;
      cursor: default;
    }
    .spinner {
      width: 20px; height: 20px;
      border: 3px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: none;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .confetti-canvas { position: fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:9999; }
    @keyframes checkmark {
      0%   { stroke-dashoffset: 48; }
      100% { stroke-dashoffset: 0; }
    }
    .check-icon { display: none; }
    .check-icon svg {
      stroke-dasharray: 48;
      stroke-dashoffset: 48;
      animation: checkmark 0.5s ease-out forwards;
    }
    .success-glow {
      animation: glow 1.5s ease-in-out infinite alternate;
    }
    @keyframes glow {
      from { box-shadow: 0 0 8px rgba(52,211,153,0.3); }
      to   { box-shadow: 0 0 24px rgba(52,211,153,0.6); }
    }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="logo">⚡ AiCobranzas</div>
    <div class="company">${tenant ? tenant.name : 'Empresa'}</div>
    <div class="subtitle">Simulación de Pago por Código QR</div>

    <div class="qr-wrap">
      <img src="${qrImageUrl}" alt="Código QR de pago" />
    </div>

    <div class="amount-label">Monto a pagar</div>
    <div class="amount"><span>Bs. </span>${amountFormatted}</div>

    <div class="info-grid">
      <div class="info-item">
        <div class="label">Cliente</div>
        <div class="value">${contact ? contact.name : '—'}</div>
      </div>
      <div class="info-item">
        <div class="label">Teléfono</div>
        <div class="value">${contact ? contact.phone_number : '—'}</div>
      </div>
      <div class="info-item info-full">
        <div class="label">Concepto</div>
        <div class="value">${invoice ? (invoice.debt_description || 'Sin descripción') : '—'}</div>
      </div>
      <div class="info-item">
        <div class="label">Vencimiento</div>
        <div class="value">${invoice ? invoice.expiration_date : '—'}</div>
      </div>
      <div class="info-item">
        <div class="label">ID Factura</div>
        <div class="value" style="font-size:11px;">${invoice ? invoice.id : '—'}</div>
      </div>
    </div>

    <div id="badge">
      ${isPaid
        ? '<span class="badge badge-paid success-glow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg> PAGADO</span>'
        : '<span class="badge badge-pending"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> PENDIENTE</span>'
      }
    </div>

    ${isPaid
      ? '<button class="btn btn-paid" disabled><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg> Pago Completado</button>'
      : `<button class="btn btn-pay" id="payBtn" onclick="simulatePay()">
          <span id="btnText">💳 Confirmar Pago Simulado</span>
          <div class="spinner" id="spinner"></div>
          <span class="check-icon" id="checkIcon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span>
        </button>`
    }
  </div>

  <canvas class="confetti-canvas" id="confetti"></canvas>

  <script>
    async function simulatePay() {
      const btn = document.getElementById('payBtn');
      const text = document.getElementById('btnText');
      const spinner = document.getElementById('spinner');
      const checkIcon = document.getElementById('checkIcon');
      const badge = document.getElementById('badge');

      btn.disabled = true;
      text.style.display = 'none';
      spinner.style.display = 'inline-block';

      try {
        const resp = await fetch('${payUrl}', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await resp.json();

        if (data.success) {
          spinner.style.display = 'none';
          checkIcon.style.display = 'inline-flex';
          btn.className = 'btn btn-paid';

          badge.innerHTML = '<span class="badge badge-paid success-glow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg> PAGADO</span>';

          // Confetti burst
          launchConfetti();

          setTimeout(() => {
            btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg> Pago Completado';
          }, 800);
        } else {
          text.textContent = 'Error — Reintentar';
          text.style.display = 'inline';
          spinner.style.display = 'none';
          btn.disabled = false;
        }
      } catch (e) {
        text.textContent = 'Error de red — Reintentar';
        text.style.display = 'inline';
        spinner.style.display = 'none';
        btn.disabled = false;
      }
    }

    // Simple confetti implementation
    function launchConfetti() {
      const canvas = document.getElementById('confetti');
      const ctx = canvas.getContext('2d');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const colors = ['#8b5cf6','#a78bfa','#34d399','#fbbf24','#f472b6','#60a5fa','#fff'];
      const pieces = [];
      for (let i = 0; i < 150; i++) {
        pieces.push({
          x: canvas.width * 0.5 + (Math.random() - 0.5) * 200,
          y: canvas.height * 0.5,
          vx: (Math.random() - 0.5) * 16,
          vy: -(Math.random() * 14 + 4),
          w: Math.random() * 8 + 4,
          h: Math.random() * 6 + 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          rot: Math.random() * 360,
          rv: (Math.random() - 0.5) * 12,
          gravity: 0.25 + Math.random() * 0.15,
          opacity: 1,
        });
      }

      let frame = 0;
      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        for (const p of pieces) {
          p.x += p.vx;
          p.vy += p.gravity;
          p.y += p.vy;
          p.rot += p.rv;
          if (frame > 60) p.opacity -= 0.015;
          if (p.opacity <= 0) continue;
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * Math.PI / 180);
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
          ctx.restore();
        }
        frame++;
        if (alive && frame < 200) requestAnimationFrame(draw);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(draw);
    }
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    return res.status(500).json({ error: `Error interno: ${err.message}` });
  }
});

// POST /mcp/qr/pay/:qr_id — Process simulated payment
mcpApp.post('/mcp/qr/pay/:qr_id', async (req, res) => {
  const { qr_id } = req.params;

  try {
    // 1. Verify QR exists and is not already paid
    const { data: qrData, error: qrErr } = await supabase
      .from('qrs')
      .select('id, paid')
      .eq('id', qr_id)
      .limit(1);

    if (qrErr) throw new Error(qrErr.message);
    if (!qrData || qrData.length === 0) {
      return res.status(404).json({ error: 'QR no encontrado' });
    }
    if (qrData[0].paid) {
      return res.json({ success: true, message: 'Este QR ya fue pagado previamente' });
    }

    // 2. Mark QR as paid
    const { error: updateQrErr } = await supabase
      .from('qrs')
      .update({ paid: true, paid_at: true })
      .eq('id', qr_id);

    if (updateQrErr) throw new Error(updateQrErr.message);

    // 3. Get linked debt_detail
    const { data: links, error: linkErr } = await supabase
      .from('debt_detail_qrs')
      .select('debt_detail_id')
      .eq('qr_id', qr_id);

    if (linkErr) throw new Error(linkErr.message);

    // 4. Update each linked debt_detail to Paid
    if (links && links.length > 0) {
      for (const link of links) {
        const { error: updateErr } = await supabase
          .from('debt_details')
          .update({ debt_status: 'Paid' })
          .eq('id', link.debt_detail_id);

        if (updateErr) {
          console.error(`[QR] Error actualizando debt_detail ${link.debt_detail_id}:`, updateErr.message);
        }
      }
    }

    return res.json({ success: true, message: 'Pago simulado procesado correctamente' });
  } catch (err) {
    return res.status(500).json({ error: `Error interno: ${err.message}` });
  }
});

// GET /mcp/receipt/:debt_detail_id/pdf — On-the-fly PDF receipt generation
mcpApp.get('/mcp/receipt/:debt_detail_id/pdf', async (req, res) => {
  const { debt_detail_id } = req.params;

  try {
    // 1. Fetch debt_detail
    const { data: dd, error: ddErr } = await supabase
      .from('debt_details')
      .select('id, debt_description, total, debt_status, created_at, expiration_date, contact_id')
      .eq('id', debt_detail_id)
      .limit(1);

    if (ddErr) throw new Error(ddErr.message);
    if (!dd || dd.length === 0) {
      return res.status(404).send('Factura no encontrada');
    }
    const invoice = dd[0];

    // 2. Fetch contact
    const { data: ct, error: ctErr } = await supabase
      .from('contacts')
      .select('name, phone_number, tenant_id')
      .eq('id', invoice.contact_id)
      .limit(1);

    if (ctErr) throw new Error(ctErr.message);
    const contact = ct && ct.length > 0 ? ct[0] : { name: 'Cliente Desconocido', phone_number: '', tenant_id: null };

    // 3. Fetch tenant
    let tenantName = 'AiCobranzas';
    if (contact.tenant_id) {
      const { data: tn } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', contact.tenant_id)
        .limit(1);
      if (tn && tn.length > 0) tenantName = tn[0].name;
    }

    // 4. Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo-${debt_detail_id}.pdf"`);

    doc.pipe(res);

    // Styling & Content
    doc.fillColor('#4f46e5').fontSize(24).text('RECIBO DE PAGO', { align: 'right' });
    doc.moveDown(0.5);
    doc.fillColor('#1f2937').fontSize(14).text(tenantName, { align: 'right' });
    doc.fillColor('#6b7280').fontSize(10).text(`Generado: ${new Date().toLocaleDateString('es-BO')}`, { align: 'right' });
    
    doc.moveDown(3);
    
    // Status Badge
    if (invoice.debt_status === 'Paid') {
      doc.rect(50, doc.y, 100, 25).fill('#dcfce7');
      doc.fillColor('#166534').fontSize(12).text('PAGADO', 50, doc.y - 20, { width: 100, align: 'center' });
    } else {
      doc.rect(50, doc.y, 100, 25).fill('#fef3c7');
      doc.fillColor('#92400e').fontSize(12).text('PENDIENTE', 50, doc.y - 20, { width: 100, align: 'center' });
    }

    doc.moveDown(3);

    // Client Info
    doc.fillColor('#374151').fontSize(12).text('DATOS DEL CLIENTE', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Nombre: ${contact.name}`);
    doc.text(`Teléfono: ${contact.phone_number}`);
    
    doc.moveDown(2);

    // Invoice Info
    doc.fontSize(12).text('DETALLE DE FACTURACIÓN', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Concepto: ${invoice.debt_description || 'Sin concepto'}`);
    doc.text(`ID Transacción: ${invoice.id}`);
    if (invoice.expiration_date) {
      doc.text(`Vencimiento Original: ${invoice.expiration_date}`);
    }

    doc.moveDown(2);

    // Amount
    doc.rect(50, doc.y, 495, 40).fill('#f3f4f6');
    doc.fillColor('#111827').fontSize(14).text(`Monto Total: Bs. ${Number(invoice.total).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 60, doc.y - 28);

    doc.moveDown(4);

    // Footer
    doc.fillColor('#9ca3af').fontSize(8).text('Este documento es un comprobante de pago generado electrónicamente y no tiene validez fiscal salvo que se indique lo contrario.', { align: 'center' });

    doc.end();

  } catch (err) {
    console.error('[PDF Error]', err);
    if (!res.headersSent) {
      return res.status(500).send(`Error generando PDF: ${err.message}`);
    }
  }
});

// ==========================================
// Transporte SSE (Requerido por n8n, Claude Desktop, etc)
// ==========================================
const activeSessions = new Map();

mcpApp.get('/mcp/sse', async (req, res) => {
  console.log('[MCP] Nueva conexión SSE inicializada');
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const transport = new SSEServerTransport('/mcp/messages', res);
  const server = createMcpServer();
  
  await server.connect(transport);
  
  if (transport.sessionId) {
    activeSessions.set(transport.sessionId, transport);
    
    res.on('close', () => {
      console.log(`[MCP] Conexión SSE cerrada: ${transport.sessionId}`);
      activeSessions.delete(transport.sessionId);
    });
  }
});

mcpApp.post('/mcp/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  
  if (!sessionId) {
    return res.status(400).send('Falta sessionId en la URL');
  }

  const transport = activeSessions.get(sessionId);
  if (!transport) {
    return res.status(404).send('Sesión no encontrada o ya expiró');
  }

  await transport.handlePostMessage(req, res, req.body);
});

export default mcpApp;
