import { useEffect, useState } from 'react';
import {
  Menu, X, Calendar, Clock, MapPin, ShoppingCart, Users, CreditCard, Home,
  ChevronLeft, ChevronRight, ChevronDown, LogOut, Settings, Key, Shield,
  Trophy, List, CalendarOff, Banknote,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { complexName, complexLogo } from '../config/complex';
import { hasPermission, tabPermissions } from '../config/permissions';
import type { UserRole } from '../types';
import ThemeSwitch from './ThemeSwitch';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  userRole?: UserRole;
  permissions?: string[];
  userName?: string;
  userId?: string;
  onSignOut: () => void;
  onChangePassword: () => void;
}

interface NavigationLink {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface NavigationGroup extends NavigationLink {
  children: NavigationLink[];
}

const adminNavigation: (NavigationLink | NavigationGroup)[] = [
  { id: 'dashboard', label: 'Inicio', icon: Home },
  {
    id: 'reservas-menu', label: 'Reservas', icon: Calendar,
    children: [
      { id: 'reservas', label: 'Calendario de reservas', icon: Calendar },
      { id: 'mis-reservas', label: 'Listado de reservas', icon: List },
      { id: 'turnos-fijos', label: 'Turnos fijos', icon: Clock },
      { id: 'disponibilidad', label: 'Bloqueos y disponibilidad', icon: CalendarOff },
    ],
  },
  { id: 'jugadores', label: 'Jugadores', icon: Users },
  {
    id: 'comercial-menu', label: 'Ventas y cobros', icon: CreditCard,
    children: [
      { id: 'ventas', label: 'Ventas', icon: ShoppingCart },
      { id: 'cuenta-corriente', label: 'Cuentas corrientes', icon: CreditCard },
      { id: 'caja', label: 'Caja', icon: Banknote },
    ],
  },
  { id: 'torneos', label: 'Torneos', icon: Trophy },
  {
    id: 'configuracion-menu', label: 'Configuración', icon: Settings,
    children: [
      { id: 'canchas', label: 'Canchas', icon: MapPin },
      { id: 'consumibles', label: 'Productos y precios', icon: ShoppingCart },
      { id: 'usuarios', label: 'Usuarios y permisos', icon: Shield },
    ],
  },
];

const playerNavigation: NavigationLink[] = [
  { id: 'dashboard', label: 'Inicio', icon: Home },
  { id: 'reservas', label: 'Reservar cancha', icon: Calendar },
  { id: 'mis-reservas', label: 'Mis reservas', icon: Clock },
  { id: 'torneos', label: 'Torneos', icon: Trophy },
  { id: 'cuenta-corriente', label: 'Mi cuenta', icon: CreditCard },
];

const groupIds = adminNavigation.filter((item): item is NavigationGroup => 'children' in item)
  .map(item => item.id);

function readOpenGroups(key: string): string[] {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) {
      const stored: unknown = JSON.parse(value);
      if (Array.isArray(stored)) {
        return stored.filter((id): id is string => typeof id === 'string' && groupIds.includes(id));
      }
    }
  } catch {
    // Private browsing or unavailable storage must not prevent navigation.
  }
  return ['reservas-menu'];
}

