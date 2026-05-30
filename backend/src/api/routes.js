import { Router } from 'express';
import { ProductService } from '../services/productService.js';
import { OrderService } from '../services/orderService.js';
import { ActivationService } from '../services/activationService.js';

export const apiRouter = Router();

// Endpoint para buscar productos (ElevenLabs usa este URL)
apiRouter.get('/tools/products', (req, res) => {
  const { query } = req.query;
  const results = ProductService.search(query);
  res.json({ results });
});

// Endpoint para verificar stock
apiRouter.get('/tools/stock', (req, res) => {
  const { barcode } = req.query;
  const result = ProductService.checkStock(barcode);
  res.json(result);
});

// Endpoint para crear un pedido rápido
apiRouter.post('/tools/orders', (req, res) => {
  const { userId, barcode, quantity } = req.body;
  if (!userId || !barcode || !quantity) {
    return res.status(400).json({ error: 'Faltan parametros requeridos' });
  }
  const result = OrderService.createQuickOrder(userId, barcode, parseInt(quantity));
  res.json(result);
});

// -- ENDPOINTS PARA MODULO DE ACTIVACIONES (ITIL) --

apiRouter.post('/activations', (req, res) => {
  const result = ActivationService.createRequest(req.body);
  res.json(result);
});

apiRouter.get('/activations', (req, res) => {
  res.json(ActivationService.getAll());
});

apiRouter.get('/activations/:id', (req, res) => {
  const result = ActivationService.getById(req.params.id);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
});

apiRouter.patch('/activations/:id/status', (req, res) => {
  const { status } = req.body;
  const result = ActivationService.updateStatus(req.params.id, status);
  res.json(result);
});

