import React, { useState } from 'react';
import { Users, CreditCard as Edit, Trash2, Plus, Search, Mail, Phone, Calendar } from 'lucide-react';
import { PlayerProfile } from '../types';
import { formatDate } from '../utils/timeSlots';

interface PlayerListProps {
  players: PlayerProfile[];
  onEditPlayer: (player: PlayerProfile) => void;
  onDeletePlayer: (playerId: string) => void;
  onAddPlayer: () => void;
}

const PlayerList: React.FC<PlayerListProps> = ({ 
  players, 
  onEditPlayer, 
  onDeletePlayer, 
  onAddPlayer 
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPlayers = players.filter(player =>
    player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Jugadores</h2>
          <p className="text-gray-600">Administra la base de datos de jugadores</p>
        </div>
        <button
          onClick={onAddPlayer}
          className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nuevo Jugador</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar por nombre, email o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Jugadores</p>
              <p className="text-xl font-bold text-gray-900">{players.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Jugadores Activos</p>
              <p className="text-xl font-bold text-gray-900">
                {players.filter(p => p.totalBookings > 0).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Promedio Reservas</p>
              <p className="text-xl font-bold text-gray-900">
                {players.length > 0 ? Math.round(players.reduce((sum, p) => sum + p.totalBookings, 0) / players.length) : 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Players Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jugador
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contacto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Género / Categoría
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estadísticas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPlayers.map(player => (
                <tr key={player.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{player.name}</div>
                        <div className="text-sm text-gray-500">
                          Registrado: {formatDate(player.createdAt.split('T')[0])}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      <div className="flex items-center text-sm text-gray-900">
                        <Mail className="w-4 h-4 mr-2 text-gray-400" />
                        {player.email || 'Sin email'}
                      </div>
                      <div className="flex items-center text-sm text-gray-500">
                        <Phone className="w-4 h-4 mr-2 text-gray-400" />
                        {player.phone || 'Sin teléfono'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      <div className="text-sm text-gray-900">
                        {player.gender ? (player.gender === 'masculino' ? '👨 Masculino' : '👩 Femenino') : 'Sin género'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {player.category ? player.category : 'Sin categoría'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      <div className="text-sm text-gray-900">
                        <strong>{player.totalBookings}</strong> reservas
                      </div>
                      {player.lastBooking && (
                        <div className="text-sm text-gray-500">
                          Última: {formatDate(player.lastBooking)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => onEditPlayer(player)}
                      className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar
                    </button>
                    <button
                      onClick={() => onDeletePlayer(player.id)}
                      className="inline-flex items-center px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredPlayers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron jugadores' : 'No hay jugadores registrados'}
            </h3>
            <p className="text-gray-600">
              {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Comienza agregando tu primer jugador'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerList;