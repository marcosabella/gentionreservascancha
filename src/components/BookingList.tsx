import React, { useMemo, useState } from 'react';
import { Calendar, Clock, User, Phone, Mail, Trash2, Filter, Users, ShoppingCart, Edit, CheckCircle, Settings, Eye, Search, MapPin } from 'lucide-react';
import { Booking, AuthUser } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';
import { getArgentinaDateString } from '../utils/date';
import ConfirmDialog from './ConfirmDialog';
import BookingDetailContent from './BookingDetailContent';

interface BookingListProps {
  bookings: Booking[];
  user: AuthUser | null;
  onBookingCancel: (bookingId: string) => void;
  onBookingClose: (booking: Booking) => void;
  onBookingEdit: (booking: Booking) => void;
}

const BookingList: React.FC<BookingListProps> = ({ bookings, user, onBookingCancel, onBookingClose, onBookingEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'completed' | 'today'>('today');
  const [courtFilter, setCourtFilter] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({
    title: '',
    message: '',
    content: null as React.ReactNode,
    type: 'info' as 'confirm' | 'success' | 'info' | 'error',
    confirmText: 'OK',
    cancelText: 'Cancelar',
    maxWidth: 'md' as 'md' | '3xl',
    onConfirm: () => {},
    onCancel: () => {}
  });
  
  const today = getArgentinaDateString();

  const visibleBookings = useMemo(() => {
    const latestByRecurringSlot = new Map<string, Booking>();
    const regularBookings: Booking[] = [];

    const getCreatedAtTime = (booking: Booking) => {
      const createdAtTime = new Date(booking.createdAt).getTime();
      return Number.isNaN(createdAtTime) ? 0 : createdAtTime;
    };

    const getStatusRank = (booking: Booking) => {
      if (booking.status === 'completed') return 3;
      if (booking.status === 'cancelled') return 1;
      return 2;
    };

    const isPreferredRecurringBooking = (candidate: Booking, current: Booking) => {
      const candidateRank = getStatusRank(candidate);
      const currentRank = getStatusRank(current);

      if (candidateRank !== currentRank) {
        return candidateRank > currentRank;
      }

      if (candidate.status !== 'cancelled' && current.status === 'cancelled') {
        return true;
      }

      if (candidate.status === 'cancelled' && current.status !== 'cancelled') {
        return false;
      }

      return getCreatedAtTime(candidate) > getCreatedAtTime(current);
    };

    bookings.forEach(booking => {
      if (!booking.isRecurring) {
        regularBookings.push(booking);
        return;
      }

      const slotKey = [
        booking.courtId,
        booking.date,
        booking.startTime,
        booking.endTime
      ].join('|');
      const current = latestByRecurringSlot.get(slotKey);

      if (!current || isPreferredRecurringBooking(booking, current)) {
        latestByRecurringSlot.set(slotKey, booking);
      }
    });

    return [...regularBookings, ...latestByRecurringSlot.values()];
  }, [bookings]);
  
  // Get unique courts and players for filters
  const uniqueCourts = [...new Set(visibleBookings.map(b => b.courtName))].sort();

  const filteredBookings = visibleBookings.filter(booking => {
    // Search filter
    const matchesSearch = !searchTerm || 
      booking.courtName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.players.some(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      booking.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Date filter
    const matchesDate = !dateFilter || booking.date === dateFilter;
    
    // Court filter
    const matchesCourt = !courtFilter || booking.courtName === courtFilter;
    
    // Status filter
    const matchesStatus = (() => {
      switch (statusFilter) {
        case 'today':
          return booking.date === today;
      case 'upcoming':
          return booking.date >= today && booking.status !== 'completed' && booking.status !== 'cancelled';
        case 'completed':
          return booking.status === 'completed';
      default:
        return true;
      }
    })();
    
    return matchesSearch && matchesDate && matchesCourt && matchesStatus;
  }).sort((a, b) => {
    // Sort by date (newest first), then by start time
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.startTime.localeCompare(a.startTime);
  });

  // Statistics
  const todayBookings = visibleBookings.filter(b => b.date === today);
  const upcomingBookings = visibleBookings.filter(b => b.date >= today && b.status !== 'completed' && b.status !== 'cancelled');
  const completedBookings = visibleBookings.filter(b => b.status === 'completed');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'in-progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-purple-100 text-purple-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Confirmada';
      case 'pending': return 'Pendiente';
      case 'in-progress': return 'En Progreso';
      case 'completed': return 'Completada';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };

  const canCloseBooking = (booking: Booking) => {
    return booking.status === 'confirmed';
  };

  const canEditBooking = (booking: Booking) => {
    return booking.status === 'completed' || (booking.status === 'confirmed' && booking.date >= today);
  };

  const canCancelBooking = (booking: Booking) => {
    return booking.status === 'confirmed' && booking.date >= today;
  };

  const showConfirmDialog = (config: typeof dialogConfig) => {
    setDialogConfig(config);
    setShowDialog(true);
  };

  const hideDialog = () => {
    setShowDialog(false);
  };

  const handleCancelBooking = (bookingId: string) => {
    showConfirmDialog({
      title: 'Cancelar Reserva',
      message: '¿Estás seguro de que quieres cancelar esta reserva?\n\nEsta acción no se puede deshacer.',
      content: null,
      type: 'confirm',
      confirmText: 'Sí, Cancelar',
      cancelText: 'No, Mantener',
      maxWidth: 'md',
      onConfirm: () => {
        onBookingCancel(bookingId);
        hideDialog();
        showConfirmDialog({
          title: 'Reserva Cancelada',
          message: 'La reserva ha sido cancelada exitosamente.',
          content: null,
          type: 'success',
          confirmText: 'OK',
          cancelText: '',
          maxWidth: 'md',
          onConfirm: hideDialog,
          onCancel: hideDialog
        });
      },
      onCancel: hideDialog
    });
  };

  const showBookingDetails = (booking: Booking) => {
    showConfirmDialog({
      title: 'Detalles de la Reserva',
      message: '',
      content: <BookingDetailContent booking={booking} getStatusText={getStatusText} />,
      type: 'info',
      confirmText: 'Cerrar',
      cancelText: '',
      maxWidth: '3xl',
      onConfirm: hideDialog,
      onCancel: hideDialog
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mis Reservas</h2>
          <p className="text-gray-600">
            {statusFilter === 'today' ? `Reservas de hoy (${filteredBookings.length})` : 
             `${filteredBookings.length} reservas encontradas`}
          </p>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Hoy</p>
              <p className="text-xl font-bold text-gray-900">{todayBookings.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Próximas</p>
              <p className="text-xl font-bold text-gray-900">{upcomingBookings.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Finalizadas</p>
              <p className="text-xl font-bold text-gray-900">{completedBookings.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-xl font-bold text-gray-900">{visibleBookings.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por jugador, cancha o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          />
        </div>

        {/* Date Filter */}
        <div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center space-x-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          >
            <option value="today">Hoy</option>
            <option value="all">Todas</option>
            <option value="upcoming">Próximas</option>
            <option value="completed">Finalizadas</option>
          </select>
        </div>

        {/* Court Filter */}
        <div className="flex items-center space-x-2">
          <MapPin className="w-5 h-5 text-gray-500" />
          <select
            value={courtFilter}
            onChange={(e) => setCourtFilter(e.target.value)}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          >
            <option value="">Todas las canchas</option>
            {uniqueCourts.map(court => (
              <option key={court} value={court}>{court}</option>
            ))}
          </select>
        </div>

        {/* Clear Filters */}
        <div>
          <button
            onClick={() => {
              setSearchTerm('');
              setDateFilter('');
              setStatusFilter('today');
              setCourtFilter('');
            }}
            className="w-full px-4 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      {/* Bookings Table */}
      {filteredBookings.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm || dateFilter || courtFilter || statusFilter !== 'today' ? 
              'No se encontraron reservas' : 'No hay reservas para hoy'}
          </h3>
          <p className="text-gray-600">
            {searchTerm || dateFilter || courtFilter || statusFilter !== 'today' ? 
              'Intenta con otros filtros de búsqueda' : 'Las reservas de hoy aparecerán aquí'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cancha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Horario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organizador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBookings.map(booking => (
                  <tr key={booking.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{booking.courtName}</div>
                      {booking.isRecurring && (
                        <div className="flex items-center mt-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                          <span className="text-xs text-blue-600 font-medium">Turno Fijo</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                        <div className="text-sm text-gray-900">{formatDate(booking.date)}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 text-gray-400 mr-2" />
                        <div className="text-sm text-gray-900">{booking.startTime} - {booking.endTime}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{booking.players[0]?.name}</div>
                          <div className="text-sm text-gray-500">{booking.players[0]?.phone || 'Sin teléfono'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                        {getStatusText(booking.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(booking.finalTotal || booking.totalPrice)}
                      </div>
                      {booking.status === 'completed' && booking.finalTotal !== booking.totalPrice && (
                        <div className="text-xs text-gray-500">
                          Inicial: {formatCurrency(booking.totalPrice)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-1">
                        {/* Ver */}
                        <button
                          onClick={() => showBookingDetails(booking)}
                          className="inline-flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="w-3 h-3" />
                        </button>

                        {/* Gestionar jugadores y consumibles */}
                        {canEditBooking(booking) && user?.role === 'admin' && (
                          <button
                            onClick={() => onBookingEdit(booking)}
                            className="inline-flex items-center px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                            title="Gestionar jugadores y consumibles"
                          >
                            <Settings className="w-3 h-3" />
                          </button>
                        )}

                        {/* Finalizar Turno */}
                        {canCloseBooking(booking) && user?.role === 'admin' && (
                          <button
                            onClick={() => onBookingClose(booking)}
                            className="inline-flex items-center px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                            title="Finalizar turno"
                          >
                            <CheckCircle className="w-3 h-3" />
                          </button>
                        )}

                        {/* Cancelar */}
                        {canCancelBooking(booking) && (
                          <button
                            onClick={() => handleCancelBooking(booking.id)}
                            className="inline-flex items-center px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                            title="Cancelar reserva"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}

                        {booking.status === 'completed' && (
                          <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Finalizado
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDialog}
        title={dialogConfig.title}
        message={dialogConfig.message}
        content={dialogConfig.content}
        type={dialogConfig.type}
        confirmText={dialogConfig.confirmText}
        cancelText={dialogConfig.cancelText}
        maxWidth={dialogConfig.maxWidth}
        onConfirm={dialogConfig.onConfirm}
        onCancel={dialogConfig.onCancel}
      />
    </div>
  );
};

export default BookingList;
