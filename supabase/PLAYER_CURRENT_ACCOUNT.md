# Habilitación de cuenta corriente por jugador

Publicado en Padel Center y Pura Vida el 19 de octubre de 2026 por pedido expreso.
La migración 20261019190000_player_current_account.sql y sus dependencias se
aplicaron en ambas bases; las funciones y los sitios quedaron actualizados.
Los resultados están en releases/. Las futuras publicaciones requieren un pedido
expreso.

Jugadores → Nuevo/Editar → Habilitar cuenta corriente. El formulario tiene nombre,
teléfono y mail en la primera fila; género, categoría y checkbox en la segunda.
La categoría ocupa un ancho compacto. El listado muestra el estado de cada jugador.

Los existentes quedan habilitados al migrar; los nuevos nacen deshabilitados.
Administrador puede autorizar siempre. Empleados necesitan players.credit además
del acceso de creación/edición correspondiente. Los jugadores no pueden autorizarse.
Los controles también se aplican en la base, incluso usando peticiones directas.

Deshabilitar impide nueva deuda en ventas, turnos, pagos divididos y débitos
directos. No borra saldos ni pagos anteriores ni impide recibir pagos para cancelar
la deuda. Una operación histórica puede conservar o reducir su crédito aprobado,
pero no aumentarlo para un jugador deshabilitado. Cambiar de cliente tampoco
transfiere la autorización anterior. Las reservas se verifican al finalizar la
transacción, después de reemplazar jugadores y consumos; un rechazo revierte la
operación completa.

El medio Cuenta Corriente aparece deshabilitado para jugadores sin autorización.
Los formularios verifican también el importe antes de guardar. La base usa siempre
el estado vigente, protegiendo contra pantallas abiertas antes de la revocación.

Prueba local: node scripts/test-player-credit.mjs. Requiere que no haya otra caja
abierta y crea/limpia exclusivamente sus propios datos ficticios. Comprueba estado
inicial, permisos y su guardado por la API, ventas/turnos/débitos rechazados,
reversión atómica, conservación y edición histórica, cobros de deuda, revocación
en la misma sesión y validación de los formularios.
