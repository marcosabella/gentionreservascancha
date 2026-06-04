import React from 'react';
import { 
  Calendar, 
  Clock, 
  CreditCard, 
  TrendingDown, 
  TrendingUp, 
  CheckCircle,
  User,
  Phone,
  Mail
} from 'lucide-react';
import { Booking, Sale, CurrentAccountEntry, PlayerProfile } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';
import { getArgentinaDateString } from '../utils/date';

interface PlayerDashboardProps {
  player: PlayerProfile;
  bookings: Booking[];
  sales: Sale[];
  currentAccountEntries: CurrentAccountEntry[];
}

const PlayerDashboard: React.FC<PlayerDashboardProps> = ({ 
  player, 
  bookings, 
  sales, 
  currentAccountEntries 
}) => {
  const today = getArgentinaDateString();
  
  // Player's bookings
  const playerBookings = bookings.filter(booking => 
    booking.players.some(p => p.id === player.id)
  );
  
  const todayBookings = playerBookings.filter(b => b.date === today);
  const upcomingBookings = playerBookings.filter(b => 
    b.date >= today && b.status === 'confirmed'
  ).slice(0, 3);
  
  // Player's sales
  const playerSales = sales.filter(sale => sale.customer.id === player.id);
  
  // Current account
  const playerEntries = currentAccountEntries.filter(entry => entry.playerId === player.id);
  const balance = playerEntries.reduce((sum, entry) => 
    sum + (entry.type === 'credit' ? entry.amount : -entry.amount), 0
  );
  
  const totalSpent = playerSales.reduce((sum, sale) => sum + sale.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500 to-blue-600 rounded-xl p-6 text-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">¡Hola, {player.name}!</h1>
            <p className="text-green-100">
              Panel de jugador - Gestiona tus reservas y cuenta
            </p>
          </div>
          <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <User className="w-6 h-6" />
              <div>
                <p className="font-medium">Jugador Registrado</p>
                <p className="text-sm text-green-100">Acceso completo</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Reservas Hoy</p>
              <p className="text-2xl font-bold text-gray-900">{todayBookings.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Reservas</p>
              <p className="text-2xl font-bold text-gray-900">{player.totalBookings}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              balance < 0 ? 'bg-red-100' : balance > 0 ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {balance < 0 ? (
                <TrendingDown className="w-6 h-6 text-red-600" />
              ) : balance > 0 ? (
                <TrendingUp className="w-6 h-6 text-green-600" />
              ) : (
                <CreditCard className="w-6 h-6 text-gray-600" />
              )}
            </div>
            <div>
              <p className="text-sm text-gray-600">Cuenta Corriente</p>
              <p className={`text-2xl font-bold ${
                balance < 0 ? 'text-red-600' : balance > 0 ? 'text-green-600' : 'text-gray-600'
              }`}>
                {formatCurrency(Math.abs(balance))}
              </p>
              <p className="text-xs text-gray-500">
                {balance < 0 ? 'Debes' : balance > 0 ? 'A favor' : 'Sin saldo'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Gastado</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSpent)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximas Reservas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Próximas Reservas</h3>
            </div>
          </div>
          <div className="p-6">
            {upcomingBookings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No tienes reservas próximas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingBookings.map(booking => (
                  <div key={booking.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{booking.courtName}</p>
                        <p className="text-sm text-gray-600">
                          {formatDate(booking.date)} - {booking.startTime}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-green-600">
                      {formatCurrency(booking.finalTotal || booking.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Información Personal */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <User className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Mi Información</h3>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center space-x-3">
              <User className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Nombre</p>
                <p className="font-medium text-gray-900">{player.name}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Mail className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium text-gray-900">{player.email}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Phone className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Teléfono</p>
                <p className="font-medium text-gray-900">{player.phone}</p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Miembro desde</p>
                  <p className="font-medium text-gray-900">
                    {formatDate(player.createdAt.split('T')[0])}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Última reserva</p>
                  <p className="font-medium text-gray-900">
                    {player.lastBooking ? formatDate(player.lastBooking) : 'Nunca'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-blue-50 p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">Acciones Rápidas</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <Calendar className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <p className="font-medium text-blue-900">Hacer Reserva</p>
            <p className="text-sm text-blue-700">Reserva tu próximo turno</p>
          </div>
          <div className="text-center">
            <Clock className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <p className="font-medium text-blue-900">Mis Reservas</p>
            <p className="text-sm text-blue-700">Gestiona tus turnos</p>
          </div>
          <div className="text-center">
            <CreditCard className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <p className="font-medium text-blue-900">Cuenta Corriente</p>
            <p className="text-sm text-blue-700">Revisa tu saldo</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerDashboard;
