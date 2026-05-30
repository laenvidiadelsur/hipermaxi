# Plan de desarrollo de endpoints backend

## Estado actual

- `backend/notes.md` esta vacio.
- No existe todavia una aplicacion backend en `backend/`.
- El unico servicio definido es `n8n` en `docker-compose.yml`, expuesto en `http://localhost:5678`.

Este plan asume que el backend servira como API propia para una aplicacion relacionada con Hipermaxi/supermercado: catalogo, busqueda de productos, carrito, pedidos, usuarios e integraciones con automatizaciones n8n.

## Objetivos

1. Definir una API REST inicial, estable y versionada.
2. Cubrir los flujos principales: catalogo, carrito, checkout, pedidos y autenticacion.
3. Separar endpoints publicos, endpoints autenticados y endpoints administrativos.
4. Dejar puntos claros de integracion con n8n para notificaciones, sincronizacion o workflows.

## Convenciones propuestas

- Prefijo base: `/api/v1`.
- Formato: JSON.
- Autenticacion: Bearer token JWT para usuarios y administradores.
- Fechas: ISO 8601 en UTC.
- Paginacion: `page`, `limit`, `total`, `items`.
- Errores:

```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Producto no encontrado",
    "details": {}
  }
}
```

## Fase 1: Base tecnica

### Healthcheck

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | No | Verificar que la API esta viva |
| GET | `/api/v1/ready` | No | Verificar conexion a DB y servicios externos |

### Configuracion publica

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| GET | `/api/v1/config` | No | Exponer parametros publicos: moneda, pais, limites, version |

## Fase 2: Autenticacion y usuarios

### Auth

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | No | Registrar usuario |
| POST | `/api/v1/auth/login` | No | Iniciar sesion |
| POST | `/api/v1/auth/logout` | Si | Cerrar sesion o invalidar refresh token |
| POST | `/api/v1/auth/refresh` | No | Renovar access token |
| POST | `/api/v1/auth/forgot-password` | No | Solicitar recuperacion de password |
| POST | `/api/v1/auth/reset-password` | No | Confirmar nuevo password |

### Usuarios

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| GET | `/api/v1/users/me` | Si | Obtener perfil propio |
| PATCH | `/api/v1/users/me` | Si | Actualizar perfil propio |
| GET | `/api/v1/users/me/addresses` | Si | Listar direcciones |
| POST | `/api/v1/users/me/addresses` | Si | Crear direccion |
| PATCH | `/api/v1/users/me/addresses/{addressId}` | Si | Actualizar direccion |
| DELETE | `/api/v1/users/me/addresses/{addressId}` | Si | Eliminar direccion |

## Fase 3: Catalogo

### Categorias

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| GET | `/api/v1/categories` | No | Listar categorias activas |
| GET | `/api/v1/categories/{categoryId}` | No | Ver detalle de categoria |

### Productos

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| GET | `/api/v1/products` | No | Listar productos con filtros |
| GET | `/api/v1/products/{productId}` | No | Ver detalle de producto |
| GET | `/api/v1/products/search` | No | Buscar productos por texto |
| GET | `/api/v1/products/featured` | No | Listar destacados |
| GET | `/api/v1/products/offers` | No | Listar ofertas |

Filtros recomendados para `GET /products`:

- `q`
- `categoryId`
- `brand`
- `minPrice`
- `maxPrice`
- `inStock`
- `sort`
- `page`
- `limit`

Respuesta base de producto:

```json
{
  "id": "prod_123",
  "name": "Arroz premium 1kg",
  "description": "Arroz grano largo",
  "brand": "Marca",
  "categoryId": "cat_123",
  "price": 12.5,
  "currency": "BOB",
  "stock": 20,
  "imageUrl": "https://example.com/product.jpg",
  "active": true
}
```

## Fase 4: Carrito

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| GET | `/api/v1/cart` | Si | Obtener carrito activo |
| POST | `/api/v1/cart/items` | Si | Agregar producto al carrito |
| PATCH | `/api/v1/cart/items/{itemId}` | Si | Cambiar cantidad |
| DELETE | `/api/v1/cart/items/{itemId}` | Si | Quitar item |
| DELETE | `/api/v1/cart` | Si | Vaciar carrito |
| POST | `/api/v1/cart/validate` | Si | Validar precios, stock y promociones antes de checkout |

Reglas minimas:

- No permitir cantidades menores a 1.
- Validar stock en cada mutacion.
- Recalcular totales en backend.
- Guardar snapshot de precio al crear pedido, no depender del precio actual del producto.

## Fase 5: Checkout y pedidos

### Checkout

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| POST | `/api/v1/checkout/preview` | Si | Calcular resumen antes de confirmar |
| POST | `/api/v1/checkout/confirm` | Si | Crear pedido desde carrito |

