# Notificaciones push para administradores

## Objetivo
Enviar una notificación al dispositivo del administrador cuando un jugador reserve o cancele un turno, incluso con la app cerrada o en segundo plano.

Implementadas el 23/10/2026 y configuradas en los dos proyectos Supabase. La validación final de recepción en un celular real requiere que el administrador acepte el permiso en ese dispositivo.

## Estado actual
- La app es una PWA instalable, publicada por HTTPS en Netlify.
- Las notificaciones de reservas ya existen en Supabase: feed, lectura individual y eventos de creación/cancelación por jugadores.
- El administrador tiene campana, historial, cartel flotante y botón Activar avisos al dispositivo.
- Sitios: https://padelcenter.netlify.app y https://multiespaciopuravida.netlify.app.
- Cada sitio tiene su propia base Supabase; conservar esa separación.
- La suscripción está ligada al usuario y a su sesión de Supabase. Cerrar sesión, desactivar el usuario o cambiar su rol revoca las suscripciones correspondientes.
- Las reservas y cancelaciones generan una cola de envíos por dispositivo, con leases, reintentos, vencimiento y limpieza de endpoints caducados. El disparo inmediato usa pg_net; cron recupera pendientes cada minuto.
- El service worker muestra el aviso y abre el detalle autenticado. El nombre del jugador no se incluye en el mensaje de la pantalla bloqueada.
- Las claves VAPID privadas y el token del worker viven en secretos de Supabase. El token del disparador también se guarda en Vault. La copia de recuperación local está en dev/release.local/<cliente>-booking-push.env, ignorada por Git: no publicar ni imprimir su contenido.

## Archivos y herramientas relevantes
- src/components/BookingNotifications.tsx
- src/hooks/useBookingNotifications.ts
- src/services/bookingNotificationsService.ts
- supabase/migrations/20261023130000_booking_notifications.sql
- scripts/pwa-build.mjs: genera el service worker y el manifest.
- src/utils/registerPwa.ts
- scripts/test-booking-notifications.mjs: pruebas de notificaciones existentes sobre base local aislada.
- scripts/release-clients.mjs: build, deploy y verify por cliente.
- Clientes: padel-center (proyecto zcixnnzxxkylotbjudhk) y pura-vida (proyecto qsvdpdifygmzdawxfyqv).
- Publicación usada: node scripts/release-clients.mjs build|deploy|verify <cliente>.

## Pendiente en el dispositivo del usuario
1. Abrir la versión publicada con sesión de administrador.
2. En iPhone, abrir la app desde el ícono agregado a la pantalla de inicio.
3. Ir a Configuración → Notificaciones, tocar Activar avisos al dispositivo y aceptar el permiso.
4. Crear o cancelar una reserva desde una sesión de jugador y comprobar la recepción con la app del administrador cerrada/celular bloqueado.
5. Tocar el aviso y comprobar que abre el detalle. El envío depende de la conexión y de los permisos/ajustes del sistema operativo.

## Mantenimiento y pruebas
- Migración: supabase/migrations/20261023150000_booking_web_push.sql.
- Worker: supabase/functions/dispatch-booking-push.
- Configuración idempotente sin rotación automática: node scripts/configure-booking-push.mjs configure <cliente>.
- Verificación de backend push: node scripts/configure-booking-push.mjs verify <cliente>.
- Evidencia sin credenciales: supabase/releases/<cliente>-push-verification.json.
- Pruebas locales: scripts/test-booking-push.mjs y scripts/test-booking-push-ui.mjs.
- Cifrado, firma VAPID y respuestas de proveedores: deno test --allow-env --config supabase/functions/dispatch-booking-push/deno.json supabase/functions/dispatch-booking-push/push_test.ts.
- El worker rechaza invocaciones públicas y usuarios del navegador. Solo acepta su token de despacho; no recibe destinatarios ni texto arbitrario del cliente.
- La entrega usa reintentos; un fallo entre la aceptación del proveedor y la confirmación en base puede repetir un envío. La notificación mantiene una etiqueta por evento para reemplazar el aviso visible del mismo evento.

## Ajustes de caja solicitados en la misma sesión
- Se corrigió cash_source_detail para que una lista explícita de pagos vacía muestre cero, en lugar del costo teórico del jugador.
- La migración 20261023160000_cash_zero_player_payments.sql reparó exclusivamente esas líneas identificables de los snapshots; no cambió importes de caja ni de cuenta corriente.
- Se verificó el caso de Padel Center del 22/10/2026 22:39: Salaverry cero, Cavalleri 16000 en cuenta corriente y 16000 cobrados por transferencia de los otros dos jugadores.
- La columna Cuenta Corriente muestra el importe informativo del snapshot y no modifica el total cobrado. No se suma en el pie porque los ajustes pueden repetir el snapshot de la misma reserva.
- Se quitaron las leyendas solicitadas, el total redundante del modal y los dos párrafos indicados del PDF; se compactó la fecha/responsable con el concepto.
- Pruebas: scripts/test-cash-zero-payments.mjs, scripts/test-cash-detail-ui.mjs, scripts/test-cash-details.mjs y scripts/test-cash-rows.mjs.

## Requisitos del dispositivo
- Android: navegador compatible y permiso del usuario.
- iPhone/iPad: iOS/iPadOS 16.4 o posterior, PWA agregada a pantalla de inicio y permiso solicitado desde una interacción en la app.
- Web Push no requiere cuenta paga de Apple Developer.
- La configuración del servidor y la app puede hacerse desde esta sesión; aceptar permisos y probar en celulares reales requiere intervención del usuario.

## Referencias
- https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- https://webkit.org/blog/13878/
- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers

## Validación previa
El build de producción pasó. TypeScript global tiene errores anteriores en otros archivos; ESLint de los archivos del cartel pasó sin errores, con una advertencia existente en la limpieza del efecto del hook.

## Cómo retomar
Los recordatorios configurables para jugadores se documentan en [player-booking-reminders.md](player-booking-reminders.md).

Si falta validar un dispositivo, pedir: Revisá docs/pendiente-notificaciones-push.md y ayudame a probar las push en mi celular.
