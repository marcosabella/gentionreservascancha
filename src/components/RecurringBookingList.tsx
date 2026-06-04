import React, { useState } from 'react';
import { Calendar, Clock, User, MapPin, Edit, Trash2, Plus, ToggleLeft, ToggleRight, CalendarX, Eye } from 'lucide-react';
import { RecurringBooking, PlayerProfile, Court } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';

interface RecurringBookingListProps {
  recurringBookings: RecurringBooking[];
  players: PlayerProfile[];
  courts: Court[];
  onAddRecurring: () => void;
  onEditRecurring: (recurringBooking: RecurringBooking) => void;
  onDeleteRecurring: (recurringBookingId: string) => void;
  onToggleActive: (recurringBookingId: string) => void;
  onManageSkipDates: (recurringBooking: RecurringBooking) => void;
}

const RecurringBookingList: React.FC<RecurringBookingListProps> = ({ 
  recurringBookings, 
  players, 
  courts, 
  onAddRecurring, 
  onEditRecurring, 
  onDeleteRecurring, 
  onToggleActive,
  onManageSkipDates
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const getDayName = (dayOfWeek: number) => {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayOfWeek];
  };

  const filteredRecurringBookings = recurringBookings.filter(recurring => {
    const matchesSearch = recurring.playerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         recurring.courtName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesActive = filterActive === 'all' || 
                         (filterActive === 'active' && recurring.isActive) ||
                         (filterActive === 'inactive' && !recurring.isActive);
    
    return matchesSearch && matchesActive;
  });

  const activeCount = recurringBookings.filter(r => r.isActive).length;
  const inactiveCount = recurringBookings.filter(r => !r.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Turnos Fijos</h2>
          <p className="text-gray-600">Gestiona reservas recurrentes semanales</p>
        </div>
        <button
          onClick={onAddRecurring}
          className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nuevo Turno Fijo</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Turnos Activos</p>
              <p className="text-xl font-bold text-gray-900">{activeCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <CalendarX className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Turnos Inactivos</p>
              <p className="text-xl font-bold text-gray-900">{inactiveCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Turnos</p>
              <p className="text-xl font-bold text-gray-900">{recurringBookings.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por jugador o cancha..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          />
        </div>

        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as any)}
          className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
        >
          <option value="all">Todos los turnos</option>
          <option value="active">Solo activos</option>
          <option value="inactive">Solo inactivos</option>
        </select>
      </div>

      {/* Recurring Bookings Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jugador
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cancha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Día y Horario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Excepciones
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRecurringBookings.map(recurring => (
                <tr key={recurring.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{recurring.playerName}</div>
                        <div className="text-sm text-gray-500">Turno fijo</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{recurring.courtName}</div>
                        <div className="text-sm text-gray-500">
                          {formatCurrency(courts.find(c => c.id === recurring.courtId)?.pricePerTurn || 0)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {getDayName(recurring.dayOfWeek)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {recurring.startTime} - {recurring.endTime}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => onToggleActive(recurring.id)}
                      className="flex items-center space-x-2 hover:bg-gray-100 p-1 rounded transition-colors"
                    >
                      {recurring.isActive ? (
                        <>
                          <ToggleRight className="w-6 h-6 text-green-600" />
                          <span className="text-sm font-medium text-green-700">Activo</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-6 h-6 text-gray-400" />
                          <span className="text-sm font-medium text-gray-500">Inactivo</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {recurring.skipDates.length} día{recurring.skipDates.length !== 1 ? 's' : ''}
                    </div>
                    <div className="text-sm text-gray-500">
                      {recurring.skipDates.length > 0 ? 'liberados' : 'sin excepciones'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-1">
                      <button
                        onClick={() => onManageSkipDates(recurring)}
                        className="inline-flex items-center px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                        title="Gestionar excepciones"
                      >
                        <CalendarX className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onEditRecurring(recurring)}
                        className="inline-flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        title="Editar turno fijo"
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onDeleteRecurring(recurring.id)}
                        className="inline-flex items-center px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                        title="Eliminar turno fijo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRecurringBookings.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterActive !== 'all' ? 'No se encontraron turnos fijos' : 'No hay turnos fijos registrados'}
            </h3>
            <p className="text-gray-600">
              {searchTerm || filterActive !== 'all' ? 'Intenta con otros filtros' : 'Comienza creando el primer turno fijo'}
            </p>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">¿Cómo funcionan los Turnos Fijos?</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><strong>Creación automática:</strong> Se generan reservas cada semana</p>
            <p><strong>Excepciones:</strong> El jugador puede liberar días específicos</p>
            <p><strong>Activación/Desactivación:</strong> Control total del turno fijo</p>
          </div>
          <div>
            <p><strong>Duración:</strong> Siempre 1.5 horas por turno</p>
            <p><strong>Prioridad:</strong> Los turnos fijos tienen prioridad sobre reservas normales</p>
            <p><strong>Gestión:</strong> Editar, pausar o eliminar en cualquier momento</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecurringBookingList;