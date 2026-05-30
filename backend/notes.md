Para simular la página del Portal de Proveedores de Hipermaxi, no te enfoques en “acciones administrativas internas”, sino en las **acciones visibles que el proveedor realiza dentro del portal**.

Estas serían las principales:

## 1. Iniciar sesión

El proveedor:

* Ingresa al Portal Web de Proveedores.
* Escribe usuario y contraseña.
* Accede con sus credenciales.
* Confirma si el acceso funciona correctamente.
* Si no puede ingresar, solicita ayuda o reenvío de credenciales.

Esto corresponde al flujo de credenciales, donde el proveedor debe validar el correcto funcionamiento del acceso recibido. 

## 2. Consultar módulos disponibles

Dentro del portal, el proveedor debería ver accesos a módulos como:

* Catálogo Electrónico.
* Compras.
* Órdenes de Compra.
* Facturación.
* Aviso de Despacho.
* Soporte o ayuda.
* Manuales / guías / preguntas frecuentes.

Esto se alinea con el desafío, porque el asistente debe ayudar en accesos, facturación, órdenes de compra, AVD, carga documental y consultas generales del portal. 

## 3. Registrar productos en Catálogo Electrónico

En la simulación, este sería uno de los flujos más importantes.

El proveedor:

* Entra al módulo **Catálogo Electrónico**.
* Abre el formulario **Productos**.
* Selecciona la opción para crear o registrar nuevo producto.
* Completa datos del producto:

  * Descripción.
  * Código interno proveedor.
  * Código de barra.
  * Etiqueta del producto.
  * Dimensiones.
  * Precio.
  * Unidad de medida.
  * Registro sanitario, si aplica.
* Carga imágenes del producto en formato JPG o PNG.
* Presiona **Guardar**.
* Si falta información, corrige los campos marcados.
* Confirma que el producto fue registrado.

En el procedimiento se indica que los problemas frecuentes ocurren por campos obligatorios incompletos, archivos con formato incorrecto o información insuficiente. 

## 4. Consultar órdenes de compra

En el módulo de compras, el proveedor:

* Ingresa a **Órdenes de Compra**.
* Busca o selecciona una orden.
* Revisa los datos de la orden:

  * Número de orden.
  * Productos.
  * Cantidades.
  * Precios.
  * Montos.
  * Estado.
* Verifica si la orden está habilitada para cargar factura.
* Si no aparece la opción de facturar, consulta el motivo.

Este flujo es importante porque el documento indica que a veces no aparece el botón para cargar factura porque la orden todavía no fue habilitada por el área correspondiente. 

## 5. Cargar factura

El proveedor:

* Entra al módulo **Compras**.
* Abre la orden de compra correspondiente.
* Selecciona la opción **Cargar factura**.
* Adjunta la factura en formato PDF.
* Verifica que el archivo no esté vacío ni dañado.
* Envía o guarda la factura.
* Si la factura es observada, revisa el motivo.
* Corrige montos, precios, productos o datos inconsistentes.
* Vuelve a cargar la factura corregida.

Para la simulación, podrías mostrar estados como:

* “Pendiente de carga”.
* “Factura cargada”.
* “Factura observada”.
* “Factura aceptada”.
* “Orden no habilitada para facturación”.

## 6. Registrar Aviso de Despacho — AVD

El proveedor:

* Entra al módulo **Aviso de Despacho**.
* Selecciona una orden de compra.
* Copia o carga los datos de la orden.
* Revisa cantidades, productos y montos.
* Guarda el aviso.
* Confirma el despacho.
* Una vez confirmado, ya no puede editarlo.

Este punto es clave para la simulación: el sistema debe mostrar que un AVD confirmado queda bloqueado. El procedimiento indica que no se pueden modificar cantidades, corregir datos ni revertir el proceso desde el portal después de confirmar el AVD. 

## 7. Solicitar ayuda desde el chatbot

El proveedor:

* Abre el asistente virtual.
* Escribe una consulta, por ejemplo:

  * “No puedo cargar mi factura”.
  * “No aparece el botón de factura”.
  * “No puedo editar mi AVD”.
  * “No puedo registrar un producto”.
  * “Necesito reenvío de credenciales”.
* El chatbot identifica el módulo relacionado.
* Solicita datos mínimos:

  * Número de orden de compra.
  * Código proveedor.
  * Captura de pantalla.
  * Archivo relacionado.
  * Descripción del problema.
* Da instrucciones paso a paso.
* Si no puede resolver, deriva a Compras, Soporte o Facturación.

## 8. Consultar estado de una solicitud

Para una página más completa, puedes simular una sección de **Mis solicitudes**.

El proveedor:

* Consulta solicitudes creadas.
* Ve el estado de cada caso:

  * Recibido.
  * En revisión.
  * Observado.
  * Derivado a Compras.
  * Derivado a Soporte.
  * Procesado.
  * Cerrado.
* Revisa observaciones.
* Adjunta información faltante.
* Confirma si el problema fue resuelto.

Esto encaja con la necesidad de trazabilidad del desafío, porque todas las interacciones y solicitudes deben quedar registradas. 

## Estructura mínima para simular la página

Yo haría una simulación con estas pantallas:

1. **Login del proveedor**
   Usuario, contraseña, botón ingresar, enlace “olvidé mis credenciales”.

2. **Dashboard principal**
   Tarjetas: Catálogo, Compras, Facturas, AVD, Soporte, Manuales.

3. **Catálogo de productos**
   Lista de productos, botón “Nuevo producto”, formulario de carga.

4. **Órdenes de compra**
   Tabla con número de OC, fecha, monto, estado y acciones.

5. **Carga de factura**
   Vista de orden, botón cargar PDF, estado de factura y observaciones.

6. **Aviso de despacho**
   Selección de OC, detalle de productos, botón guardar y botón confirmar despacho.

7. **Chatbot lateral**
   Asistente contextual que responde según el módulo donde está el proveedor.

8. **Mis solicitudes / tickets**
   Historial de consultas, estado, área responsable y observaciones.

En resumen: para simular el portal, el proveedor debe poder **ingresar, consultar órdenes, registrar productos, cargar facturas, generar AVD, pedir ayuda, adjuntar evidencias, corregir observaciones y consultar el estado de sus solicitudes**.
