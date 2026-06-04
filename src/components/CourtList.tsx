import React from 'react';
import { MapPin, Star, Clock, Zap, Edit, Trash2, Plus, Eye } from 'lucide-react';
import { Court } from '../types';
import { formatCurrency } from '../utils/timeSlots';

interface CourtListProps {
  courts: Court[];
  onEditCourt: (court: Court) => void;
  onDeleteCourt: (courtId: string) => void;
  onAddCourt: () => void;
}

const CourtList: React.FC<CourtListProps> = ({ courts, onEditCourt, onDeleteCourt, onAddCourt }) => {
  const getFeatureIcon = (feature: string) => {
    if (feature.includes('LED') || feature.includes('Iluminación')) return <Zap className="w-4 h-4" />;
    if (feature.includes('Techada') || feature.includes('Aire')) return <Star className="w-4 h-4" />;
    return <Clock className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Canchas</h2>
          <p className="text-gray-600">Administra canchas, precios y características</p>
        </div>
        <button
          onClick={onAddCourt}
          className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nueva Cancha</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Canchas</p>
              <p className="text-xl font-bold text-gray-900">{courts.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Star className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Precio Promedio</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(courts.reduce((sum, c) => sum + c.pricePerTurn, 0) / courts.length || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Precio Máximo</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(Math.max(...courts.map(c => c.pricePerTurn), 0))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Courts Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cancha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Descripción
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Características
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Precio por Turno
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Horarios
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {courts.map(court => (
                <tr key={court.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center">
                        <MapPin className="w-6 h-6 text-white" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{court.name}</div>
                        <div className="text-sm text-gray-500">Cancha de Padel</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs">
                      {court.description}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      {court.features.slice(0, 3).map((feature, index) => (
                        <div key={index} className="flex items-center space-x-2 text-sm text-gray-600">
                          {getFeatureIcon(feature)}
                          <span>{feature}</span>
                        </div>
                      ))}
                      {court.features.length > 3 && (
                        <div className="text-xs text-gray-500">
                          +{court.features.length - 3} más
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(court.pricePerTurn)}
                    </div>
                    <div className="text-xs text-gray-500">por 1.5 horas</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {court.startTime} - {court.endTime}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(() => {
                        const [startHour, startMinute] = court.startTime.split(':').map(Number);
                        const [endHour, endMinute] = court.endTime.split(':').map(Number);
                        const startTimeMinutes = startHour * 60 + startMinute;
                        const endTimeMinutes = endHour * 60 + endMinute;
                        return Math.floor((endTimeMinutes - startTimeMinutes) / 90);
                      })()} turnos disponibles
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => onEditCourt(court)}
                      className="inline-flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      title="Editar cancha"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteCourt(court.id)}
                      className="inline-flex items-center px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      title="Eliminar cancha"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {courts.length === 0 && (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay canchas registradas</h3>
            <p className="text-gray-600">Comienza agregando tu primera cancha</p>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Configuración del Sistema</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><strong>Horario:</strong> Configurable desde Reservas</p>
            <p><strong>Reservas:</strong> Hasta 7 días de anticipación</p>
            <p><strong>Duración por turno:</strong> 1 hora 30 minutos</p>
          </div>
          <div>
            <p><strong>Cancelación:</strong> Hasta 24hs antes</p>
            <p><strong>Total de canchas:</strong> {courts.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourtList;