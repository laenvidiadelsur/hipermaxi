import { db } from '../db/index.js';
import { EmailService } from './emailService.js';

export const ActivationService = {
  createRequest(providerData) {
    const newRequest = {
      id: `req_${Date.now()}`,
      providerData,
      status: 'SUBMISSION', // Etapa inicial ITIL
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.activationRequests.push(newRequest);
    
    // Disparar envío de correo a Soporte/Compras en segundo plano
    EmailService.sendNewRequestNotification(newRequest).catch(console.error);

    return newRequest;
  },

  getAll() {
    return db.activationRequests;
  },

  getById(id) {
    return db.activationRequests.find(req => req.id === id);
  },

  updateStatus(id, newStatus) {
    const request = db.activationRequests.find(req => req.id === id);
    if (!request) return { error: 'Solicitud no encontrada' };
    
    request.status = newStatus;
    request.updatedAt = new Date().toISOString();

    // Disparar envío de notificación al proveedor
    EmailService.sendStatusUpdateNotification(request, newStatus).catch(console.error);

    return request;
  }
};
