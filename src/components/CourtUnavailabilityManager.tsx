import React, { useState } from 'react';
import { CalendarOff, Clock, Edit, Plus, Save, Trash2, X } from 'lucide-react';
import { Court, CourtUnavailability } from '../types';
import { getArgentinaDateString } from '../utils/date';
import { getReasonLabel, timeToMinutes } from '../utils/availability';

interface CourtUnavailabilityManagerProps {
  courts: Court[];
  unavailabilities: CourtUnavailability[];
  onSave: (unavailability: Omit<CourtUnavailability, 'id' | 'createdAt'>, id?: string) => void;
  onDelete: (id: string) => void;
}

const daysOfWeek = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
  { value: 0, label: 'Domingo' }
];

const reasonOptions: Array<{ value: CourtUnavailability['reason']; label: string }> = [
  { value: 'class', label: 'Clase' },
  { value: 'closed', label: 'Cerrado' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'other', label: 'Otro' }
];

const CourtUnavailabilityManager: React.FC<CourtUnavailabilityManagerProps> = ({
  courts,
  unavailabilities,
  onSave,
  onDelete
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CourtUnavailability | null>(null);
  const [formData, setFormData] = useState({
    courtId: '',
    title: '',
    reason: 'class' as CourtUnavailability['reason'],
    date: getArgentinaDateString(),
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '09:30',
    isRecurring: false,
    isActive: true,
    notes: ''
  });

  const openForm = (item?: CourtUnavailability) => {
    if (item) {
      setEditing(item);
      setFormData({
        courtId: item.courtId,
        title: item.title,
        reason: item.reason,
        date: item.date || getArgentinaDateString(),
        dayOfWeek: item.dayOfWeek ?? 1,
        startTime: item.startTime,
        endTime: item.endTime,
        isRecurring: item.isRecurring,
        isActive: item.isActive,
        notes: item.notes || ''
      });
    } else {
      setEditing(null);
      setFormData(prev => ({
        ...prev,
        courtId: courts[0]?.id || '',
        title: '',
        notes: ''
      }));
    }

    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const court = courts.find(item => item.id === formData.courtId);
    if (!court) {
      alert('Selecciona una cancha valida');
      return;
    }

    if (timeToMinutes(formData.startTime) >= timeToMinutes(formData.endTime)) {
      alert('La hora de inicio debe ser anterior a la hora de fin');
      return;
    }

    if (!formData.isRecurring && !formData.date) {
      alert('Selecciona una fecha');
      return;
    }

    onSave({
      courtId: court.id,
      courtName: court.name,
      title: formData.title.trim(),
      reason: formData.reason,
      date: formData.isRecurring ? undefined : formData.date,
      dayOfWeek: formData.isRecurring ? formData.dayOfWeek : undefined,
      startTime: formData.startTime,
      endTime: formData.endTime,
      isRecurring: formData.isRecurring,
      isActive: formData.isActive,
      notes: formData.notes.trim() || undefined
    }, editing?.id);

    closeForm();
  };

  const sortedUnavailabilities = [...unavailabilities].sort((a, b) => {
    const aKey = a.isRecurring ? `9-${a.dayOfWeek}-${a.startTime}` : `0-${a.date}-${a.startTime}`;
    const bKey = b.isRecurring ? `9-${b.dayOfWeek}-${b.startTime}` : `0-${b.date}-${b.startTime}`;
    return aKey.localeCompare(bKey);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Disponibilidad de Canchas</h2>
          <p className="text-gray-600">Bloquea horarios por clases, cierres o mantenimiento</p>
        </div>
        <button
          onClick={() => openForm()}
          className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nuevo Bloqueo</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Evento</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cancha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cuando</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horario</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedUnavailabilities.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                        <CalendarOff className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.title}</div>
                        <div className="text-xs text-gray-500">{getReasonLabel(item.reason)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{item.courtName}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {item.isRecurring
                      ? `Todos los ${daysOfWeek.find(day => day.value === item.dayOfWeek)?.label || ''}`
                      : item.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm text-gray-900">
                      <Clock className="w-4 h-4 mr-2 text-gray-400" />
                      {item.startTime} - {item.endTime}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      item.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {item.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => openForm(item)}
                      className="inline-flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      title="Editar bloqueo"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="inline-flex items-center px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      title="Eliminar bloqueo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {unavailabilities.length === 0 && (
          <div className="text-center py-12">
            <CalendarOff className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay bloqueos cargados</h3>
            <p className="text-gray-600">Agrega clases, cierres o mantenimientos para bloquear horarios</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">
                  {editing ? 'Editar Bloqueo' : 'Nuevo Bloqueo'}
                </h3>
                <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Titulo *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={event => setFormData(prev => ({ ...prev, title: event.target.value }))}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Clase escuela, cancha cerrada, mantenimiento"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cancha *</label>
                    <select
                      value={formData.courtId}
                      onChange={event => setFormData(prev => ({ ...prev, courtId: event.target.value }))}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="">Seleccionar cancha</option>
                      {courts.map(court => (
                        <option key={court.id} value={court.id}>{court.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Motivo *</label>
                    <select
                      value={formData.reason}
                      onChange={event => setFormData(prev => ({
                        ...prev,
                        reason: event.target.value as CourtUnavailability['reason']
                      }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                      {reasonOptions.map(reason => (
                        <option key={reason.value} value={reason.value}>{reason.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.isRecurring}
                    onChange={event => setFormData(prev => ({ ...prev, isRecurring: event.target.checked }))}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Repetir todas las semanas</span>
                </label>

                {formData.isRecurring ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Dia de la semana *</label>
                    <select
                      value={formData.dayOfWeek}
                      onChange={event => setFormData(prev => ({ ...prev, dayOfWeek: parseInt(event.target.value, 10) }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                      {daysOfWeek.map(day => (
                        <option key={day.value} value={day.value}>{day.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha *</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={event => setFormData(prev => ({ ...prev, date: event.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      required
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Hora inicio *</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={event => setFormData(prev => ({ ...prev, startTime: event.target.value }))}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Hora fin *</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={event => setFormData(prev => ({ ...prev, endTime: event.target.value }))}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </div>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={event => setFormData(prev => ({ ...prev, isActive: event.target.checked }))}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Bloqueo activo</span>
                </label>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notas</label>
                  <textarea
                    value={formData.notes}
                    onChange={event => setFormData(prev => ({ ...prev, notes: event.target.value }))}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>

                <div className="flex space-x-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={closeForm}
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
      )}
    </div>
  );
};

export default CourtUnavailabilityManager;
