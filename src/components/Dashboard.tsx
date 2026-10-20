import React from 'react';
import { Calendar, Clock, Users, ShoppingCart, Banknote, CreditCard, ArrowUpRight } from 'lucide-react';

interface DashboardProps {
  onTabChange: (tab: string) => void;
  canAccess: (permission: string) => boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ onTabChange, canAccess }) => {
  const shortcuts = [
    { tab: 'reservas', permission: 'bookings.view', label: 'Reservas', description: 'Ver el calendario y gestionar turnos', icon: Calendar, color: 'bg-blue-50 text-blue-600' },
    { tab: 'ventas', permission: 'sales.view', label: 'Ventas', description: 'Registrar y consultar ventas', icon: ShoppingCart, color: 'bg-green-50 text-green-600' },
    { tab: 'caja', permission: 'cash.view', label: 'Caja', description: 'Ver movimientos y controlar la caja', icon: Banknote, color: 'bg-amber-50 text-amber-600' },
    { tab: 'jugadores', permission: 'players.view', label: 'Jugadores', description: 'Buscar y administrar jugadores', icon: Users, color: 'bg-purple-50 text-purple-600' },
    { tab: 'cuenta-corriente', permission: 'accounts.view', label: 'Cuentas corrientes', description: 'Consultar saldos y registrar cobros', icon: CreditCard, color: 'bg-teal-50 text-teal-600' },
    { tab: 'turnos-fijos', permission: 'recurring.view', label: 'Turnos fijos', description: 'Administrar las reservas semanales', icon: Clock, color: 'bg-indigo-50 text-indigo-600' }
  ].filter(shortcut => canAccess(shortcut.permission));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Inicio</h1>
      {shortcuts.length > 0 && (
        <section aria-labelledby="dashboard-shortcuts" className="space-y-3">
          <h2 id="dashboard-shortcuts" className="text-lg font-semibold text-gray-900">Módulos frecuentes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {shortcuts.map(({ tab, label, description, icon: Icon, color }) => (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-green-400 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
              >
                <span className={'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ' + color}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">{label}</span>
                  <span className="mt-1 block text-sm text-gray-500">{description}</span>
                </span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-gray-400 group-hover:text-green-700" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}

    </div>
  );
};

export default Dashboard;
