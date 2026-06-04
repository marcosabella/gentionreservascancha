import React, { useState } from 'react';
import { Save, X, Calendar, CalendarX, Plus, Trash2 } from 'lucide-react';
import { RecurringBooking } from '../types';
import { formatDate } from '../utils/timeSlots';
import { dateOnlyToLocalDate, getArgentinaDateString, localDateToDateOnly } from '../utils/date';

interface SkipDatesManagerProps {
  recurringBooking: RecurringBooking;
  onSave: (skipDates: string[]) => void;
  onCancel: () => void;
}

const SkipDatesManager: React.FC<SkipDatesManagerProps> = ({ 
  recurringBooking, 
  onSave, 
  onCancel 
}) => {
  const [skipDates, setSkipDates] = useState<string[]>([...recurringBooking.skipDates]);
  const [newDate, setNewDate] = useState('');

  const getDayName = (dayOfWeek: number) => {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayOfWeek];
  };

  const addSkipDate = () => {
    if (!newDate) return;
    
    // Verificar que la fecha corresponda al día de la semana del turno fijo
    const date = dateOnlyToLocalDate(newDate);
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek !== recurringBooking.dayOfWeek) {
      alert(`La fecha seleccionada debe ser un ${getDayName(recurringBooking.dayOfWeek).toLowerCase()}`);
      return;
    }
    
    if (skipDates.includes(newDate)) {
      alert('Esta fecha ya está en la lista de excepciones');
      return;
    }
    
    setSkipDates(prev => [...prev, newDate].sort());
    setNewDate('');
  };

  const removeSkipDate = (dateToRemove: string) => {
    setSkipDates(prev => prev.filter(date => date !== dateToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(skipDates);
  };

  // Generar fechas sugeridas (próximos 8 turnos del día correspondiente)
  const getSuggestedDates = () => {
    const suggestions = [];
    let currentDate = dateOnlyToLocalDate(getArgentinaDateString());
    
    // Encontrar el próximo día que corresponde al turno fijo
    while (currentDate.getDay() !== recurringBooking.dayOfWeek) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Generar 8 fechas sugeridas
    for (let i = 0; i < 8; i++) {
      const dateString = localDateToDateOnly(currentDate);
      if (!skipDates.includes(dateString)) {
        suggestions.push({
          date: dateString,
          formatted: formatDate(dateString)
        });
      }
      currentDate.setDate(currentDate.getDate() + 7); // Siguiente semana
    }
    
    return suggestions.slice(0, 4); // Mostrar solo 4 sugerencias
  };

  const suggestedDates = getSuggestedDates();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Gestionar Excepciones</h2>
              <p className="text-gray-600">
                {recurringBooking.playerName} - {recurringBooking.courtName}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Turno Info */}
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">Información del Turno Fijo</h3>
            <div className="grid grid-cols-2 gap-4 text-sm text-blue-700">
              <div>
                <p><strong>Día:</strong> {getDayName(recurringBooking.dayOfWeek)}</p>
                <p><strong>Horario:</strong> {recurringBooking.startTime} - {recurringBooking.endTime}</p>
              </div>
              <div>
                <p><strong>Cancha:</strong> {recurringBooking.courtName}</p>
                <p><strong>Estado:</strong> {recurringBooking.isActive ? 'Activo' : 'Inactivo'}</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Add New Skip Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Agregar Fecha a Liberar
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={getArgentinaDateString()}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={addSkipDate}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Solo se pueden seleccionar fechas que correspondan a {getDayName(recurringBooking.dayOfWeek).toLowerCase()}
              </p>
            </div>

            {/* Quick Add Suggestions */}
            {suggestedDates.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fechas Sugeridas (Próximos {getDayName(recurringBooking.dayOfWeek)})
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {suggestedDates.map(suggestion => (
                    <button
                      key={suggestion.date}
                      type="button"
                      onClick={() => {
                        setSkipDates(prev => [...prev, suggestion.date].sort());
                      }}
                      className="p-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-left"
                    >
                      {suggestion.formatted}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Current Skip Dates */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fechas Liberadas ({skipDates.length})
              </label>
              {skipDates.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                  <CalendarX className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No hay fechas liberadas</p>
                  <p className="text-sm">El turno se creará todas las semanas</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {skipDates.map(date => (
                    <div key={date} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <div>
                          <p className="font-medium text-gray-900">{formatDate(date)}</p>
                          <p className="text-sm text-gray-500">Turno liberado</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSkipDate(date)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Buttons */}
            <div className="flex space-x-3 pt-4">
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
                <span>Guardar Excepciones</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SkipDatesManager;
