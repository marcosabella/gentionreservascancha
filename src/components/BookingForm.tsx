import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Users, DollarSign, X, Search, Plus, CreditCard as Edit2 } from 'lucide-react';
import { Court, ConsumableItem, PlayerProfile, Player, Booking, RecurringBooking, CourtUnavailability } from '../types';
import { generateTimeOptionsForDropdown, formatCurrency } from '../utils/timeSlots';
import { getArgentinaDateString } from '../utils/date';
import { getReasonLabel, getUnavailabilityForSlot, timeRangesOverlap } from '../utils/availability';
import PlayerSearchPopup from './PlayerSearchPopup';
import PlayerEditForm from './PlayerEditForm';

interface BookingFormProps {
  courts: Court[];
  consumables: ConsumableItem[];
  players: PlayerProfile[];
  bookings: Booking[];
  recurringBookings: RecurringBooking[];
  courtUnavailabilities: CourtUnavailability[];
  prefilledData?: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
  };
  currentPlayerProfile?: PlayerProfile;
  isPlayerRole?: boolean;
  onBookingCreate: (booking: Omit<Booking, 'id'>) => void;
  onPlayerSave: (player: Omit<PlayerProfile, 'id'>) => void;
  onCancel: () => void;
}

export default function BookingForm({
  courts,
  consumables,
  players,
  bookings,
  recurringBookings,
  courtUnavailabilities,
  prefilledData,
  currentPlayerProfile,
  isPlayerRole = false,
  onBookingCreate,
  onPlayerSave,
  onCancel
}: BookingFormProps) {
  const [selectedCourt, setSelectedCourt] = useState(prefilledData?.courtId || '');
  const [selectedDate, setSelectedDate] = useState(prefilledData?.date || getArgentinaDateString());
  const [selectedStartTime, setSelectedStartTime] = useState(prefilledData?.startTime || '');
  const [selectedEndTime, setSelectedEndTime] = useState(prefilledData?.endTime || '');
  const [organizerId, setOrganizerId] = useState(currentPlayerProfile?.id || '');
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerProfile | null>(null);

  const selectedCourtData = courts.find(c => c.id === selectedCourt);
  const timeOptions = selectedCourtData 
    ? generateTimeOptionsForDropdown(selectedCourtData.startTime, selectedCourtData.endTime)
    : [];
  const organizerData = players.find(p => p.id === organizerId);

  const updateEndTime = (startTime: string) => {
    if (!startTime) {
      setSelectedEndTime('');
      return;
    }

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startTimeMinutes = startHour * 60 + startMinute;
    const endTimeMinutes = startTimeMinutes + 90; // 90 minutos = 1.5 horas
    const endHour = Math.floor(endTimeMinutes / 60);
    const endMinute = endTimeMinutes % 60;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
    
    setSelectedEndTime(endTime);
  };

  useEffect(() => {
    if (selectedStartTime) {
      updateEndTime(selectedStartTime);
    }
  }, [selectedStartTime]);

  const calculateTotal = () => {
    if (!selectedCourtData) return 0;
    
    return selectedCourtData.pricePerTurn;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCourt || !selectedDate || !selectedStartTime || !selectedEndTime || !organizerId) {
      alert('Por favor complete todos los campos obligatorios');
      return;
    }

    const selectedCourtObj = courts.find(c => c.id === selectedCourt);
    const organizerObj = players.find(p => p.id === organizerId);
    
    if (!selectedCourtObj || !organizerObj) {
      alert('Error: No se encontró la cancha o el jugador seleccionado');
      return;
    }

    const unavailable = getUnavailabilityForSlot(
      courtUnavailabilities,
      selectedCourt,
      selectedDate,
      selectedStartTime,
      selectedEndTime
    );

    if (unavailable) {
      alert(`Ese horario no esta disponible: ${unavailable.title} (${getReasonLabel(unavailable.reason)})`);
      return;
    }

    const hasBookingConflict = bookings.some(booking =>
      booking.courtId === selectedCourt &&
      booking.date === selectedDate &&
      ['confirmed', 'pending', 'in-progress'].includes(booking.status) &&
      timeRangesOverlap(booking.startTime, booking.endTime, selectedStartTime, selectedEndTime)
    );

    if (hasBookingConflict) {
      alert('Ese horario ya esta reservado');
      return;
    }

    const dayOfWeek = new Date(`${selectedDate}T00:00:00`).getDay();
    const hasRecurringConflict = recurringBookings.some(recurring =>
      recurring.courtId === selectedCourt &&
      recurring.dayOfWeek === dayOfWeek &&
      recurring.isActive &&
      !recurring.skipDates.includes(selectedDate) &&
      timeRangesOverlap(recurring.startTime, recurring.endTime, selectedStartTime, selectedEndTime)
    );

    if (hasRecurringConflict) {
      alert('Ese horario coincide con un turno fijo');
      return;
    }

    const organizerPlayer: Player = {
      id: organizerObj.id,
      name: organizerObj.name,
      phone: organizerObj.phone,
      email: organizerObj.email,
      isOrganizer: true
    };
    const booking: Omit<Booking, 'id'> = {
      courtId: selectedCourt,
      courtName: selectedCourtObj.name,
      date: selectedDate,
      startTime: selectedStartTime,
      endTime: selectedEndTime,
      players: [organizerPlayer],
      consumptions: [],
      status: 'confirmed',
      totalPrice: calculateTotal(),
      createdAt: new Date().toISOString()
    };

    onBookingCreate(booking);
  };

  const handlePlayerSelect = (player: PlayerProfile) => {
    setOrganizerId(player.id);
    setShowPlayerSearch(false);
  };

  const handlePlayerSave = (playerData: Omit<PlayerProfile, 'id'>) => {
    onPlayerSave(playerData);
    setShowPlayerForm(false);
    setEditingPlayer(null);
  };

  const handleEditPlayer = (player: PlayerProfile) => {
    setEditingPlayer(player);
    setShowPlayerForm(true);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
            Nueva Reserva
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Selección de Cancha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cancha *
            </label>
            <select
              value={selectedCourt}
              onChange={(e) => setSelectedCourt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            >
              <option value="">Seleccionar cancha</option>
              {courts.map(court => (
                <option key={court.id} value={court.id}>
                  {court.name} - {formatCurrency(court.pricePerTurn)}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha *
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={getArgentinaDateString()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>

          {/* Horarios */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hora Inicio *
              </label>
              <select
                value={selectedStartTime}
                onChange={(e) => {
                  setSelectedStartTime(e.target.value);
                  updateEndTime(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              >
                <option value="">Seleccionar</option>
                {timeOptions.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hora Fin *
              </label>
              <input
                type="text"
                value={selectedEndTime}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                placeholder="Se calcula automáticamente"
              />
              <p className="text-xs text-gray-500 mt-1">
                Se calcula automáticamente (1.5 horas después del inicio)
              </p>
            </div>
          </div>

          {/* Organizador */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Jugador Organizador *
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                {organizerData ? (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-300 rounded-md">
                    <div>
                      <p className="font-medium text-green-800">{organizerData.name}</p>
                      <p className="text-sm text-green-600">{organizerData.phone || 'Sin teléfono'}</p>
                      {isPlayerRole && (
                        <p className="text-xs text-green-500 mt-1">Tu reserva</p>
                      )}
                    </div>
                    {!isPlayerRole && (
                      <button
                        type="button"
                        onClick={() => handleEditPlayer(organizerData)}
                        className="text-green-600 hover:text-green-800 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPlayerSearch(true)}
                    disabled={isPlayerRole}
                    className="w-full p-3 border-2 border-dashed border-gray-300 rounded-md text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Buscar jugador
                  </button>
                )}
              </div>
              {!isPlayerRole && (
                <button
                  type="button"
                  onClick={() => setShowPlayerForm(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nuevo
                </button>
              )}
            </div>
          </div>

          {/* Resumen */}
          {selectedCourtData && selectedStartTime && selectedEndTime && (
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-800 mb-2 flex items-center">
                <DollarSign className="w-4 h-4 mr-1 text-green-600" />
                Resumen de Costos
              </h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Cancha ({selectedCourtData.name}):</span>
                  <span>{formatCurrency(calculateTotal())}</span>
                </div>
                <div className="border-t pt-1 mt-2">
                  <div className="flex justify-between font-medium">
                    <span>Total:</span>
                    <span>{formatCurrency(calculateTotal())}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                * Los consumibles y métodos de pago se configuran al finalizar el turno
              </p>
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Crear Reserva
            </button>
          </div>
        </form>
      </div>

      {/* Modales */}
      {showPlayerSearch && (
        <PlayerSearchPopup
          players={players}
          selectedPlayers={organizerData ? [{
            id: organizerData.id,
            name: organizerData.name,
            phone: organizerData.phone,
            email: organizerData.email,
            isOrganizer: true
          }] : []}
          maxPlayers={1}
          onPlayerSelect={handlePlayerSelect}
          onPlayerDeselect={() => setOrganizerId('')}
          onCreateNew={() => {
            setShowPlayerSearch(false);
            setShowPlayerForm(true);
          }}
          onClose={() => setShowPlayerSearch(false)}
        />
      )}

      {showPlayerForm && (
        <PlayerEditForm
          player={editingPlayer}
          onSave={handlePlayerSave}
          onCancel={() => {
            setShowPlayerForm(false);
            setEditingPlayer(null);
          }}
        />
      )}
    </div>
  );
}
