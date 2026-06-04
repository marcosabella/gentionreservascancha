import React, { useState } from 'react';
import { Clock, Save, X } from 'lucide-react';

interface ScheduleSettingsProps {
  startTime: string;
  endTime: string;
  onSave: (startTime: string, endTime: string) => void;
  onCancel: () => void;
}

const ScheduleSettings: React.FC<ScheduleSettingsProps> = ({ 
  startTime, 
  endTime, 
  onSave, 
  onCancel 
}) => {
  const [formData, setFormData] = useState({
    startTime,
    endTime
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const [startHour, startMinute] = formData.startTime.split(':').map(Number);
    const [endHour, endMinute] = formData.endTime.split(':').map(Number);
    const startTimeMinutes = startHour * 60 + startMinute;
    const endTimeMinutes = endHour * 60 + endMinute;
    
    if (startTimeMinutes >= endTimeMinutes) {
      alert('La hora de inicio debe ser menor que la hora de fin');
      return;
    }
    
    if (endTimeMinutes - startTimeMinutes < 90) {
      alert('Debe haber al menos 1.5 horas entre inicio y fin para permitir un turno');
      return;
    }
    
    onSave(formData.startTime, formData.endTime);
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 6; hour <= 23; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        options.push(
          <option key={timeString} value={timeString}>
            {timeString}
          </option>
        );
      }
    }
    // Add 24:00 as end time option
    options.push(
      <option key="24:00" value="24:00">
        24:00
      </option>
    );
    return options;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Clock className="w-6 h-6 mr-2" />
              Configurar Horarios
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">Información del Sistema</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Duración de cada turno: <strong>1 hora 30 minutos</strong></li>
                <li>• Los turnos se generan automáticamente cada 1:30hs</li>
                <li>• Horario mínimo requerido: 1:30hs de diferencia</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora de Inicio
                </label>
                <select
                  value={formData.startTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                >
                  {generateTimeOptions()}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora de Fin
                </label>
                <select
                  value={formData.endTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                >
                  {generateTimeOptions()}
                </select>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-gray-50 p-4 rounded-lg max-h-48 overflow-y-auto">
              <h4 className="font-medium text-gray-900 mb-2">Vista Previa de Horarios:</h4>
              <div className="text-sm text-gray-600 grid grid-cols-2 md:grid-cols-3 gap-1">
                {(() => {
                  const slots = [];
                  const [startHour, startMinute] = formData.startTime.split(':').map(Number);
                  const [endHour, endMinute] = formData.endTime.split(':').map(Number);
                  let currentTime = startHour * 60 + startMinute;
                  const endTimeMinutes = endHour * 60 + endMinute;
                  const slotDuration = 90;

                  while (currentTime + slotDuration <= endTimeMinutes) {
                    const startHours = Math.floor(currentTime / 60);
                    const startMinutes = currentTime % 60;
                    const endTimeSlot = currentTime + slotDuration;
                    const endHours = Math.floor(endTimeSlot / 60);
                    const endMinutesSlot = endTimeSlot % 60;
                    
                    const timeSlot = `${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')} - ${endHours.toString().padStart(2, '0')}:${endMinutesSlot.toString().padStart(2, '0')}`;
                    slots.push(timeSlot);
                    currentTime += slotDuration;
                  }

                  return slots.map((slot, index) => (
                    <div key={index} className="text-xs">• {slot}</div>
                  ));
                })()}
              </div>
              <p className="text-xs text-gray-500 mt-3 text-center font-medium">
                Total de turnos disponibles: {(() => {
                  const [startHour, startMinute] = formData.startTime.split(':').map(Number);
                  const [endHour, endMinute] = formData.endTime.split(':').map(Number);
                  const startTimeMinutes = startHour * 60 + startMinute;
                  const endTimeMinutes = endHour * 60 + endMinute;
                  return Math.floor((endTimeMinutes - startTimeMinutes) / 90);
                })()}
              </p>
            </div>

            <div className="flex space-x-3 pt-2">
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
                <span>Guardar</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ScheduleSettings;