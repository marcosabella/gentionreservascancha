# Recordatorios push de turnos para jugadores

Cada complejo configura los recordatorios en Configuración → Notificaciones.
El valor inicial es 60 minutos; admite entre 5 y 1440 minutos y permite desactivar
el envío. Solo un administrador puede cambiar estos valores.

El jugador activa los avisos desde Notificaciones en su propia cuenta. Debe tener
un perfil activo vinculado a un jugador, mantener la sesión iniciada y aceptar
el permiso del dispositivo. Se reutilizan las claves VAPID existentes.

Supabase revisa las reservas confirmadas cada minuto, usando el horario de
Argentina. Se envía un aviso a cada dispositivo suscrito de los jugadores que
integran el turno. Incluye cancha, fecha y horario; al tocarlo abre el detalle
de esa reserva dentro de la cuenta del jugador.

Las reservas canceladas, pasadas o pendientes de confirmación no generan
recordatorios. Se comprueban de nuevo el horario, la participación, el perfil,
la sesión y la configuración inmediatamente antes de enviar. Reprogramar un
turno invalida el aviso del horario anterior. Cambiar el intervalo actualiza
los envíos pendientes y no repite los ya aceptados para el mismo turno,
dispositivo y horario.

Si una reserva se confirma o un dispositivo se suscribe cuando ya está dentro
del intervalo elegido, se avisa en la siguiente revisión. La recepción puede
demorarse según la conexión y los ajustes del sistema operativo. Los mensajes
caducan como máximo al comenzar el turno; el proveedor puede conservarlos
hasta una hora mientras el dispositivo no tenga conexión.

## Implementación

- Migración: `supabase/migrations/20261023170000_player_booking_reminders.sql`.
- Cola existente `booking_push_deliveries`, con tipo admin o reminder.
- Cron `booking-push-retry`: encola recordatorios y despierta el worker.
- Worker `dispatch-booking-push`, autenticado con su token privado existente.
- Intervalo por complejo en `booking_push_config.reminder_minutes`.
- `update_booking_reminder_settings` exige administrador activo.
- Cola, claves de suscripción y funciones del despachador no son accesibles desde los clientes.
- `PlayerBookingReminder` comprueba que el jugador pertenece a la reserva antes de mostrar el detalle.

## Pruebas

- `node scripts/test-player-reminders.mjs`: base local aislada; permisos,
  configuración, horario argentino, anticipación, duplicados, cancelación,
  reprogramación, participantes y desactivación.
- `node scripts/test-booking-push.mjs`: regresión de avisos administrativos,
  sesiones, RLS, reintentos y endpoints vencidos.
- `node scripts/test-booking-push-ui.mjs`: permisos del navegador y navegación
  al tocar avisos administrativos y recordatorios del jugador.
- `node scripts/test-pwa.mjs`: instalación y comportamiento del service worker.
- Pruebas Deno de `dispatch-booking-push/push_test.ts`: cifrado, firma,
  proveedores, contenido del recordatorio y caducidad.

## Publicación

1. Aplicar migración por complejo con `release-clients.mjs migrate`.
2. Redesplegar worker con `configure-booking-push.mjs configure`, conservando claves.
3. Compilar, publicar y verificar ambos sitios con `release-clients.mjs`.
4. En la primera puesta en marcha, usar `configure-booking-push.mjs enable-reminders`.
5. Verificar backend con `configure-booking-push.mjs verify`.

La migración deja el envío de recordatorios desactivado durante el despliegue.
El comando de puesta en marcha solo se usa para habilitar la función inicialmente;
en mantenimiento se conserva la preferencia elegida por el administrador.

La recepción con un celular real cerrado/bloqueado queda pendiente de aceptar
los permisos en ese dispositivo y hacer una reserva de prueba con el usuario.
