# Publicación del 19 de octubre de 2026

Pedido expreso: aplicar migraciones pendientes y publicar ambos clientes.

| Cliente | Sitio | Proyecto Supabase |
| --- | --- | --- |
| Padel Center | https://padelcenter.netlify.app | zcixnnzxxkylotbjudhk |
| Pura Vida | https://complejopuravida.netlify.app | qsvdpdifygmzdawxfyqv |

Se aplicaron en una transacción por proyecto las seis migraciones nuevas: permisos
de empleados, Caja, controles de Caja, ventas atómicas, cuenta corriente por
jugador y protección de perfiles. Las migraciones antiguas que ya estaban
incorporadas se registraron en el historial tras verificar su estructura; no se
recreó el índice obsoleto que limitaba a un único torneo activo.

Los conteos de registros de negocio se conservaron durante las migraciones. Caja
comenzó sin sesiones ni movimientos; sus saldos internos de referencia impiden
volver a contabilizar cobros anteriores. Los jugadores existentes conservaron la
cuenta corriente habilitada. Los nuevos jugadores la tienen deshabilitada hasta
su autorización. Para cobrar se debe abrir la caja indicando el fondo real.

Se actualizaron las siete funciones de acceso y usuarios de cada proyecto. En
Padel Center también se protegió la función de recuperación de administrador ya
existente. No se cambiaron contraseñas ni se copiaron registros entre clientes.
La verificación de producción no creó ventas, jugadores, cobros ni cajas ficticias.

Los JSON de cada cliente contienen diagnóstico previo, migraciones aplicadas,
metadatos de Netlify, comprobación del sitio y verificación de backend. No contienen
credenciales. Se comprobó que las migraciones nuevas coinciden con los archivos
locales, que cada bundle corresponde a su propio proyecto y que los perfiles no
permiten leer hashes ni modificar directamente roles o permisos.

Se publicaron compilaciones del árbol de trabajo, incluyendo los cambios locales
autorizados. No se hizo commit/push en este pedido ni se habilitaron despliegues
automáticos de GitHub. Las futuras publicaciones siguen requiriendo pedido expreso.

Herramientas:

- `node scripts/release-clients.mjs audit|migrate|build|deploy|verify padel-center|pura-vida`
- `node scripts/verify-client-backend.mjs padel-center|pura-vida`

Cada comando exige un cliente explícito y no modifica el vínculo Supabase de la
raíz. Los SQL intermedios se guardan en dev/release.local, ignorado por Git.

## Corrección de acceso posterior a la publicación

El usuario padelcenter tenía una identidad Auth canónica referenciada por su perfil
y otra identidad histórica sin perfil, con el mismo username y profile_id en los
metadatos. La sesión reciente usaba la segunda. Las restricciones de acceso
impedían leer datos sin perfil activo, mientras el frontend presentaba un usuario
administrador tomado como alternativa desde los metadatos; por eso se veían
listados vacíos sin un error de validación del perfil.

El login consulta ahora Auth mediante getUserById(profile.id), sin depender de la
primera página de listUsers ni de coincidencias de metadatos. La interfaz solo
acepta el perfil activo cuyo ID coincide con la identidad de la sesión; las
sesiones históricas sin perfil se cierran localmente y requieren volver a entrar.
No se eliminaron identidades ni se trasladaron registros de negocio.

Se reprodujo el problema en local mediante test-duplicate-login.mjs y se comprobó
que la identidad canónica carga datos y que la identidad histórica se rechaza.
Se actualizó login y se recompilaron/publicaron ambos clientes. En producción,
la simulación de permisos de padelcenter leyó 313 jugadores, 485 reservas y 65
consumibles. El usuario debe recargar e ingresar con su contraseña habitual.
