import React, { useState } from 'react';
import { Search, X, User, Plus, Check } from 'lucide-react';
import { PlayerProfile, Player } from '../types';

interface PlayerSearchPopupProps {
  players: PlayerProfile[];
  selectedPlayers: Player[];
  maxPlayers?: number;
  onPlayerSelect: (player: PlayerProfile) => void;
  onPlayerDeselect: (playerId: string) => void;
  onClose: () => void;
  onCreateNew: () => void;
}

const PlayerSearchPopup: React.FC<PlayerSearchPopupProps> = ({
  players,
  selectedPlayers,
  maxPlayers,
  onPlayerSelect,
  onPlayerDeselect,
  onClose,
  onCreateNew
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPlayers = players.filter(player =>
    player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.phone.includes(searchTerm)
  );

  const isPlayerSelected = (playerId: string) => {
    return selectedPlayers.some(p => p.id === playerId);
  };

  const canSelectMore = maxPlayers === undefined || selectedPlayers.length < maxPlayers;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Seleccionar Jugadores</h2>
              <p className="text-gray-600">
                {maxPlayers === undefined
                  ? `${selectedPlayers.length} jugadores seleccionados`
                  : `${selectedPlayers.length}/${maxPlayers} jugadores seleccionados`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar jugadores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
            />
          </div>

          {/* Create New Button */}
          <button
            onClick={onCreateNew}
            className="w-full mb-4 flex items-center justify-center space-x-2 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Crear Nuevo Jugador</span>
          </button>

          {/* Players List */}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredPlayers.map(player => {
              const isSelected = isPlayerSelected(player.id);
              
              return (
                <div
                  key={player.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    if (isSelected) {
                      onPlayerDeselect(player.id);
                    } else if (canSelectMore) {
                      onPlayerSelect(player);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isSelected ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                        <User className={`w-5 h-5 ${isSelected ? 'text-green-600' : 'text-gray-600'}`} />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{player.name}</h3>
                        <p className="text-sm text-gray-600">{player.email}</p>
                        <p className="text-sm text-gray-500">{player.phone}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <div className="text-right text-sm text-gray-500">
                        <p>{player.totalBookings} reservas</p>
                        {player.lastBooking && (
                          <p>Última: {new Date(player.lastBooking).toLocaleDateString()}</p>
                        )}
                      </div>
                      
                      {isSelected && (
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredPlayers.length === 0 && (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No se encontraron jugadores
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm ? 'Intenta con otros términos de búsqueda' : 'No hay jugadores registrados'}
              </p>
              <button
                onClick={onCreateNew}
                className="inline-flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Nuevo Jugador</span>
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-gray-600">
              {!canSelectMore && 'Máximo de jugadores alcanzado'}
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerSearchPopup;
