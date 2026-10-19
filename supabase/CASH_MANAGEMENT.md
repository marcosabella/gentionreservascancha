# Caja — Pura Vida

Publicado en Padel Center y Pura Vida el 19 de octubre de 2026, por pedido expreso.
Las futuras publicaciones siguen requiriendo un pedido expreso. Los registros y
las verificaciones de este despliegue están en releases/.

## Operación

Ventas y cobros → Caja. Una caja general abierta por complejo. Abrir con el efectivo
inicial; todos los cobros posteriores en efectivo, tarjeta o transferencia exigen
caja abierta. Se registran automáticamente ventas directas, pagos de cuentas
corrientes y los importes por medio de pago de cada jugador al finalizar un turno.
Las ventas a cuenta corriente no son cobros; el ingreso ocurre al registrar el pago.
Las ventas sintéticas de turnos no duplican ingresos. No se importan cobros viejos.

Efectivo esperado = apertura + movimientos en efectivo. Tarjetas y transferencias
se muestran aparte. Los ingresos manuales, gastos y retiros requieren concepto;
no se admite un egreso manual mayor al efectivo disponible. Una anulación manual
genera el movimiento inverso y conserva el original. Correcciones y eliminaciones
de cobros se realizan desde su venta, reserva o pago y generan diferencias en la
caja actualmente abierta, conservando la referencia original.

El cierre registra efectivo contado, diferencia, observaciones, fondo reservado y
efectivo entregado (contado menos reservado). Toda diferencia exige explicación.
El contador de billetes es una ayuda opcional; el total se puede ajustar para
monedas. Reservar efectivo no abre automáticamente la siguiente caja.

El historial permite filtrar fechas de apertura y seleccionar caja. Cada caja
tiene resumen, detalle por medio de cobro, responsables y referencias. CSV e
impresión/guardar PDF exportan todos sus movimientos, aunque la tabla esté filtrada.
Los datos se paginan para no truncarlos al límite de filas del servidor.

## Modificar, eliminar y reabrir

El administrador dispone de todas las funciones. Los empleados tienen permisos
independientes: ver, abrir, movimientos, anular movimientos manuales, cerrar,
modificar, eliminar, reabrir y reportes/auditoría. Guardarlos en Rol y permisos.

Modificar permite corregir fondo inicial y observaciones. Si está cerrada,
recalcula esperado y diferencia conservando lo contado y entregado. Eliminar es
una baja lógica; no borra ventas, cobros ni movimientos, ni representa una
devolución de dinero. Las cajas eliminadas se consultan marcando Mostrar cajas
eliminadas. Reabrir/restaurar exige que no haya otra caja abierta; mantiene el
fondo y los movimientos y requiere un nuevo cierre. No debe confundirse con abrir
un turno nuevo después de haber entregado físicamente el dinero del turno anterior.

Estas tres acciones exigen motivo. La auditoría guarda usuario, fecha, motivo y
estado completo antes/después, incluidos los arqueos de cierres anteriores.
Las tablas de Caja no aceptan escrituras directas de los navegadores; las RPC
validan permisos actuales y serializan las operaciones contra cobros concurrentes.

## Preparación local y pruebas

Usar el entorno aislado descrito en EMPLOYEE_PERMISSIONS.md. El preparador copia
también las migraciones 20261019160000, 20261019170000 y 20261019180000. Aplicarlas después de
employee_permissions y reiniciar las funciones locales al modificar el catálogo
de permisos. En Windows preservar UTF-8 al pasar SQL a psql.

`node scripts/test-cash-management.mjs` exige Supabase local en puerto 56000 y que
no haya caja abierta. Crea y limpia exclusivamente sus datos ficticios. Comprueba
apertura, permisos, escritura directa bloqueada, movimientos y anulaciones,
división de pagos, transacciones, no duplicación, cobros de deuda, correcciones,
cierres/diferencias, modificación, eliminación, reapertura, auditoría, revocación,
CSV seguro e impresión con escape HTML.

Las reservas del administrador se actualizan mediante cash_save_booking para que
la reserva, los jugadores y sus pagos se guarden en una transacción. Empleados
mantienen employee_mutate. Los disparadores diferidos contabilizan el estado final
de cada operación y comparan el saldo de origen para registrar únicamente cambios.
Las ventas del administrador y sus productos también se guardan juntos mediante
cash_save_sale; si falla un producto, se revierte la venta y no queda un cobro.

## Publicación futura

Aplicar las tres migraciones de Caja después de employee_permissions, actualizar las
funciones que usan el catálogo compartido y publicar el frontend del cliente
elegido. El vínculo Supabase de la raíz sigue siendo Padel Center: no ejecutar un
db push remoto sin seleccionar y verificar el proyecto correcto. La publicación
del 19 de octubre incluyó también las migraciones de habilitación de cuenta
corriente por jugador y de protección de perfiles.
