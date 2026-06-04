import React, { useState } from 'react';
import { Users, Plus, Edit, Trash2, Key, UserCheck, UserX, Search, Shield, User, X } from 'lucide-react';
import { AppUser, PlayerProfile, AuthUser } from '../types';
import { formatDateTimeArgentina } from '../utils/timeSlots';

interface UserManagementProps {
  users: AppUser[];
  players: PlayerProfile[];
  currentUser: AuthUser;
  onCreateUser: (username: string, password: string, role: 'admin' | 'player', playerId?: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateUserRole: (userId: string, role: 'admin' | 'player', playerId?: string) => Promise<{ success: boolean; error?: string }>;
  onToggleUserStatus: (userId: string, isActive: boolean) => void;
  onDeleteUser: (userId: string) => void;
  onResetPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const UserManagement: React.FC<UserManagementProps> = ({
  users,
  players,
  currentUser,
  onCreateUser,
  onUpdateUserRole,
  onToggleUserStatus,
  onDeleteUser,
  onResetPassword
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showRoleEdit, setShowRoleEdit] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'player' as 'admin' | 'player',
    playerId: ''
  });
  const [roleFormData, setRoleFormData] = useState({
    role: 'player' as 'admin' | 'player',
    playerId: ''
  });
  const [resetPassword, setResetPassword] = useState('');

  const filteredUsers = users.filter(user => {
    const player = players.find(p => p.id === user.playerId);
    const searchText = searchTerm.toLowerCase();
    
    return (
      user.username.toLowerCase().includes(searchText) ||
      (player?.name.toLowerCase().includes(searchText)) ||
      (player?.email.toLowerCase().includes(searchText)) ||
      user.role.toLowerCase().includes(searchText)
    );
  });

  const availablePlayers = players.filter(player => 
    !users.some(user => user.playerId === player.id)
  );