export default function Sidebar({
  activeTab, onTabChange, userRole, userName, userId, permissions, onSignOut, onChangePassword,
}: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const storageKey = `reservas:sidebar:${complexName}:${userRole}:${userId ?? userName ?? ''}`;
  const [openGroups, setOpenGroups] = useState(() => readOpenGroups(storageKey));
  const employeeUser = userRole === 'employee' ? { role: userRole, permissions } : null;
  const navigation: (NavigationLink | NavigationGroup)[] = userRole === 'admin' ? adminNavigation : userRole === 'employee'
    ? adminNavigation.flatMap<NavigationLink | NavigationGroup>(item => {
        if ('children' in item) {
          const children = item.children.filter(child => hasPermission(employeeUser, tabPermissions[child.id]));
          return children.length ? [{ ...item, children }] : [];
        }
        return hasPermission(employeeUser, tabPermissions[item.id]) ? [item] : [];
      })
    : userRole === 'player' ? playerNavigation : [];
  const activeGroup = adminNavigation.find((item): item is NavigationGroup =>
    'children' in item && item.children.some(child => child.id === activeTab));
  const activeGroupId = userRole !== 'player' ? activeGroup?.id : undefined;

  useEffect(() => {
    if (activeGroupId) {
      setOpenGroups(previous => previous.includes(activeGroupId) ? previous : [...previous, activeGroupId]);
    }
  }, [activeTab, activeGroupId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(openGroups));
    } catch {
      // Menu preferences are optional.
    }
  }, [storageKey, openGroups]);

  const navigate = (id: string) => {
    onTabChange(id);
    setIsMobileOpen(false);
    setShowUserMenu(false);
  };

  const toggleGroup = (id: string) => {
    if (!isExpanded) {
      setIsExpanded(true);
      setOpenGroups(previous => previous.includes(id) ? previous : [...previous, id]);
      return;
    }
    setOpenGroups(previous => previous.includes(id)
      ? previous.filter(group => group !== id) : [...previous, id]);
  };

  const openMobileMenu = () => {
    setIsExpanded(true);
    setIsMobileOpen(previous => !previous);
  };

  const renderLink = (item: NavigationLink, nested = false) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => navigate(item.id)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
        title={!isExpanded ? item.label : undefined}
        className={`flex w-full items-center gap-3 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${
          nested ? 'px-3 py-2.5 text-sm' : 'px-3 py-3 text-sm font-medium'
        } ${isActive ? 'bg-green-100 font-semibold text-green-800' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'} ${
          !isExpanded ? 'justify-center' : ''
        }`}
      >
        <Icon className={nested ? 'h-4 w-4 shrink-0' : 'h-5 w-5 shrink-0'} aria-hidden="true" />
        {isExpanded && <span className="min-w-0 leading-5">{item.label}</span>}
      </button>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={openMobileMenu}
        className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 bg-green-600 px-4 text-white shadow-lg lg:hidden"
        aria-label={isMobileOpen ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={isMobileOpen}
        aria-controls="main-sidebar"
      >
        {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        <span className="text-sm font-semibold">{complexLogo ? <img src={complexLogo} alt={complexName} className={complexName.toUpperCase() === 'PURA VIDA' ? 'h-10 w-auto object-contain' : 'h-11 w-20 rounded object-contain'} /> : complexName}</span>
      </button>

      {isMobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú de navegación"
          className="fixed inset-x-0 bottom-0 top-14 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        id="main-sidebar"
        data-expanded={isExpanded}
        aria-label="Menú principal"
        onKeyDown={event => {
          if (event.key === 'Escape') {
            setIsMobileOpen(false);
            setShowUserMenu(false);
          }
        }}
        className={`peer/sidebar fixed left-0 top-14 z-40 flex h-[calc(100dvh-3.5rem)] w-64 flex-col overflow-hidden bg-white shadow-xl transition-all duration-200 lg:top-0 lg:h-dvh ${
          isExpanded ? 'lg:w-64' : 'lg:w-16'
        } ${isMobileOpen ? 'translate-x-0' : 'invisible -translate-x-full lg:visible lg:translate-x-0'}`}
      >
        <div className={`flex shrink-0 items-center border-b border-gray-200 ${isExpanded ? 'justify-between gap-2 p-4' : 'flex-col gap-2 px-2 py-3'}`}>
          {complexLogo ? (
            <div className="min-w-0">
              <h1><img src={complexLogo} alt={complexName} className={`h-auto max-w-full object-contain ${complexName.toUpperCase() === 'PURA VIDA' ? (isExpanded ? 'w-32' : 'w-10') : (isExpanded ? 'w-40 rounded-lg' : 'w-12 rounded')}`} /></h1>
              {isExpanded && <p className="mt-1 text-center text-xs text-gray-500">Sistema de reservas</p>}
              {isExpanded && import.meta.env.VITE_TEST_ENVIRONMENT === 'true' && <p className="mt-1 text-xs font-medium text-amber-700">Entorno de pruebas</p>}
            </div>
          ) : (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600">
              <MapPin className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            {isExpanded && (
              <div className="min-w-0">
                <h1 className="break-words text-base font-bold leading-5 text-gray-900">{complexName}</h1>
                <p className="mt-1 text-center text-xs text-gray-500">Sistema de reservas</p>
                {import.meta.env.VITE_TEST_ENVIRONMENT === 'true' && <p className="mt-1 text-xs font-medium text-amber-700">Entorno de pruebas</p>}
              </div>
            )}
          </div>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(previous => !previous)}
            aria-label={isExpanded ? 'Contraer barra lateral' : 'Expandir barra lateral'}
            className="hidden shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-green-600 lg:block"
          >
            {isExpanded ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
        </div>

        <nav aria-label="Secciones del sistema" className={`min-h-0 flex-1 space-y-1 overflow-y-auto py-4 ${isExpanded ? 'px-3' : 'px-2'}`}>
          {navigation.map(item => {
            if (!('children' in item)) return renderLink(item);
            const Icon = item.icon;
            const isActive = item.children.some(child => child.id === activeTab);
            const isOpen = isExpanded && openGroups.includes(item.id);
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(item.id)}
                  aria-label={item.label}
                  aria-expanded={isOpen}
                  aria-controls={item.id}
                  title={!isExpanded ? item.label : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${
                    isActive ? 'bg-green-50 text-green-800' : 'text-gray-700 hover:bg-gray-50'
                  } ${!isExpanded ? 'justify-center' : ''}`}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {isExpanded && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </>
                  )}
                </button>
                <div id={item.id} hidden={!isOpen} className="mb-2 ml-5 mt-1 space-y-0.5 border-l border-gray-200 pl-2">
                  {item.children.map(child => renderLink(child, true))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className={`shrink-0 border-t border-gray-200 ${isExpanded ? 'p-3' : 'p-2'}`}>
          <ThemeSwitch compact={!isExpanded} className="mb-2 w-full" />
          <button
            type="button"
            onClick={() => {
              setIsExpanded(true);
              setShowUserMenu(previous => !previous);
            }}
            aria-label="Mi usuario"
            aria-expanded={showUserMenu && isExpanded}
            aria-controls="sidebar-user-actions"
            title={!isExpanded ? userName || 'Mi usuario' : undefined}
            className={`flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-green-600 ${!isExpanded ? 'justify-center' : ''}`}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${userRole === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
              {userRole === 'admin' ? <Shield className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            </div>
            {isExpanded && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{userName || 'Usuario'}</p>
                  <p className="text-xs text-gray-500">{userRole === 'admin' ? 'Administrador' : userRole === 'employee' ? 'Empleado' : 'Jugador'}</p>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 ${showUserMenu ? 'rotate-180' : ''}`} aria-hidden="true" />
              </>
            )}
          </button>
          <div id="sidebar-user-actions" hidden={!showUserMenu || !isExpanded} className="mt-1 space-y-1">
            <button type="button" onClick={() => { onChangePassword(); setShowUserMenu(false); setIsMobileOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-green-600">
              <Key className="h-4 w-4" aria-hidden="true" />Cambiar contraseña
            </button>
            <button type="button" onClick={() => { onSignOut(); setShowUserMenu(false); setIsMobileOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-green-600">
              <LogOut className="h-4 w-4" aria-hidden="true" />Cerrar sesión
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
