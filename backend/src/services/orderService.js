import { db } from '../db/index.js';
import { ProductService } from './productService.js';

export const OrderService = {
  createQuickOrder(userId, barcode, quantity) {
    const stockCheck = ProductService.checkStock(barcode);
    
    if (stockCheck.error) return { error: stockCheck.error };
    if (!stockCheck.available || stockCheck.stock < quantity) {
      return { error: 'Stock insuficiente para la cantidad solicitada' };
    }

    // Descontar stock
    const product = db.products.find(p => p.barcode === barcode);
    product.stock -= quantity;

    const order = {
      id: `ord_${Date.now()}`,
      userId,
      items: [{
        barcode,
        name: product.name,
        quantity,
        price: product.price
      }],
      total: product.price * quantity,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    db.orders.push(order);
    return order;
  }
};
