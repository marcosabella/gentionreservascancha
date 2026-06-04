import React, { useState } from 'react';
import { 
  Menu, 
  X, 
  Calendar, 
  Clock, 
  MapPin, 
  ShoppingCart, 
  Users, 
  CreditCard,
  Home,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings,
  Key,
  Shield,
  Trophy
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  userRole?: 'admin' | 'player';
  userName?: string;
  onSignOut: () => void;
  onChangePassword: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onTabChange, 
  userRole, 
  userName, 
  onSignOut, 
  onChangePassword 
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const adminMenuItems = [
    { id: 'dashboard', label: 'Inicio', icon: Home },
    { id: 'reservas', label: 'Hacer Reserva', icon: Calendar },
    { id: 'turnos-fijos', label: 'Turnos Fijos', icon: Calendar },
    { id: 'disponibilidad', label: 'Disponibilidad', icon: Settings },
    { id: 'torneos', label: 'Torneos', icon: Trophy },
    { id: 'mis-reservas', label: 'Mis Reservas', icon: Clock },
    { id: 'canchas', label: 'Canchas', icon: MapPin },
    { id: 'consumibles', label: 'Consumibles', icon: ShoppingCart },
    { id: 'jugadores', label: 'Jugadores', icon: Users },
    { id: 'ventas', label: 'Ventas', icon: CreditCard },
    { id: 'cuenta-corriente', label: 'Cuenta Corriente', icon: CreditCard },
    { id: 'usuarios', label: 'Usuarios', icon: Shield }
  ];

  const playerMenuItems = [
    { id: 'dashboard', label: 'Inicio', icon: Home },
    { id: 'reservas', label: 'Hacer Reserva', icon: Calendar },
    { id: 'torneos', label: 'Torneo Activo', icon: Trophy },
    { id: 'mis-reservas', label: 'Mis Reservas', icon: Clock },
    { id: 'cuenta-corriente', label: 'Mi Cuenta', icon: CreditCard }
  ];

  const menuItems = userRole === 'admin' ? adminMenuItems : (userRole === 'player' ? playerMenuItems : adminMenuItems);

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  const toggleMobileSidebar = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={toggleMobileSidebar}
        className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 w-full bg-green-600 px-4 text-white shadow-lg flex items-center justify-start"
        aria-label={isMobileOpen ? 'Contraer menu' : 'Expandir menu'}
      >
        {isMobileOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <Menu className="w-6 h-6" />
        )}
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-x-0 top-14 bottom-0 bg-black bg-opacity-50 z-40"
          onClick={toggleMobileSidebar}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-14 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden lg:top-0 lg:h-screen bg-white shadow-xl z-40 transition-all duration-300 ${
          isExpanded ? 'w-64' : 'w-16'
        } ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between p-4 border-b border-gray-200">
          {isExpanded && (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">PADEL CENTER</h1>
                <p className="text-xs text-gray-600">Sistema de reservas</p>
                {userName && (
                  <p className="text-xs text-green-600 font-medium">
                    {userRole === 'admin' ? '👑 Admin' : '🎾 Jugador'}: {userName}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {!isExpanded && (
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center mx-auto">
              <MapPin className="w-5 h-5 text-white" />
            </div>
          )}

          {/* Desktop Toggle Button */}
          <button
            onClick={toggleSidebar}
            className="hidden lg:block p-1 hover:bg-gray-100 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-600" />
            )}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={toggleMobileSidebar}
            className="lg:hidden p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  setIsMobileOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-green-100 text-green-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                } ${!isExpanded ? 'justify-center' : ''}`}
                title={!isExpanded ? item.label : ''}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {isExpanded && (
                  <span className="truncate">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-200">
          {/* User Menu */}
          {isExpanded && (
            <div className="p-4">
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    userRole === 'admin' ? 'bg-purple-100' : 'bg-blue-100'
                  }`}>
                    {userRole === 'admin' ? (
                      <Shield className="w-4 h-4 text-purple-600" />
                    ) : (
                      <Users className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {userName || 'Usuario'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {userRole === 'admin' ? 'Administrador' : 'Jugador'}
                    </p>
                  </div>
                  <Settings className="w-4 h-4 text-gray-400" />
                </button>

                {/* User Menu Dropdown */}
                {showUserMenu && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="p-2">
                      <button
                        onClick={() => {
                          onChangePassword();
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <Key className="w-4 h-4" />
                        <span>Cambiar Contraseña</span>
                      </button>
                      <button
                        onClick={() => {
                          onSignOut();
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Cerrar Sesión</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!isExpanded && (
            <div className="p-2">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-50 transition-colors"
                title="Menú de usuario"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  userRole === 'admin' ? 'bg-purple-100' : 'bg-blue-100'
                }`}>
                  {userRole === 'admin' ? (
                    <Shield className="w-4 h-4 text-purple-600" />
                  ) : (
                    <Users className="w-4 h-4 text-blue-600" />
                  )}
                </div>
              </button>

              {/* Collapsed User Menu */}
              {showUserMenu && (
                <div className="absolute bottom-16 left-16 bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 min-w-48">
                    <div className="px-3 py-2 border-b border-gray-200 mb-2">
                      <p className="text-sm font-medium text-gray-900">{userName}</p>
                      <p className="text-xs text-gray-500">
                        {userRole === 'admin' ? 'Administrador' : 'Jugador'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onChangePassword();
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <Key className="w-4 h-4" />
                      <span>Cambiar Contraseña</span>
                    </button>
                    <button
                      onClick={() => {
                        onSignOut();
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
