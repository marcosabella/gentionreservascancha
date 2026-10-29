# Control de stock

El control se activa por producto. Tanto los productos existentes como los nuevos
comienzan con **Controlar stock: NO**: se pueden vender sin conteo y sin límites de
existencias. La disponibilidad comercial sigue siendo independiente del stock.

En Productos, abrir el botón **Stock**, seleccionar SÍ y cargar el conteo físico
inicial y el mínimo para alertas. También se puede hacer desde Editar producto.
Las operaciones anteriores no se descuentan del conteo.
Al desactivar el control se conserva el historial; para reactivarlo se exige otro
conteo físico porque las ventas realizadas mientras estuvo desactivado no se controlaron.

El botón **Stock** muestra el historial y permite registrar ingresos, pérdidas o
el nuevo saldo contado físicamente. Cada movimiento registra usuario, fecha,
motivo, variación y saldo. Los administradores tienen acceso; los empleados necesitan
el permiso **Productos y precios → Administrar stock, entradas y ajustes**. Para
cambiar la configuración del producto también necesitan permiso de edición.

Las ventas directas descuentan al guardar y las reservas al guardar sus consumos,
sin esperar al cobro. Bonificar un producto también descuenta unidades. Editar una
operación ajusta la diferencia; cerrar una reserva o modificar sus pagos no vuelve a
descontar. Reducir consumos al editar devuelve las unidades que habían sido descontadas.
Para registrar productos consumidos sin devolución, conservar el consumo o registrar
una pérdida con motivo.

Al eliminar una venta o cancelar una reserva con productos controlados se consulta
si la mercadería volvió físicamente. Si no volvió, no se repone. Solo se pueden
reponer unidades descontadas desde la activación, nunca ventas históricas anteriores.
Los productos con movimientos de stock no se eliminan para preservar el historial;
se pueden marcar como no disponibles.

El saldo se verifica en PostgreSQL dentro de la misma transacción, con bloqueo
para evitar ventas simultáneas por encima de las existencias. Un faltante revierte
la operación completa. La interfaz muestra alertas, actualiza stock después de
guardar y consulta existencias cada 30 segundos cuando la aplicación está visible.

## Instalación y validación

Aplicar `supabase/migrations/20261029120000_product_stock.sql` antes de publicar
la nueva aplicación. Requiere las migraciones previas de caja, permisos, ventas
compartidas y bonificaciones. La migración no modifica precios, cantidades vendidas
ni saldos comerciales existentes y no habilita el control de ningún producto.
La publicación debe incluir el módulo compartido de permisos si se utiliza desde
las funciones de administración de empleados.

Prueba aislada, sin acceder a las bases de clientes:

```powershell
npm install --prefix tmp/stock-test --no-save --package-lock=false @electric-sql/pglite
node scripts/test-stock.mjs
npm run build
```

La prueba crea PostgreSQL en memoria con el esquema existente, aplica las migraciones
relevantes y verifica activación, históricos, ventas, reservas, diferencias, anulaciones,
faltantes, permisos, historial y operaciones atómicas. No aplica cambios en producción.
