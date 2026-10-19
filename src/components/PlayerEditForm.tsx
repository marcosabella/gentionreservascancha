import React, { useContext, useState } from 'react';
import { AccessContext } from '../config/AccessContext';
import { hasPermission } from '../config/permissions';
import { Save, X, User } from 'lucide-react';
import { PlayerProfile } from '../types';

interface PlayerEditFormProps {
  player?: PlayerProfile;
  onSave: (player: Omit<PlayerProfile, 'id' | 'createdAt' | 'totalBookings' | 'lastBooking'> & { id?: string }) => void;
  onCancel: () => void;
}

const PlayerEditForm: React.FC<PlayerEditFormProps> = ({ player, onSave, onCancel }) => {
  const user = useContext(AccessContext);
  const canAuthorizeCredit = hasPermission(user, 'players.credit');
  const [formData, setFormData] = useState({
    name: player?.name || '',
    email: player?.email || '',
    phone: player?.phone || '',
    gender: player?.gender || '',
    category: player?.category || '',
    currentAccountEnabled: player?.currentAccountEnabled ?? false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const playerData: Parameters<PlayerEditFormProps['onSave']>[0] = {
      ...formData,
      gender: formData.gender === 'masculino' || formData.gender === 'femenino' ? formData.gender : undefined,
      category: formData.category ? Number(formData.category) : undefined,
      id: player?.id
    };
    
    onSave(playerData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'category' ? (value ? parseInt(value) : '') : value
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90dvh] overflow-y-auto">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <User className="w-6 h-6 mr-2" />
              {player ? 'Editar Jugador' : 'Nuevo Jugador'}
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre Completo
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="Ej: Juan Pérez"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="+54 9 11 1234-5678"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="juan.perez@email.com"
              />
            </div>
            </div>
            <div className="flex flex-wrap items-end gap-4 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Género
              </label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
              >
                <option value="">Seleccionar género</option>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
              </select>
            </div>
            <div className="w-fit shrink-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-auto min-w-[5rem] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2">
              <label className="flex min-h-[26px] items-center gap-3 text-sm font-medium text-gray-800">
                <input type="checkbox" checked={formData.currentAccountEnabled} disabled={!canAuthorizeCredit}
                  onChange={e => setFormData(prev => ({ ...prev, currentAccountEnabled: e.target.checked }))}
                  className="h-4 w-4 rounded text-green-600" />
                Habilitar cuenta corriente
              </label>
            </div>
            </div>
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
                <span>{player ? 'Guardar' : 'Crear'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PlayerEditForm;
