import React, { useState } from 'react';
import { Calendar, Plus, Clock, MapPin } from 'lucide-react';
import { Court, Booking, TimeSlot, RecurringBooking, PlayerProfile, CourtUnavailability } from '../types';
import { generateTimeSlots, formatDate } from '../utils/timeSlots';
import { dateOnlyToLocalDate, getArgentinaDateString } from '../utils/date';
import { getReasonLabel } from '../utils/availability';
import BookingActionPopup from './BookingActionPopup';
import ConfirmDialog from './ConfirmDialog';
import BookingDetailContent from './BookingDetailContent';

interface BookingCalendarProps {
  courts: Court[];
  bookings: Booking[];
  recurringBookings: RecurringBooking[];
  courtUnavailabilities: CourtUnavailability[];
  currentPlayerProfile?: PlayerProfile;
  isPlayerRole?: boolean;
  onNewBooking: (prefilledData?: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
  }) => void;
  onBookingClick: (booking: Booking) => void;
  onBookingEdit: (booking: Booking) => void;
  onBookingClose: (booking: Booking) => void;
}

const BookingCalendar: React.FC<BookingCalendarProps> = ({
  courts,
  bookings,
  recurringBookings,
  courtUnavailabilities,
  currentPlayerProfile,
  isPlayerRole = false,
  onNewBooking,
  onBookingClick,
  onBookingEdit,
  onBookingClose
}) => {
  const [selectedDate, setSelectedDate] = useState(getArgentinaDateString);
  const [selectedCourt, setSelectedCourt] = useState(courts[0]?.id || '');
  const [showBookingPopup, setShowBookingPopup] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
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
  
  const selectedCourtData = courts.find(c => c.id === selectedCourt);
  const startTime = selectedCourtData?.startTime || '08:00';
  const endTime = selectedCourtData?.endTime || '22:00';
  
  // Debug: Log props received
  console.log('🎯 BOOKING CALENDAR PROPS:');
  console.log('Courts:', courts);
  console.log('Bookings:', bookings);
  console.log('Recurring Bookings:', recurringBookings);
  console.log('Selected Date:', selectedDate);
  console.log('Selected Court:', selectedCourt);

  const timeSlots = generateTimeSlots(
    bookings,
    recurringBookings,
    courtUnavailabilities,
    selectedCourt,
    selectedDate,
    startTime,
    endTime
  );

  const handleSlotClick = (slot: TimeSlot) => {
    if (slot.available) {
      // Calcular hora de fin (1.5 horas después)
      const [startHour, startMinute] = slot.time.split(':').map(Number);
      const startTimeMinutes = startHour * 60 + startMinute;
      const endTimeMinutes = startTimeMinutes + 90; // 90 minutos = 1.5 horas
      const endHour = Math.floor(endTimeMinutes / 60);
      const endMinute = endTimeMinutes % 60;
      const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;

      onNewBooking({
        date: selectedDate,
        courtId: selectedCourt,
        startTime: slot.time,
        endTime: endTime
      });
    } else if (slot.unavailableId) {
      const unavailability = courtUnavailabilities.find(item => item.id === slot.unavailableId);
      setDialogConfig({
        title: 'Horario no disponible',
          message: unavailability
            ? `${unavailability.title}\nMotivo: ${getReasonLabel(unavailability.reason)}\nHorario: ${unavailability.startTime} - ${unavailability.endTime}`
            : 'Este horario no se encuentra disponible.',
          content: null,
          type: 'info',
          confirmText: 'OK',
          cancelText: '',
          maxWidth: 'md',
        onConfirm: () => setShowDialog(false),
        onCancel: () => {}
      });
      setShowDialog(true);
    } else if (slot.bookingId) {
      const booking = bookings.find(b => b.id === slot.bookingId);
      if (booking) {
        if (isPlayerRole && currentPlayerProfile) {
          const isOwnBooking = booking.players.some(p => p.id === currentPlayerProfile.id);
          if (isOwnBooking) {
            setSelectedBooking(booking);
            setShowBookingPopup(true);
          } else {
            setDialogConfig({
              title: 'Horario Ocupado',
              message: 'Este horario ya está reservado por otro jugador.',
              content: null,
              type: 'info',
              confirmText: 'OK',
              cancelText: '',
              maxWidth: 'md',
              onConfirm: () => setShowDialog(false),
              onCancel: () => {}
            });
            setShowDialog(true);
          }
        } else {
          setSelectedBooking(booking);
          setShowBookingPopup(true);
        }
      }
    }
  };

  const showBookingDetails = (booking: Booking) => {
    setDialogConfig({
      title: 'Detalles de la Reserva',
      message: '',
      content: <BookingDetailContent booking={booking} getStatusText={getStatusText} />,
      type: 'info',
      confirmText: 'Cerrar',
      cancelText: '',
      maxWidth: '3xl',
      onConfirm: () => setShowDialog(false),
      onCancel: () => setShowDialog(false)
    });
    setShowDialog(true);
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

  return (
    <>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reservar Turno</h2>
          <p className="text-gray-600">Selecciona fecha, cancha y horario disponible (turnos de 1:30hs)</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={onNewBooking}
            className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Nueva Reserva</span>
          </button>
        </div>
      </div>

      {/* Date and Court Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="w-4 h-4 inline mr-2" />
            Fecha
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min={getArgentinaDateString()}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <MapPin className="w-4 h-4 inline mr-2" />
            Cancha
          </label>
          <select
            value={selectedCourt}
            onChange={(e) => setSelectedCourt(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          >
            {courts.map(court => (
              <option key={court.id} value={court.id}>
                {court.name} ({court.startTime} - {court.endTime})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected Date Info */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">
          {formatDate(selectedDate)}
        </h3>
        <p className="text-blue-700 text-sm">
          {selectedCourtData?.name} - 
          Horarios disponibles marcados en verde (Horario: {startTime} - {endTime})
        </p>
      </div>

      {/* Time Slots Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {timeSlots.map(slot => {
          const booking = bookings.find(b => b.id === slot.bookingId);
          const unavailability = courtUnavailabilities.find(item => item.id === slot.unavailableId);
          const bookingOwner = booking?.players[0];
          const isCompletedBooking = booking?.status === 'completed';
          const canShowBookingOwner =
            !isPlayerRole || bookingOwner?.id === currentPlayerProfile?.id;
          
          // Check if this slot has a recurring booking
          const selectedDateObj = dateOnlyToLocalDate(selectedDate);
          const dayOfWeek = selectedDateObj.getDay();
          const recurringBooking = recurringBookings.find(recurring => 
            recurring.courtId === selectedCourt &&
            recurring.dayOfWeek === dayOfWeek &&
            recurring.startTime === slot.time &&
            recurring.isActive &&
            !recurring.skipDates.includes(selectedDate)
          );
          const canShowRecurringOwner =
            !isPlayerRole || recurringBooking?.playerId === currentPlayerProfile?.id;
          
          console.log('Rendering slot:', {
            time: slot.time,
            available: slot.available,
            hasBooking: !!booking,
            hasUnavailability: !!unavailability,
            hasRecurring: !!recurringBooking,
            bookingPlayer: booking?.players[0]?.name,
            recurringPlayer: recurringBooking?.playerName
          });
          
          return (
            <div
              key={slot.time}
              className={`p-4 rounded-lg border-2 text-center transition-all ${
                slot.available
                  ? 'border-green-200 bg-green-50 hover:bg-green-100 cursor-pointer'
                  : isCompletedBooking
                  ? 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100 cursor-pointer'
                  : 'border-red-200 bg-red-50 hover:bg-red-100 cursor-pointer'
              }`}
              onClick={() => {
                handleSlotClick(slot);
              }}
            >
              <div className="flex items-center justify-center space-x-1 mb-2">
                <Clock className="w-4 h-4" />
                <span className="font-bold text-lg">{slot.time}</span>
              </div>
              
              <div className="text-xs text-gray-500 mb-2">
                Duración: 1:30hs
              </div>
              
              {slot.available ? (
                <span className="text-xs text-green-600">Disponible</span>
              ) : isCompletedBooking ? (
                <div className="text-xs text-yellow-700">
                  <div className="font-medium">Finalizado</div>
                  {bookingOwner && (
                    <div className="mt-1 space-y-1">
                      {canShowBookingOwner && (
                        <div className="text-xs text-gray-600">
                          {bookingOwner.name}
                          {booking.players.length > 1 && ` +${booking.players.length - 1}`}
                        </div>
                      )}
                      <div className="text-xs text-yellow-700 font-medium">
                        Click para ver
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-red-600">
                  <div className="font-medium">Ocupado</div>
                  {booking ? (
                    <div className="mt-1 space-y-1">
                      {canShowBookingOwner && bookingOwner && (
                        <div className="text-xs text-gray-600">
                          {bookingOwner.name}
                          {booking.players.length > 1 && ` +${booking.players.length - 1}`}
                        </div>
                      )}
                      <div className="text-xs text-blue-600 font-medium">
                        Click para gestionar
                      </div>
                    </div>
                  ) : unavailability ? (
                    <div className="mt-1 space-y-1">
                      <div className="text-xs text-gray-600">
                        {unavailability.title}
                      </div>
                      <div className="text-xs text-red-700 font-medium">
                        {getReasonLabel(unavailability.reason)}
                      </div>
                    </div>
                  ) : recurringBooking && (
                    <div className="mt-1 space-y-1">
                      {canShowRecurringOwner && (
                        <div className="text-xs text-gray-600">
                          {recurringBooking.playerName}
                        </div>
                      )}
                      <div className="text-xs text-blue-600 font-medium">
                        Turno Fijo
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-green-100 border-2 border-green-200 rounded"></div>
          <span className="text-sm text-gray-600">Disponible</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-red-100 border-2 border-red-200 rounded"></div>
          <span className="text-sm text-gray-600">Ocupado / no disponible</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-yellow-100 border-2 border-yellow-200 rounded"></div>
          <span className="text-sm text-gray-600">Finalizado</span>
        </div>
      </div>
      </div>

      {/* Booking Action Popup */}
      {showBookingPopup && selectedBooking && (
        <BookingActionPopup
          booking={selectedBooking}
          isPlayerRole={isPlayerRole}
          onAddConsumables={() => {
            setShowBookingPopup(false);
            onBookingEdit(selectedBooking);
          }}
          onFinalizeTurn={() => {
            setShowBookingPopup(false);
            onBookingClose(selectedBooking);
          }}
          onViewDetails={() => {
            setShowBookingPopup(false);
            showBookingDetails(selectedBooking);
          }}
          onClose={() => {
            setShowBookingPopup(false);
            setSelectedBooking(null);
          }}
        />
      )}

      {/* Confirm Dialog */}
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
    </>
  );
};

export default BookingCalendar;
