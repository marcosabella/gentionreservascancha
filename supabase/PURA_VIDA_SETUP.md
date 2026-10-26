# Base independiente de Pura Vida

Preparada el 19 de octubre de 2026.

- Origen (Padel Center / Reserva Turnos): `zcixnnzxxkylotbjudhk`.
- Destino (pura_vida): `qsvdpdifygmzdawxfyqv`.
- URL destino: `https://qsvdpdifygmzdawxfyqv.supabase.co`.
- No se modificó la conexión de la aplicación ni el proyecto vinculado del repositorio.
- No se copiaron registros, usuarios, contraseñas, configuración comercial ni secretos.

## Estructura

Se importaron 16 tablas, 160 columnas, 50 restricciones, 30 índices, 64 políticas RLS,
7 funciones y 10 disparadores (incluido uno sobre `auth.users`). Las cinco extensiones
requeridas ya estaban presentes en el proyecto destino.

`pura-vida-schema.sql` contiene la importación completa sin datos, con una transacción
y controles que rechazan un destino con tablas públicas o usuarios existentes. No se
debe ejecutar nuevamente sobre la base ya preparada. Las credenciales temporales de
exportación no están incluidas en los archivos.

El inventario `pura-vida-target-inventory-final.json` coincide exactamente con el
inventario de origen en todas las secciones comprobadas (tablas, columnas,
restricciones, índices, políticas, funciones, disparadores y extensiones), y
`pura-vida-empty-verification.json` registra el conteo exacto de cada tabla y de
usuarios de autenticación. `scripts/inspect-reservas-schema.sql` y
`scripts/verify-empty-reservas.sql` permiten repetir las comprobaciones.

## Pendiente para usar la aplicación

- Configurar notificaciones de correo si se requieren, con remitente y secretos
  propios de Pura Vida. No se copiaron credenciales de correo de Padel Center.
- Cargar su configuración, canchas, horarios y productos.
- La revisión completa de permisos por rol, especialmente para el panel de
  jugadores, puede profundizarse con las siguientes adaptaciones del cliente.

No se publicaron cambios ni se crearon usuarios como parte de la copia de estructura.

## Alta posterior del administrador

Se creó por pedido del usuario el administrador activo `puravida`, con identidad
Supabase Auth y perfil de aplicación vinculados. La contraseña no se guarda en
este documento ni en los scripts; se configuró la indicada en la conversación.

Durante la comprobación del acceso se detectó recursión en cuatro políticas de
`user_profiles` heredadas del origen (error PostgreSQL `42P17`). Se aplicó únicamente
en Pura Vida `pura-vida-fix-profile-policies.sql`, que conserva el requisito de
administrador activo mediante una función con `SECURITY DEFINER`, sin consulta
recursiva de RLS. No se cambió Padel Center. Esta corrección no reemplaza la revisión
general de permisos pendiente antes de publicar.

Los inventarios y conteos anteriores documentan el estado inmediatamente posterior
a la copia vacía, antes de esta alta y de la corrección de políticas.

## Publicación

Sitio publicado: **https://complejopuravida.netlify.app**.

- Netlify site ID: `ad3ff8e3-60b6-44f3-957b-45a256972c20`.
- Se guardaron en ese sitio `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y
  `VITE_COMPLEX_NAME=PURA VIDA`. Solo se expone la clave pública del proyecto.
- Se desplegaron `login`, `create-user`, `get-all-users`, `update-user-role`,
  `toggle-user-status`, `delete-user` y `reset-user-password` en Pura Vida.
- Las funciones administrativas verifican la sesión y el rol usando el perfil
  de base de datos. El cambio de contraseña propio también está permitido.
- Se aplicó `pura-vida-publication-access.sql`: bloqueo de datos anónimos,
  bloqueo de lectura de hashes desde el frontend, cambios de perfiles mediante
  funciones de servidor y requisito de perfil activo para datos de aplicación.
- La marca se configura en el mismo código mediante `VITE_COMPLEX_NAME`;
  sin esa variable se conserva el nombre Padel Center.
- Se publicó el árbol de trabajo local del mismo repositorio mediante la API de
  Netlify, incluyendo los cambios locales existentes en torneos. No se hizo
  commit/push ni se habilitaron publicaciones automáticas de GitHub. Esta forma
  permite publicar a cada cliente de manera controlada.
- Para futuras publicaciones de Pura Vida: `node scripts/netlify-pura-vida.mjs deploy`.
  El script sobrescribe la configuración de conexión solo para ese proceso de
  compilación; no cambia `.env`, el vínculo Supabase ni el sitio de Padel Center.

Validaciones realizadas: compilación de producción Vite, `deno check` de las siete
funciones, acceso con el administrador, consulta de usuarios, once consultas de
datos de aplicación, rechazo de contraseña incorrecta, bloqueo anónimo de datos
y de las seis funciones administrativas y bloqueo de lectura de hashes.
La URL pública y su JavaScript devolvieron HTTP 200; el archivo contiene el proyecto
Pura Vida y no contiene la referencia al proyecto Padel Center.

El chequeo general `tsc --noEmit` detecta errores existentes en componentes,
hooks y servicios del proyecto; no bloqueó la compilación Vite. No se realizó una
auditoría funcional completa de todos los módulos ni una verificación visual del
navegador (no había navegador conectado a la herramienta).

Los archivos `pura-vida-netlify-deployment.json`,
`pura-vida-release-verification.json` y
`pura-vida-public-site-verification.json` guardan los identificadores del despliegue
y resultados sin credenciales ni tokens de sesión.

## Navegación y vista local

El sidebar del administrador agrupa las pantallas existentes en Inicio, Reservas,
Jugadores, Ventas y cobros, Torneos y Configuración. Reservas, Ventas y cobros y
Configuración tienen un único nivel de submenús. Las preferencias de grupos
abiertos se guardan por complejo, rol e identidad de usuario en el navegador.
El panel de jugadores conserva cinco accesos directos. La barra móvil se cierra
al navegar y el contenido de escritorio adapta su margen a la barra contraída.

Para ejecutar la vista de Pura Vida en `http://localhost:5173/`:
`node scripts/dev-pura-vida.mjs`.
Para ver localmente el turno de las 23:00 a 00:30 con la base de Pura Vida:
`node scripts/dev-pura-vida.mjs --production-data --closing-time=00:30`.
El cierre indicado se aplica solo a la vista de desarrollo; no cambia los horarios
compartidos ni publica en Netlify. Las reservas creadas con `--production-data`
sí se guardan en la base real de Pura Vida.
El script usa por defecto el entorno local aislado de pruebas y pasa las variables
de conexión al proceso Vite, sin modificar el archivo `.env`. La preparación y los
comandos necesarios se detallan en `EMPLOYEE_PERMISSIONS.md`.