  const availablePlayersForSelectedUser = players.filter(player =>
    !selectedUser
      ? false
      : player.id === selectedUser.playerId ||
        !users.some(user => user.playerId === player.id && user.id !== selectedUser.id)
  );

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password) {
      alert('Nombre de usuario y contraseña son obligatorios');
      return;
    }

    if (formData.role === 'player' && !formData.playerId) {
      alert('Debe seleccionar un jugador para el rol de jugador');
      return;
    }

    const result = await onCreateUser(
      formData.username,
      formData.password,
      formData.role,
      formData.role === 'player' ? formData.playerId : undefined
    );

    if (result.success) {
      setShowCreateForm(false);
      setFormData({
        username: '',
        password: '',
        role: 'player',
        playerId: ''
      });
      alert('Usuario creado exitosamente');
    } else {
      alert(result.error || 'Error al crear usuario');
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetPassword || resetPassword.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (selectedUser) {
      const result = await onResetPassword(selectedUser.id, resetPassword);

      if (!result.success) {
        alert(result.error || 'Error al actualizar la contrasena');
        return;
      }
      setShowPasswordReset(false);
      setSelectedUser(null);
      setResetPassword('');
      alert('Contraseña actualizada exitosamente');
    }
  };

  const handleOpenRoleEdit = (user: AppUser) => {
    setSelectedUser(user);
    setRoleFormData({
      role: user.role,
      playerId: user.playerId || ''
    });
    setShowRoleEdit(true);
  };

  const handleRoleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) return;

    if (selectedUser.id === currentUser.id) {
      alert('No puedes cambiar el rol de tu propio usuario');
      return;
    }

    if (roleFormData.role === 'player' && !roleFormData.playerId) {
      alert('Debe seleccionar un jugador para el rol de jugador');
      return;
    }

    const result = await onUpdateUserRole(
      selectedUser.id,
      roleFormData.role,
      roleFormData.role === 'player' ? roleFormData.playerId : undefined
    );

    if (result.success) {
      setShowRoleEdit(false);
      setSelectedUser(null);
      setRoleFormData({
        role: 'player',
        playerId: ''
      });
      alert('Rol actualizado exitosamente');
    } else {
      alert(result.error || 'Error al actualizar el rol');
    }
  };

  const handleDeleteUser = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    if (user.id === currentUser.id) {
      alert('No puedes eliminar tu propio usuario');
      return;
    }

    if (confirm(`¿Estás seguro de que quieres eliminar el usuario "${user.username}"?\n\nEsta acción no se puede deshacer.`)) {
      onDeleteUser(userId);
      alert('Usuario eliminado exitosamente');
    }
  };

  const handleToggleStatus = (userId: string, currentStatus: boolean) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    if (user.id === currentUser.id) {
      alert('No puedes cambiar el estado de tu propio usuario');
      return;
    }

    const action = currentStatus ? 'desactivar' : 'activar';
    if (confirm(`¿Estás seguro de que quieres ${action} el usuario "${user.username}"?`)) {
      onToggleUserStatus(userId, !currentStatus);
    }
  };

  const getRoleLabel = (role: string) => {
    return role === 'admin' ? 'Administrador' : 'Jugador';
  };

  const getRoleColor = (role: string) => {
    return role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getPlayerName = (playerId?: string) => {
    if (!playerId) return null;
    const player = players.find(p => p.id === playerId);
    return player?.name;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h2>
          <p className="text-gray-600">Administra cuentas de usuario y permisos de la aplicación</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Crear Usuario</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Administradores</p>
              <p className="text-xl font-bold text-gray-900">
                {users.filter(u => u.role === 'admin').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Jugadores</p>
              <p className="text-xl font-bold text-gray-900">
                {users.filter(u => u.role === 'player').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Activos</p>
              <p className="text-xl font-bold text-gray-900">
                {users.filter(u => u.isActive).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Sin Usuario</p>
              <p className="text-xl font-bold text-gray-900">{availablePlayers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar usuarios..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
        />
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rol
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Último Acceso
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map(user => {
                const playerData = players.find(p => p.id === user.playerId);
                const isCurrentUser = user.id === currentUser.id;
                const lastLogin = user.lastLogin ? formatDateTimeArgentina(user.lastLogin) : null;
                
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          user.role === 'admin' ? 'bg-purple-100' : 'bg-blue-100'
                        }`}>
                          {user.role === 'admin' ? (
                            <Shield className="w-5 h-5 text-purple-600" />
                          ) : (
                            <User className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.username}
                            {isCurrentUser && (
                              <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                Tú
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {playerData?.name || 'Sin jugador vinculado'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(user.isActive)}`}>
                        {user.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {lastLogin ? (
                        <div>
                          <div>{lastLogin.date}</div>
                          <div className="text-xs text-gray-400">
                            {lastLogin.time}
                          </div>
                        </div>
                      ) : (
                        'Nunca'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleOpenRoleEdit(user)}
                          className="inline-flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          title="Cambiar rol"
                          disabled={isCurrentUser}
                        >
                          <Edit className="w-3 h-3" />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowPasswordReset(true);
                          }}
                          className="inline-flex items-center px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                          title="Cambiar contraseña"
                        >
                          <Key className="w-3 h-3" />
                        </button>
                        
                        {!isCurrentUser && (
                          <>
                            <button
                              onClick={() => handleToggleStatus(user.id, user.isActive)}
                              className={`inline-flex items-center px-2 py-1 rounded transition-colors ${
                                user.isActive
                                  ? 'bg-red-600 text-white hover:bg-red-700'
                                  : 'bg-green-600 text-white hover:bg-green-700'
                              }`}
                              title={user.isActive ? 'Desactivar usuario' : 'Activar usuario'}
                            >
                              {user.isActive ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                            </button>
                            
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="inline-flex items-center px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}
            </h3>
            <p className="text-gray-600">
              {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Comienza creando el primer usuario'}
            </p>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Crear Usuario</h3>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre de Usuario
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="usuario123"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rol
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      role: e.target.value as 'admin' | 'player',
                      playerId: e.target.value === 'admin' ? '' : prev.playerId
                    }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  >
                    <option value="player">Jugador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                {formData.role === 'player' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Vincular con Jugador
                    </label>
                    <select
                      value={formData.playerId}
                      onChange={(e) => setFormData(prev => ({ ...prev, playerId: e.target.value }))}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    >
                      <option value="">Seleccionar jugador</option>
                      {availablePlayers.map(player => (
                        <option key={player.id} value={player.id}>
                          {player.name} - {player.email}
                        </option>
                      ))}
                    </select>
                    {availablePlayers.length === 0 && (
                      <p className="text-xs text-orange-600 mt-1">
                        Todos los jugadores ya tienen usuario asignado
                      </p>
                    )}
                  </div>
                )}

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                  >
                    Crear Usuario
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {showRoleEdit && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Cambiar Rol</h3>
                <button
                  onClick={() => {
                    setShowRoleEdit(false);
                    setSelectedUser(null);
                    setRoleFormData({
                      role: 'player',
                      playerId: ''
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Cambiar rol para: <strong>{selectedUser.username}</strong>
                </p>
              </div>

              <form onSubmit={handleRoleUpdate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rol
                  </label>
                  <select
                    value={roleFormData.role}
                    onChange={(e) => setRoleFormData(prev => ({
                      ...prev,
                      role: e.target.value as 'admin' | 'player',
                      playerId: e.target.value === 'admin' ? '' : prev.playerId
                    }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  >
                    <option value="player">Jugador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                {roleFormData.role === 'player' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Vincular con Jugador
                    </label>
                    <select
                      value={roleFormData.playerId}
                      onChange={(e) => setRoleFormData(prev => ({ ...prev, playerId: e.target.value }))}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    >
                      <option value="">Seleccionar jugador</option>
                      {availablePlayersForSelectedUser.map(player => (
                        <option key={player.id} value={player.id}>
                          {player.name} - {player.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRoleEdit(false);
                      setSelectedUser(null);
                      setRoleFormData({
                        role: 'player',
                        playerId: ''
                      });
                    }}
                    className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    Guardar Rol
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordReset && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Cambiar Contraseña</h3>
                <button
                  onClick={() => {
                    setShowPasswordReset(false);
                    setSelectedUser(null);
                    setResetPassword('');
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Cambiar contraseña para: <strong>{selectedUser.username}</strong>
                </p>
              </div>

              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nueva Contraseña
                  </label>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordReset(false);
                      setSelectedUser(null);
                      setResetPassword('');
                    }}
                    className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors"
                  >
                    Cambiar Contraseña
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="bg-blue-50 p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Sistema de Usuarios de Aplicación</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <p><strong>Administradores:</strong> Acceso completo al sistema</p>
            <p><strong>Jugadores:</strong> Acceso limitado a sus reservas y cuenta</p>
            <p><strong>Almacenamiento:</strong> Gestionado desde Supabase</p>
          </div>
          <div>
            <p><strong>Usuarios activos:</strong> {users.filter(u => u.isActive).length}</p>
            <p><strong>Total usuarios:</strong> {users.length}</p>
            <p><strong>Jugadores sin usuario:</strong> {availablePlayers.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
