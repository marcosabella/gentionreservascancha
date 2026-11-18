# Reportes y estadísticas

Disponible arriba de Configuración para administradores y empleados con `reports.view`.
El permiso incluye consultar y exportar toda la información del módulo; no otorga acceso a otros módulos.

El filtro de estado comienza en **Turnos finalizados**. También permite **Reservas futuras** y **Todos los estados**.
Finalizados incluye solo `completed`; su ocupación usa capacidad transcurrida y no proyecta turnos fijos.
Futuras incluye `pending` y `confirmed` cuyo inicio aún no llegó, tomando fecha/hora de Argentina al consultar,
y ajusta inicialmente el período a los próximos siete días. No incluye ventas realizadas ni reconoce ingresos futuros.
El filtro afecta rankings, detalle individual, ocupación y CSV/PDF. Para cancelaciones se debe elegir Todos los estados.
La lista de próximos espacios libres siempre consulta disponibilidad real, independientemente del filtro de estado.

- La grilla de Jugadores cuenta cada reserva no cancelada una vez por participante.
  Los triggers de PostgreSQL reparan el histórico y actualizan totales y fecha al cambiar participantes, fechas o estados, o eliminar reservas.
- El módulo consulta `management_report_data(desde,hasta)` y admite hasta 366 días.
  La respuesta JSON incluye el período anterior de igual duración y disponibilidad de los próximos siete días.
  La consulta no depende del límite de filas de las listas del frontend.
- Reservas vigentes incluye pendientes, confirmadas, en curso y finalizadas.
  El ranking y el selector individual ocultan jugadores sin reservas ni cancelaciones en el período.
  La lista de inactivos solo muestra jugadores que tienen reservas históricas registradas.
  Una cancelación se atribuye a los participantes; no identifica a la persona que canceló.
- Las operaciones económicas incluyen turnos finalizados y ventas directas.
  Se descuentan bonificaciones del total neto. Se incluye cuenta corriente, por lo que no equivale a cobros de caja.
  Las ventas de tipo booking no vuelven a sumar los consumos del turno.
- El filtro por cancha excluye ventas directas, que no tienen cancha asignada.
  El informe individual respeta reparto de cancha, consumos asignados y distribución de ventas.
- Ocupación usa la grilla de 90 minutos y la configuración actual de horarios y bloqueos.
  Se descuentan clases, cierres y mantenimiento. Se contemplan horarios nocturnos y excepciones de turnos fijos.
  Los turnos fijos activos ocupan disponibilidad futura; no se proyectan hacia el pasado.
  Cambios históricos de horarios o bloqueos no pueden reconstruirse sin un historial de configuración.
- Excel / CSV exporta todas las secciones y el jugador seleccionado en CSV UTF-8 compatible con Excel.
  Los textos se escapan para evitar fórmulas al abrirlos en una planilla.
  Imprimir / PDF usa la impresión del navegador de la sección visible.

## Validación

```text
node scripts/test-player-booking-statistics.mjs
node scripts/test-management-reports.mjs
node scripts/test-management-reports-ui.mjs
```

Las pruebas SQL usan PostgreSQL aislado con PGlite, ya disponible en `tmp/stock-test`.
Para una instalación nueva de las dependencias de prueba:

```text
npm install --prefix tmp/stock-test --no-save --package-lock=false @electric-sql/pglite
```

## Publicación

`scripts/reports-database.mjs apply|verify padel-center|pura-vida` aplica y verifica únicamente
las migraciones `20261117120000` y `20261117130000`. Comprueba los contadores completos,
el acceso autenticado de un administrador, la denegación anónima y la presencia de los datos.
Los resultados quedan en `supabase/releases/<cliente>-reports-verification.json`.
Actualizar las funciones `create-user` y `update-user-role` para reconocer `reports.view`.
Usar el flujo existente de `scripts/release-clients.mjs` para compilar, publicar y verificar ambos sitios.
