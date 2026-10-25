# Notificaciones masivas a jugadores

En **Configuración → Notificaciones** el administrador tiene tres pestañas:

- **Envío de notificaciones**: título, mensaje y grilla de destinatarios. **Buscar jugadores** abre un modal con búsqueda por nombre y filtros combinables de categoría y género. Marcá uno o varios jugadores y pulsá **Agregar seleccionados**; las selecciones se conservan al cambiar la búsqueda. **Seleccionar resultados** marca los resultados del filtro. **Agregar todos** incorpora a la grilla todos los jugadores con cuenta activa. Los jugadores no se duplican y se pueden quitar individualmente o con **Vaciar grilla**. Solo se envía a los jugadores de la grilla; vacía, el envío queda deshabilitado.
- **Configuración de recordatorios**: activación y minutos de anticipación para los turnos.
- **Historial**: mensajes enviados y seguimiento de sus estados, separado del formulario de envío.

La pestaña **Historial** muestra fecha, título, administrador, destinatarios, jugadores que abrieron el mensaje y estado push. Se actualiza cada 10 segundos mientras está abierta y permite consultar envíos anteriores. **Ver detalle** muestra el texto completo y cada dispositivo: estado, intentos, motivo de error y próximo reintento.

El mensaje permite **negrita**, cursiva, subrayado, tachado, listas y emojis. Seleccioná texto y usá los botones de formato; **Emojis** abre un selector. La vista previa muestra el resultado antes de enviar. El título también acepta emojis escritos o pegados. El límite de 2000 caracteres incluye las marcas de formato (`**negrita**`, `_cursiva_`, `__subrayado__`, `~~tachado~~` y líneas con `- `). La bandeja y el detalle del historial muestran el formato; los avisos push conservan el texto y los emojis sin marcas. Para esa vista push debe publicarse también la función `dispatch-booking-push` actualizada. No se requiere una migración adicional. El HTML pegado se muestra como texto.

Los estados son **En cola**, **Procesando**, **Enviado**, **Enviado parcialmente**, **Error de envío** y **En bandeja (sin push)**. «Enviado» significa aceptado por el proveedor push; la apertura del mensaje se registra por separado. Cuando un envío anterior perdió sus registros de cola, figura **Sin registro completo**; no se infiere que se haya enviado. Los nuevos estados se guardan permanentemente incluso si se elimina una suscripción o se purga la cola operativa.

## Prueba en el dispositivo

En Configuración → Notificaciones, cuando los avisos están activados, **Probar aviso en este dispositivo** solicita una notificación mediante el navegador. No crea una campaña ni envía mensajes desde el servidor. Que el navegador acepte crearla no garantiza un cartel o sonido del sistema; el usuario debe comprobar si aparece en la barra de notificaciones. Las opciones **Sí, apareció** y **No apareció** orientan el siguiente paso. Si aparece, realizar después un envío desde el administrador con la app del jugador en segundo plano para comprobar el recorrido completo. La prueba local por sí sola no valida transporte push, descifrado ni recepción en segundo plano.

El mensaje se guarda en la bandeja del jugador aunque no tenga push. Los dispositivos suscriptos y con sesión vigente reciben además una vista previa push; el texto completo queda en la app. Se muestran destinatarios y dispositivos antes de enviar. Son cantidades orientativas hasta el envío: la base vuelve a resolver la audiencia al confirmar la operación.

Los envíos son exclusivos de administradores activos y se realizan en una transacción. Cada destinatario conserva el jugador asociado al enviar, para que cambiar la vinculación de una cuenta no permita leer mensajes anteriores de otro jugador. Un UUID de solicitud evita duplicar un envío si se reintenta desde el formulario tras un error de conexión.

## Instalación

Aplicar `supabase/migrations/20261023180000_player_announcements.sql` después de las migraciones de notificaciones, push y recordatorios, luego `20261023190000_player_announcement_selection.sql` para la selección múltiple y `20261023200000_player_announcement_history.sql` para el historial permanente. Desplegar la función `dispatch-booking-push` actualizada y publicar el frontend, incluido el service worker. La migración utiliza la configuración, suscripciones, worker y cron de push existentes. No requiere credenciales nuevas. El historial funciona con la misma función push ya desplegada; registra los resultados en la base de datos.

## Verificación

- `node scripts/test-player-announcements.mjs`: integración con Supabase local de `dev/pura-vida.local` (puerto 56000). Crea cuentas temporales; revierte los mensajes y trabajos push de prueba antes de que puedan enviarse.
- `node scripts/test-player-announcements-ui.mjs`: estructura de pestañas, formulario y filtros.
- `node scripts/test-announcement-formatting.mjs`: formato, listas, emojis, vista segura del contenido, límites del editor y vista push en texto.
- `node scripts/test-announcement-selection-ui.mjs`: interacción con búsqueda, selección múltiple, grilla, eliminación, destinatarios enviados y reintentos.
- `node scripts/test-booking-push-ui.mjs`: navegación segura desde push para reservas, recordatorios y mensajes del club.
- `npm run build`: compilación del frontend y service worker.
