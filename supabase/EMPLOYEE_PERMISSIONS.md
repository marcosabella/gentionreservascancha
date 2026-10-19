# Rol Empleado — desarrollo local

Estado: publicado en Padel Center y Pura Vida el 19 de octubre de 2026 por pedido
expreso, junto con Caja y la habilitación de cuenta corriente por jugador. Se
actualizaron ambas bases, las funciones y los sitios. Ver releases/ para los
resultados y las verificaciones. Las futuras publicaciones requieren pedido expreso.

## Uso

En Usuarios y permisos, crear o editar un usuario y seleccionar Empleado.
Se configuran acciones de Inicio, Reservas, Turnos fijos, Disponibilidad,
Jugadores, Ventas, Cuentas corrientes, Torneos, Canchas y Productos. Las acciones
habilitan automáticamente la consulta de su módulo. Quitar la consulta elimina
las acciones de ese módulo. El empleado empieza sin permisos.

Usuarios y permisos permanece reservado al Administrador; un empleado no puede
crear usuarios, cambiar roles, asignarse permisos ni cambiar claves ajenas.
Puede cambiar su propia contraseña, como los demás usuarios.

Administrador y Jugador conservan sus reglas anteriores. Los permisos editables
solo se aplican al rol Empleado. Los datos de referencia necesarios para una
operación (por ejemplo, canchas y jugadores al reservar) acompañan a esa operación;
no habilitan el módulo de administración correspondiente.

El menú oculta módulos sin acceso y los botones respetan cada acción. Las
restricciones también se verifican en PostgreSQL. Las reservas, ventas y pagos de
empleados usan una RPC que comprueba los permisos actuales y ejecuta padres,
detalles y movimientos asociados en una transacción. No se permite evadir esos
controles escribiendo directamente en las tablas compuestas. Las operaciones de
Administrador y Jugador siguen sus caminos existentes.

Los permisos se leen del perfil en la base, no de metadatos modificables del JWT.
La interfaz los refresca al volver a enfocar la ventana y cada 30 segundos; el
servidor los comprueba en cada operación, incluso con una sesión antigua.

## Entorno de pruebas

- Vista: http://localhost:5173/
- Supabase local separado: http://127.0.0.1:56000 (PostgreSQL 56432).
- Funciones reales ejecutadas localmente por Deno: http://127.0.0.1:56010/.
- Proyecto Docker local: `pura-vida-dev`; no comparte volúmenes con el proyecto
  local anterior ni datos con Supabase remoto.
- Administrador local: `puravida`, con la contraseña de prueba indicada por el
  usuario en la conversación. No se guardó la contraseña en los archivos.

La CLI de Supabase falló al copiar el servicio Edge Runtime a Docker en Windows.
`scripts/serve-local-functions.ts` carga los handlers reales de la aplicación y los
sirve con Deno como alternativa exclusivamente local. No reimplementa su lógica.

Preparación, desde la raíz del repositorio:

1. `node scripts/prepare-pura-vida-local.mjs`
2. `supabase start --workdir dev/pura-vida.local --exclude studio,postgres-meta,mailpit,storage-api,imgproxy,realtime,logflare,vector,supavisor,edge-runtime`
3. `supabase migration up --local --workdir dev/pura-vida.local`
4. `node scripts/start-local-functions.mjs` (dejar ejecutándose).
5. `node scripts/dev-pura-vida.mjs` (dejar ejecutándose).

El servidor Vite usa el entorno aislado por defecto y no modifica `.env`.
`--production-data` es una opción explícita para conectar a datos remotos; no se
debe usar para probar esta funcionalidad antes de su puesta en producción.

## Validación

`scripts/test-employee-permissions.mjs` exige una API localhost:56000 y rechaza
cualquier URL remota. Recibe la contraseña del administrador de prueba por
`PURA_VIDA_BOOTSTRAP_PASSWORD`, mantenida en memoria. Crea y limpia datos ficticios.
Deja disponible el administrador local para las pruebas manuales.

Se verificaron permisos por acción, denegación por defecto, bloqueo de promoción
propia, escrituras directas bloqueadas, separación entre crear/editar/cancelar/
cerrar/eliminar, transacciones y reversión de reservas y ventas, cargos automáticos,
pagos sin débitos falsificados, revocación usando el mismo token, CRUD de los
módulos, creación/edición/listado de empleados mediante las funciones reales y
acceso anterior de Administrador/Jugador. Pasaron ocho grupos de comprobaciones.

La compilación Vite y las comprobaciones Deno de las funciones actualizadas
pasaron. El chequeo TypeScript general mantiene errores anteriores del proyecto;
los archivos nuevos y la navegación se revisaron sin añadir errores de tipos.

## Publicación

Para el módulo Caja, sus permisos y sus migraciones posteriores, consultar
`CASH_MANAGEMENT.md`. Caja incorpora también una actualización atómica de reservas
para administradores y exige apertura antes de contabilizar cobros.

Solo ante un pedido expreso: aplicar
`migrations/20261019120000_employee_permissions.sql` en el proyecto Pura Vida,
desplegar las funciones actualizadas y publicar el frontend. La migración es
compatible con los roles existentes. No ejecutar automáticamente `db push` con
el proyecto vinculado del repositorio: ese vínculo sigue siendo Padel Center.
