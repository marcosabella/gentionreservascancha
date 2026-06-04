import React from 'react';
import { Calendar, Clock, MapPin, ShoppingCart, Users, CreditCard } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'reservas', label: 'Hacer Reserva', icon: Calendar },
    { id: 'mis-reservas', label: 'Mis Reservas', icon: Clock },
    { id: 'canchas', label: 'Canchas', icon: MapPin },
    { id: 'consumibles', label: 'Consumibles', icon: ShoppingCart },
    { id: 'jugadores', label: 'Jugadores', icon: Users },
    { id: 'ventas', label: 'Ventas', icon: CreditCard },
    { id: 'cuenta-corriente', label: 'Cuenta Corriente', icon: CreditCard }
  ];

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">PADEL CENTER</h1>
              <p className="text-sm text-gray-600">Sistema de reservas online</p>
            </div>
          </div>
          
          <nav className="flex space-x-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-green-100 text-green-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;