### Pedidos

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| GET | `/api/v1/orders` | Si | Listar pedidos del usuario |
| GET | `/api/v1/orders/{orderId}` | Si | Ver detalle de pedido |
| POST | `/api/v1/orders/{orderId}/cancel` | Si | Cancelar pedido permitido |

Estados sugeridos:

- `pending`
- `confirmed`
- `preparing`
- `ready`
- `delivering`
- `completed`
- `cancelled`

## Fase 6: Pagos

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| GET | `/api/v1/payment-methods` | Si | Listar metodos disponibles |
| POST | `/api/v1/payments/initiate` | Si | Iniciar pago |
| POST | `/api/v1/payments/webhook` | Firma externa | Recibir confirmacion de pasarela |
| GET | `/api/v1/payments/{paymentId}` | Si | Consultar estado de pago |

Notas:

- El webhook debe validar firma o secreto compartido.
- La confirmacion de pago debe ser idempotente.
- El pedido solo debe avanzar a `confirmed` cuando el pago sea valido o cuando el metodo sea pago contra entrega.

## Fase 7: Administracion

Todos los endpoints administrativos requieren rol `admin`.

### Productos admin

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| POST | `/api/v1/admin/products` | Admin | Crear producto |
| PATCH | `/api/v1/admin/products/{productId}` | Admin | Actualizar producto |
| DELETE | `/api/v1/admin/products/{productId}` | Admin | Desactivar producto |
| PATCH | `/api/v1/admin/products/{productId}/stock` | Admin | Ajustar stock |

### Categorias admin

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| POST | `/api/v1/admin/categories` | Admin | Crear categoria |
| PATCH | `/api/v1/admin/categories/{categoryId}` | Admin | Actualizar categoria |
| DELETE | `/api/v1/admin/categories/{categoryId}` | Admin | Desactivar categoria |

### Pedidos admin

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/orders` | Admin | Listar pedidos con filtros |
| GET | `/api/v1/admin/orders/{orderId}` | Admin | Ver pedido |
| PATCH | `/api/v1/admin/orders/{orderId}/status` | Admin | Cambiar estado |

## Fase 8: Integracion con n8n

### Webhooks internos hacia n8n

| Evento | Trigger sugerido | Uso |
| --- | --- | --- |
| `user.registered` | Despues de registro | Email/bienvenida |
| `order.created` | Despues de checkout | Notificar admin o sucursal |
| `order.status_changed` | Cambio de estado | Notificar usuario |
| `payment.confirmed` | Webhook de pago valido | Confirmar flujo de pedido |
| `stock.low` | Stock bajo umbral | Alertar reposicion |

### Endpoint para recibir eventos desde n8n

| Metodo | Endpoint | Auth | Proposito |
| --- | --- | --- | --- |
| POST | `/api/v1/integrations/n8n/events` | API key | Recibir callbacks de workflows |

Requisitos:

- Usar `X-API-Key` o firma HMAC.
- Registrar `eventId` para idempotencia.
- Guardar payload y resultado de procesamiento para auditoria.

## Modelo de datos inicial

Entidades minimas:

- `User`
- `Address`
- `Category`
- `Product`
- `Cart`
- `CartItem`
- `Order`
- `OrderItem`
- `Payment`
- `IntegrationEvent`

Script inicial:

- `backend/db/schema.sql`: esquema PostgreSQL con tablas, enums, relaciones, indices, triggers de `updated_at` e idempotencia para pagos/eventos.

Campos criticos:

- `createdAt`, `updatedAt` en todas las tablas.
- `deletedAt` o `active` para borrado logico en catalogo.
- `status` en pedidos y pagos.
- `externalId` para referencias de pasarelas o n8n.

## Orden recomendado de implementacion

1. Crear scaffold backend y endpoint `/health`.
2. Definir esquema de base de datos y migraciones.
3. Implementar auth basica y usuarios.
4. Implementar categorias y productos publicos.
5. Implementar carrito con validacion de stock.
6. Implementar checkout y pedidos.
7. Implementar endpoints admin.
8. Integrar n8n con eventos idempotentes.
9. Agregar pagos o simulador de pagos.
10. Endurecer seguridad, logs, rate limiting y pruebas.

## Pruebas necesarias

- Unitarias para servicios de catalogo, carrito, checkout y pagos.
- Integracion para endpoints principales.
- Casos de stock insuficiente.
- Casos de precio modificado entre carrito y checkout.
- Idempotencia de webhook de pago.
- Permisos: usuario normal no puede usar `/admin`.
- Validacion de payloads invalidos.

## Pendientes de definicion

- Framework backend: Node.js, NestJS, Express, Spring Boot, FastAPI u otro.
- Base de datos: PostgreSQL recomendado si habra pedidos y pagos.
- Metodo real de pago.
- Manejo de entregas: delivery, pickup o ambos.
- Multi-sucursal: confirmar si stock y pedidos dependen de sucursal.
- Fuente real del catalogo: carga manual, scraping, archivo, ERP o workflow n8n.
