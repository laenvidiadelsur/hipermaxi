import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import dotenv from 'dotenv';

// Cargar variables de entorno (solo en local, en Vercel se leen automáticamente)
dotenv.config();

const OAuth2 = google.auth.OAuth2;

/**
 * SERVICIO DE CORREO (Integración GCP)
 * ====================================
 * Este servicio requiere que configures credenciales OAuth2 en Google Cloud.
 * Variables de entorno necesarias:
 * - GCP_CLIENT_ID
 * - GCP_CLIENT_SECRET
 * - GCP_REFRESH_TOKEN
 * - EMAIL_USER (Tu correo de Workspace, ej: soportehub@hipermaxi.com)
 */

const createTransporter = async () => {
  // Verificamos si tenemos las credenciales de GCP, de lo contrario usamos un log para no crashear
  if (!process.env.GCP_CLIENT_ID || !process.env.GCP_REFRESH_TOKEN) {
    console.warn('⚠️ Credenciales GCP no encontradas. Los correos se imprimirán en consola.');
    return null;
  }

  const oauth2Client = new OAuth2(
    process.env.GCP_CLIENT_ID,
    process.env.GCP_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GCP_REFRESH_TOKEN
  });

  const accessToken = await new Promise((resolve, reject) => {
    oauth2Client.getAccessToken((err, token) => {
      if (err) {
        console.error('Error al generar Access Token de GCP:', err);
        reject('Error de autenticación OAuth2');
      }
      resolve(token);
    });
  });

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.EMAIL_USER || 'soportehub@hipermaxi.com',
      accessToken,
      clientId: process.env.GCP_CLIENT_ID,
      clientSecret: process.env.GCP_CLIENT_SECRET,
      refreshToken: process.env.GCP_REFRESH_TOKEN
    }
  });
};

export const EmailService = {
  
  async sendEmail({ to, subject, html }) {
    try {
      const transporter = await createTransporter();
      
      if (!transporter) {
        // Fallback: Imprimir el correo en consola si no hay credenciales GCP
        console.log(`\n📧 [SIMULADOR DE EMAIL] Destino: ${to}`);
        console.log(`Asunto: ${subject}`);
        console.log(`Cuerpo HTML: \n${html}\n`);
        return { success: true, mock: true };
      }

      const mailOptions = {
        from: `Hipermaxi Soporte <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
      };

      const result = await transporter.sendMail(mailOptions);
      console.log('✅ Correo enviado a GCP exitosamente:', result.messageId);
      return { success: true, messageId: result.messageId };

    } catch (error) {
      console.error('❌ Error enviando correo vía GCP:', error);
      return { success: false, error };
    }
  },

  // Plantilla para nueva solicitud (hacia soportehub@hipermaxi.com)
  async sendNewRequestNotification(requestData) {
    const html = `
      <h2>Nueva Solicitud de Activación de Catálogo</h2>
      <p>Se ha recibido una nueva petición en el portal de proveedores.</p>
      <table border="1" cellpadding="5" style="border-collapse: collapse;">
        <tr><td><strong>ID:</strong></td><td>${requestData.id}</td></tr>
        <tr><td><strong>Proveedor:</strong></td><td>${requestData.providerData.razonSocial}</td></tr>
        <tr><td><strong>NIT:</strong></td><td>${requestData.providerData.nit}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${requestData.providerData.email}</td></tr>
        <tr><td><strong>Código Catálogo:</strong></td><td>${requestData.providerData.codigoProveedor}</td></tr>
      </table>
      <p>Por favor revise el panel de administración (Back Office) para aprobar esta solicitud.</p>
    `;
    
    // Asumimos que quieres enviarlo al buzón central de soporte
    await this.sendEmail({
      to: 'soportehub@hipermaxi.com',
      subject: `[Nueva Solicitud] Activación Proveedor: ${requestData.providerData.razonSocial}`,
      html
    });
  },

  // Plantilla para actualizaciones de estado (hacia el proveedor)
  async sendStatusUpdateNotification(requestData, newStatus) {
    const statusMap = {
      'APPROVAL': 'Revisión (Aprobación)',
      'FULFILLMENT': 'Aprobado (Esperando Ejecución)',
      'CLOSURE': 'Código de Proveedor Asignado (Completado)'
    };

    const statusText = statusMap[newStatus] || newStatus;

    const html = `
      <h2>Actualización de Estado: ${statusText}</h2>
      <p>Estimado(a) <strong>${requestData.providerData.nombreProveedor}</strong>,</p>
      <p>Le informamos que su solicitud con ID <strong>${requestData.id}</strong> ha avanzado a la siguiente etapa de nuestro flujo comercial:</p>
      <h3 style="color: #3b82f6;">${statusText}</h3>
      <p>Puede consultar el progreso en tiempo real desde nuestro Portal de Proveedores en el Progress Stepper.</p>
      <p>Atentamente,<br>Equipo de Soporte Hipermaxi S.A.</p>
    `;

    await this.sendEmail({
      to: requestData.providerData.email,
      subject: `Actualización de Solicitud [${requestData.id}] - Hipermaxi`,
      html
    });
  }
};
