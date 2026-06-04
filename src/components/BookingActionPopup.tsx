import React from 'react';
import { X, ShoppingCart, CheckCircle, Eye, Calendar, Clock, Users } from 'lucide-react';
import { Booking } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';

interface BookingActionPopupProps {
  booking: Booking;
  isPlayerRole?: boolean;
  onAddConsumables: () => void;
  onFinalizeTurn: () => void;
  onViewDetails: () => void;
  onClose: () => void;
}

const BookingActionPopup: React.FC<BookingActionPopupProps> = ({
  booking,
  isPlayerRole = false,
  onAddConsumables,
  onFinalizeTurn,
  onViewDetails,
  onClose
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'in-progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Confirmada';
      case 'pending': return 'Pendiente';
      case 'in-progress': return 'En Progreso';
      case 'completed': return 'Finalizado';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };

  const canAddConsumables = booking.status === 'confirmed' || booking.status === 'completed';
  const canFinalize = booking.status === 'confirmed';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Gestionar Reserva</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Booking Info */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{booking.courtName}</h3>
              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                {getStatusText(booking.status)}
              </span>
            </div>
            
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(booking.date)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span>{booking.startTime} - {booking.endTime}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>{booking.players[0]?.name} {booking.players.length > 1 && `+${booking.players.length - 1}`}</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total actual:</span>
                <span className="font-bold text-green-600">
                  {formatCurrency(booking.finalTotal || booking.totalPrice)}
                </span>
              </div>
              {booking.consumptions.length > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  {booking.consumptions.length} consumible{booking.consumptions.length !== 1 ? 's' : ''} agregado{booking.consumptions.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {booking.isRecurring && (
              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-xs text-blue-600 font-medium">Turno Fijo</span>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={onViewDetails}
              className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              <Eye className="w-5 h-5" />
              <span>Ver Detalles</span>
            </button>

            {canAddConsumables && !isPlayerRole && (
              <button
                onClick={onAddConsumables}
                className="w-full flex items-center justify-center space-x-2 bg-orange-600 text-white py-3 rounded-lg font-medium hover:bg-orange-700 transition-colors"
              >
                <ShoppingCart className="w-5 h-5" />
                <span>
                  {booking.status === 'completed'
                    ? 'Editar Jugadores / Consumibles'
                    : 'Agregar Jugadores / Consumibles'}
                </span>
              </button>
            )}

            {canFinalize && !isPlayerRole && (
              <button
                onClick={onFinalizeTurn}
                className="w-full flex items-center justify-center space-x-2 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="w-5 h-5" />
                <span>Finalizar Turno</span>
              </button>
            )}

            {isPlayerRole && booking.status === 'confirmed' && (
              <div className="text-center py-4 text-blue-600 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium">Reserva de Solo Lectura</p>
                <p className="text-xs mt-1">Los jugadores no pueden finalizar turnos ni agregar consumibles</p>
              </div>
            )}

            {!canAddConsumables && !canFinalize && !isPlayerRole && (
              <div className="text-center py-4 text-gray-500">
                <p className="text-sm">No hay acciones disponibles para esta reserva</p>
              </div>
            )}

            {booking.status === 'completed' && isPlayerRole && (
              <div className="text-center py-4 text-yellow-700 bg-yellow-50 rounded-lg">
                <CheckCircle className="w-6 h-6 mx-auto mb-2" />
                <p className="text-sm font-medium">Turno Finalizado</p>
                <p className="text-xs">Este turno ya fue completado</p>
              </div>
            )}
          </div>

          {/* Close Button */}
          <div className="mt-6 pt-4 border-t">
            <button
              onClick={onClose}
              className="w-full px-6 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingActionPopup;
