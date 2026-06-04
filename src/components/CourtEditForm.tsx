import React, { useState } from 'react';
import { Save, X, Plus, Trash2 } from 'lucide-react';
import { Court } from '../types';
import { formatCurrency } from '../utils/timeSlots';

interface CourtEditFormProps {
  court?: Court;
  onSave: (court: Omit<Court, 'id'> & { id?: string }) => void;
  onCancel: () => void;
}

const CourtEditForm: React.FC<CourtEditFormProps> = ({ court, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: court?.name || '',
    description: court?.description || '',
    pricePerTurn: court?.pricePerTurn || 0,
    features: court?.features || [''],
    startTime: court?.startTime || '08:00',
    endTime: court?.endTime || '22:00'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const courtData = {
      ...formData,
      features: formData.features.filter(feature => feature.trim() !== ''),
      id: court?.id
    };
    
    onSave(courtData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'pricePerTurn' ? Number(value) : value
    }));
  };

  const handleFeatureChange = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.map((feature, i) => i === index ? value : feature)
    }));
  };

  const addFeature = () => {
    setFormData(prev => ({
      ...prev,
      features: [...prev.features, '']
    }));
  };

  const removeFeature = (index: number) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 6; hour <= 23; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        options.push(timeString);
      }
    }
    // Add 24:00 as end time option
    options.push('24:00');
    return options;
  };

  const timeOptions = generateTimeOptions();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {court ? 'Editar Cancha' : 'Nueva Cancha'}
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Court Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre de la Cancha
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="Ej: Cancha Central"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors resize-none"
                placeholder="Describe las características principales de la cancha"
              />
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Precio por Turno (1.5 horas)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  name="pricePerTurn"
                  value={formData.pricePerTurn}
                  onChange={handleChange}
                  required
                  min="0"
                  step="100"
                  className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="2500"
                />
              </div>
              {formData.pricePerTurn > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  Precio: {formatCurrency(formData.pricePerTurn)} por turno de 1.5 horas
                </p>
              )}
            </div>

            {/* Schedule Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora de Inicio
                </label>
                <select
                  name="startTime"
                  value={formData.startTime}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                >
                  {timeOptions.slice(0, -1).map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora de Fin
                </label>
                <select
                  name="endTime"
                  value={formData.endTime}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                >
                  {timeOptions.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Schedule Preview */}
            {formData.startTime && formData.endTime && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Vista Previa de Horarios</h4>
                <div className="text-sm text-blue-700">
                  <p><strong>Horario:</strong> {formData.startTime} - {formData.endTime}</p>
                  <p><strong>Turnos disponibles:</strong> {(() => {
                    const [startHour, startMinute] = formData.startTime.split(':').map(Number);
                    const [endHour, endMinute] = formData.endTime.split(':').map(Number);
                    const startTimeMinutes = startHour * 60 + startMinute;
                    const endTimeMinutes = endHour * 60 + endMinute;
                    return Math.floor((endTimeMinutes - startTimeMinutes) / 90);
                  })()} turnos de 1.5 horas</p>
                </div>
              </div>
            )}

            {/* Features */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Características
                </label>
                <button
                  type="button"
                  onClick={addFeature}
                  className="flex items-center space-x-1 text-green-600 hover:text-green-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">Agregar</span>
                </button>
              </div>
              
              <div className="space-y-3">
                {formData.features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={feature}
                      onChange={(e) => handleFeatureChange(index, e.target.value)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                      placeholder="Ej: Césped artificial premium"
                    />
                    {formData.features.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeFeature(index)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
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
                <span>{court ? 'Guardar Cambios' : 'Crear Cancha'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CourtEditForm;