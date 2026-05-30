import { Router } from 'express';

export const webhookRouter = Router();

/**
 * ENDPOINT DE RECEPCIÓN DE CORREOS (Google Cloud Pub/Sub)
 * =======================================================
 * Este endpoint está diseñado para recibir Webhooks (Push)
 * desde Google Cloud Pub/Sub cuando llegue un nuevo correo
 * al buzón de Gmail de soportehub@hipermaxi.com.
 */

webhookRouter.post('/gmail', (req, res) => {
  try {
    // 1. Google Pub/Sub envía los datos codificados en Base64 dentro de req.body.message.data
    const messageData = req.body?.message?.data;
    if (!messageData) {
      return res.status(400).send('Bad Request: Missing data');
    }

    const payload = JSON.parse(Buffer.from(messageData, 'base64').toString('utf8'));
    
    console.log('📬 [GCP PUB/SUB] Nuevo correo recibido en el buzón:', payload.emailAddress);
    
    // Aquí puedes invocar un servicio que lea el ID del correo con la Gmail API
    // y actualice el ticket correspondiente en la base de datos si es una respuesta de un proveedor.

    // Siempre responder 200 OK rápidamente para que GCP no reintente el envío
    res.status(200).send('Webhook recibido');
  } catch (error) {
    console.error('Error procesando el Webhook de GCP:', error);
    res.status(500).send('Internal Server Error');
  }
});
