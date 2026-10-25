export type UserRole = 'admin' | 'player' | 'employee';

export const employeeModules = [
  { id: 'dashboard', label: 'Inicio', actions: [['view', 'Ver resumen de los módulos habilitados']] },
  { id: 'bookings', label: 'Reservas', actions: [['view', 'Ver calendario y reservas'], ['create', 'Crear reservas'], ['edit', 'Modificar reservas y consumos'], ['cancel', 'Cancelar reservas'], ['close', 'Cerrar turnos y registrar sus cobros']] },
  { id: 'recurring', label: 'Turnos fijos', actions: [['view', 'Consultar'], ['create', 'Crear'], ['edit', 'Modificar, activar y gestionar excepciones'], ['delete', 'Eliminar']] },
  { id: 'availability', label: 'Bloqueos y disponibilidad', actions: [['view', 'Consultar'], ['create', 'Crear bloqueos'], ['edit', 'Modificar bloqueos'], ['delete', 'Eliminar bloqueos']] },
  { id: 'players', label: 'Jugadores', actions: [['view', 'Consultar jugadores'], ['create', 'Crear jugadores'], ['edit', 'Modificar jugadores'], ['delete', 'Eliminar jugadores'], ['credit', 'Habilitar o deshabilitar cuenta corriente']] },
  { id: 'sales', label: 'Ventas', actions: [['view', 'Consultar ventas'], ['create', 'Registrar ventas'], ['edit', 'Modificar ventas'], ['delete', 'Eliminar ventas']] },
  { id: 'accounts', label: 'Cuentas corrientes', actions: [['view', 'Consultar saldos y movimientos'], ['pay', 'Registrar pagos'], ['delete', 'Eliminar movimientos']] },
  { id: 'cash', label: 'Caja', actions: [['view', 'Ver caja y movimientos'], ['open', 'Abrir caja'], ['move', 'Registrar ingresos, gastos y retiros'], ['adjust', 'Anular movimientos manuales'], ['close', 'Arqueo y cierre'], ['edit', 'Modificar apertura y observaciones'], ['delete', 'Eliminar cajas'], ['reopen', 'Reabrir o restaurar cajas'], ['report', 'Consultar historial, auditoría y exportar reportes']] },
  { id: 'tournaments', label: 'Torneos', actions: [['view', 'Consultar torneos'], ['manage', 'Crear y administrar parejas, zonas y resultados'], ['delete', 'Eliminar torneos']] },
  { id: 'courts', label: 'Canchas y horarios', actions: [['view', 'Consultar'], ['create', 'Crear canchas'], ['edit', 'Modificar canchas, precios y horarios'], ['delete', 'Eliminar canchas']] },
  { id: 'products', label: 'Productos y precios', actions: [['view', 'Consultar productos'], ['create', 'Crear productos'], ['edit', 'Modificar productos y precios'], ['delete', 'Eliminar productos'], ['categories', 'Administrar categorías']] },
] as const;

export type Permission = `${typeof employeeModules[number]['id']}.${string}`;
export const allEmployeePermissions: string[] = employeeModules.flatMap(module => module.actions.map(action => `${module.id}.${action[0]}`));

export function normalizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set(value.filter((item): item is string => typeof item === 'string' && allEmployeePermissions.includes(item)));
  for (const permission of selected) selected.add(`${permission.split('.')[0]}.view`);
  return allEmployeePermissions.filter(permission => selected.has(permission)) as Permission[];
}

export function hasPermission(user: { role: UserRole; permissions?: readonly string[] } | null | undefined, permission: string): boolean {
  if (user?.role === 'admin') return true;
  if (user?.role !== 'employee') return false;
  const module = permission.split('.')[0];
  return Boolean(user.permissions?.includes(`${module}.view`) && user.permissions.includes(permission));
}

export const tabPermissions: Record<string, string> = {
  dashboard: 'dashboard.view', reservas: 'bookings.view', 'mis-reservas': 'bookings.view',
  'turnos-fijos': 'recurring.view', disponibilidad: 'availability.view', jugadores: 'players.view',
  ventas: 'sales.view', 'cuenta-corriente': 'accounts.view', torneos: 'tournaments.view',
  canchas: 'courts.view', consumibles: 'products.view', usuarios: 'users.admin-only', caja: 'cash.view',
  notificaciones: 'notifications.admin-only',
};

export function canReadEmployeeTable(user: { role: UserRole; permissions?: readonly string[] } | null | undefined, table: string): boolean {
  if (user?.role !== 'employee') return true;
  const any = (...permissions: string[]) => permissions.some(permission => hasPermission(user, permission));
  switch (table) {
    case 'courts': case 'schedule_settings': return any('courts.view', 'bookings.view', 'recurring.view', 'availability.view');
    case 'players': return any('players.view', 'bookings.create', 'bookings.edit', 'bookings.close', 'recurring.view', 'sales.create', 'sales.edit', 'accounts.view', 'tournaments.view');
    case 'consumables': case 'consumable_categories': return any('products.view', 'bookings.create', 'bookings.edit', 'bookings.close', 'sales.create', 'sales.edit');
    case 'bookings': case 'booking_players': case 'booking_consumptions': return any('bookings.view', 'recurring.view', 'sales.view');
    case 'recurring_bookings': return any('recurring.view', 'bookings.view');
    case 'court_unavailabilities': return any('availability.view', 'bookings.view', 'recurring.view');
    case 'sales': case 'sale_items': return any('sales.view');
    case 'current_account_entries': return any('accounts.view');
    case 'tournaments': return any('tournaments.view');
    default: return false;
  }
}
