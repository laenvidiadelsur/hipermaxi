import { Router } from 'express';
import { ProductService } from '../services/productService.js';
import { OrderService } from '../services/orderService.js';

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
