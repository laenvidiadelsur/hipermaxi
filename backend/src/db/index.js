// mock database para desarrollo rapido
const products = [
  { id: 'prod_123', name: 'Arroz premium 1kg', price: 12.5, stock: 20, barcode: '7701234567890' },
  { id: 'prod_124', name: 'Aceite vegetal 1L', price: 15.0, stock: 50, barcode: '7701234567891' },
  { id: 'prod_125', name: 'Galletas de chocolate', price: 8.5, stock: 0, barcode: '7701234567892' },
];

const orders = [];
const activationRequests = [];

export const db = {
  products,
  orders,
  activationRequests,
};
