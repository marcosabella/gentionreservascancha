import React, { useState } from 'react';
import { Save, X, Calendar, Clock, Users, Search } from 'lucide-react';
import { RecurringBooking, Court, PlayerProfile } from '../types';
import { formatCurrency } from '../utils/timeSlots';
import PlayerSearchPopup from './PlayerSearchPopup';

interface RecurringBookingFormProps {
  courts: Court[];
  players: PlayerProfile[];
  recurringBooking?: RecurringBooking;
  onSave: (recurringBooking: Omit<RecurringBooking, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

const RecurringBookingForm: React.FC<RecurringBookingFormProps> = ({ 
  courts, 
  players, 
  recurringBooking, 
  onSave, 
  onCancel 
}) => {
  const [formData, setFormData] = useState({
    playerId: recurringBooking?.playerId || '',
    courtId: recurringBooking?.courtId || '',
    dayOfWeek: recurringBooking?.dayOfWeek || 1,
    startTime: recurringBooking?.startTime || '',
    endTime: recurringBooking?.endTime || '',
    isActive: recurringBooking?.isActive ?? true
  });

  const [showPlayerSearch, setShowPlayerSearch] = useState(false);

  const selectedPlayer = players.find(p => p.id === formData.playerId);
  const selectedCourt = courts.find(c => c.id === formData.courtId);

  const daysOfWeek = [
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sábado' },
    { value: 0, label: 'Domingo' }
  ];

  const timeOptions = [];
  for (let hour = 8; hour <= 22; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      timeOptions.push(timeString);
    }
  }

  const updateEndTime = (startTime: string) => {
    if (!startTime) {
      setFormData(prev => ({ ...prev, endTime: '' }));
      return;
    }

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startTimeMinutes = startHour * 60 + startMinute;
    const endTimeMinutes = startTimeMinutes + 90; // 90 minutos = 1.5 horas
    const endHour = Math.floor(endTimeMinutes / 60);
    const endMinute = endTimeMinutes % 60;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
    
    setFormData(prev => ({ ...prev, endTime }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.playerId || !formData.courtId || !formData.startTime || !formData.endTime) {
      alert('Por favor complete todos los campos obligatorios');
      return;
    }

    const player = players.find(p => p.id === formData.playerId);
    const court = courts.find(c => c.id === formData.courtId);

    if (!player || !court) {
      alert('Error: No se encontró el jugador o la cancha seleccionada');
      return;
    }

    const recurringBookingData: Omit<RecurringBooking, 'id' | 'createdAt'> = {
      playerId: formData.playerId,
      playerName: player.name,
      courtId: formData.courtId,
      courtName: court.name,
      dayOfWeek: formData.dayOfWeek,
      startTime: formData.startTime,
      endTime: formData.endTime,
      isActive: formData.isActive,
      skipDates: recurringBooking?.skipDates || []
    };

    onSave(recurringBookingData);
  };

  const handlePlayerSelect = (player: PlayerProfile) => {
    setFormData(prev => ({ ...prev, playerId: player.id }));
    setShowPlayerSearch(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {recurringBooking ? 'Editar Turno Fijo' : 'Nuevo Turno Fijo'}
              </h2>
              <button
                onClick={onCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">Turnos Fijos</h3>
              <p className="text-sm text-blue-700">
                Los turnos fijos se crean automáticamente cada semana para el día y hora especificados.
                El jugador puede liberar días específicos cuando no quiera el turno.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Jugador */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Jugador *
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    {selectedPlayer ? (
                      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-300 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800">{selectedPlayer.name}</p>
                          <p className="text-sm text-gray-600">{selectedPlayer.email}</p>
                          <p className="text-sm text-gray-500">{selectedPlayer.phone}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, playerId: '' }))}
                          className="text-red-500 hover:text-red-700 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowPlayerSearch(true)}
                        className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center"
                      >
                        <Search className="w-4 h-4 mr-2" />
                        Seleccionar jugador
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Cancha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cancha *
                </label>
                <select
                  value={formData.courtId}
                  onChange={(e) => setFormData(prev => ({ ...prev, courtId: e.target.value }))}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                >
                  <option value="">Seleccionar cancha</option>
                  {courts.map(court => (
                    <option key={court.id} value={court.id}>
                      {court.name} - {formatCurrency(court.pricePerTurn)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Día de la semana */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Día de la Semana *
                </label>
                <select
                  value={formData.dayOfWeek}
                  onChange={(e) => setFormData(prev => ({ ...prev, dayOfWeek: parseInt(e.target.value) }))}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                >
                  {daysOfWeek.map(day => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Horarios */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hora Inicio *
                  </label>
                  <select
                    value={formData.startTime}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, startTime: e.target.value }));
                      updateEndTime(e.target.value);
                    }}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  >
                    <option value="">Seleccionar hora</option>
                    {timeOptions.map(time => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hora Fin *
                  </label>
                  <input
                    type="text"
                    value={formData.endTime}
                    readOnly
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                    placeholder="Se calcula automáticamente"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Se calcula automáticamente (1.5 horas después del inicio)
                  </p>
                </div>
              </div>

              {/* Estado */}
              <div>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Turno fijo activo
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Los turnos inactivos no generan reservas automáticas
                </p>
              </div>

              {/* Resumen */}
              {selectedPlayer && selectedCourt && formData.startTime && formData.endTime && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-medium text-green-900 mb-2">Resumen del Turno Fijo</h3>
                  <div className="text-sm text-green-700 space-y-1">
                    <p><strong>Jugador:</strong> {selectedPlayer.name}</p>
                    <p><strong>Cancha:</strong> {selectedCourt.name}</p>
                    <p><strong>Día:</strong> {daysOfWeek.find(d => d.value === formData.dayOfWeek)?.label}</p>
                    <p><strong>Horario:</strong> {formData.startTime} - {formData.endTime}</p>
                    <p><strong>Precio:</strong> {formatCurrency(selectedCourt.pricePerTurn)} por turno</p>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <Save className="w-5 h-5" />
                  <span>{recurringBooking ? 'Actualizar' : 'Crear'} Turno Fijo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Player Search Popup */}
      {showPlayerSearch && (
        <PlayerSearchPopup
          players={players}
          selectedPlayers={[]}
          maxPlayers={1}
          onPlayerSelect={handlePlayerSelect}
          onPlayerDeselect={() => {}}
          onClose={() => setShowPlayerSearch(false)}
          onCreateNew={() => setShowPlayerSearch(false)}
        />
      )}
    </>
  );
};

export default RecurringBookingForm;