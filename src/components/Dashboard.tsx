import React from 'react';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  TrendingUp, 
  DollarSign,
  Activity,
  CheckCircle,
  AlertCircle,
  Star
} from 'lucide-react';
import { Booking, Court, PlayerProfile, Sale } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';
import { getArgentinaDateString } from '../utils/date';

interface DashboardProps {
  bookings: Booking[];
  courts: Court[];
  players: PlayerProfile[];
  sales: Sale[];
}

const Dashboard: React.FC<DashboardProps> = ({ bookings, courts, players, sales }) => {
  // Estadísticas generales
  const today = getArgentinaDateString();
  const todayBookings = bookings.filter(b => b.date === today);
  const activeBookings = bookings.filter(b => b.status === 'confirmed' && b.date >= today);
  const completedBookings = bookings.filter(b => b.status === 'completed');
  
  const todaySales = sales.filter(s => s.date === today);
  const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  
  const totalRevenue = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);

  // Próximas reservas
  const upcomingBookings = bookings
    .filter(b => b.status === 'confirmed' && b.date >= today)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    })
    .slice(0, 5);

  // Canchas más populares
  const courtUsage = courts.map(court => {
    const courtBookings = bookings.filter(b => b.courtId === court.id);
    return {
      ...court,
      bookingCount: courtBookings.length,
      revenue: courtBookings.reduce((sum, b) => sum + (b.finalTotal || b.totalPrice), 0)
    };
  }).sort((a, b) => b.bookingCount - a.bookingCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inicio</h1>
          <p className="text-gray-600">Panel de administración del sistema</p>
        </div>
        <div className="text-sm text-gray-500">
          Última actualización: {new Date().toLocaleString('es-AR')}
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
              <p className="text-xs text-blue-600">
                {activeBookings.length} activas
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Ingresos Hoy</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(todayRevenue)}</p>
              <p className="text-xs text-green-600">
                {todaySales.length} ventas
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Jugadores</p>
              <p className="text-2xl font-bold text-gray-900">{players.length}</p>
              <p className="text-xs text-purple-600">
                {players.filter(p => p.totalBookings > 0).length} activos
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Ingresos Total</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
              <p className="text-xs text-orange-600">
                {completedBookings.length} turnos completados
              </p>
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
                <p>No hay reservas próximas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingBookings.map(booking => (
                  <div key={booking.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{booking.courtName}</p>
                        <p className="text-sm text-gray-600">
                          {formatDate(booking.date)} - {booking.startTime}
                        </p>
                        <p className="text-xs text-gray-500">
                          {booking.players[0]?.name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {booking.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Canchas Populares */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <Star className="w-5 h-5 text-yellow-600" />
              <h3 className="text-lg font-semibold text-gray-900">Canchas Más Populares</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {courtUsage.map((court, index) => (
                <div key={court.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 ? 'bg-yellow-100 text-yellow-800' :
                      index === 1 ? 'bg-gray-100 text-gray-800' :
                      index === 2 ? 'bg-orange-100 text-orange-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{court.name}</p>
                      <p className="text-sm text-gray-600">
                        {court.bookingCount} reservas
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {formatCurrency(court.revenue)}
                    </p>
                    <p className="text-xs text-gray-500">ingresos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-green-500 to-blue-600 rounded-xl p-6 text-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold mb-2">¡Sistema de Gestión Activo!</h3>
            <p className="text-green-100">
              Gestiona reservas, jugadores, canchas, ventas y usuarios desde un solo lugar.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-lg p-4 text-center">
              <Activity className="w-6 h-6 mx-auto mb-1" />
              <p className="text-sm font-medium">Sistema Activo</p>
            </div>
            <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-lg p-4 text-center">
              <CheckCircle className="w-6 h-6 mx-auto mb-1" />
              <p className="text-sm font-medium">Todo Funcionando</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
