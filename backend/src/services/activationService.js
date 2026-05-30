import { db } from '../db/index.js';

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
    return request;
  }
};
