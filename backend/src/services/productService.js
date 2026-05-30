import { db } from '../db/index.js';

export const ProductService = {
  search(query) {
    if (!query) return db.products;
    const lowerQuery = query.toLowerCase();
    return db.products.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) || 
      p.barcode === query
    );
  },

  checkStock(barcode) {
    const product = db.products.find(p => p.barcode === barcode);
    if (!product) {
      return { error: 'Producto no encontrado', available: false };
    }
    return {
      product: product.name,
      price: product.price,
      stock: product.stock,
      available: product.stock > 0
    };
  }
};
