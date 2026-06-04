import React, { useState } from 'react';
import { CreditCard, Plus, Search, TrendingDown, TrendingUp, Eye, DollarSign, Users } from 'lucide-react';
import { PlayerProfile, CurrentAccountEntry, PlayerCurrentAccount } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';
import { getPlayerCurrentAccount } from '../utils/currentAccounts';
import PlayerSearchPopup from './PlayerSearchPopup';

interface CurrentAccountListProps {
  players: PlayerProfile[];
  currentAccountEntries: CurrentAccountEntry[];
  onAddPayment: (playerId: string) => void;
  onViewAccount: (playerId: string) => void;
  onDeleteEntry: (entryId: string) => void;
}

const CurrentAccountList: React.FC<CurrentAccountListProps> = ({ 
  players, 
  currentAccountEntries, 
  onAddPayment, 
  onViewAccount,
  onDeleteEntry
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBalance, setFilterBalance] = useState<'all' | 'debtors' | 'creditors'>('debtors');
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);

  // Crear cuentas corrientes para todos los jugadores
  const playerAccounts: PlayerCurrentAccount[] = players.map(player => 
    getPlayerCurrentAccount(player.id, player.name, currentAccountEntries)
  );

  // Filtrar cuentas
  const filteredAccounts = playerAccounts.filter(account => {
    const matchesSearch = account.playerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Si no hay búsqueda, solo mostrar jugadores con saldo diferente de cero
    if (!searchTerm.trim()) {
      // Sin búsqueda: solo mostrar jugadores con saldo (deudores o acreedores)
      if (filterBalance === 'all') {
        return account.balance !== 0;
      } else if (filterBalance === 'debtors') {
        return account.balance < 0;
      } else if (filterBalance === 'creditors') {
        return account.balance > 0;
      }
      return false;
    }
    
    // Con búsqueda: mostrar todos los jugadores que coincidan, independientemente del saldo
    const matchesBalance = 
      filterBalance === 'all' ? true :
      (filterBalance === 'debtors' && account.balance < 0) ||
      (filterBalance === 'creditors' && account.balance > 0);
    
    return matchesSearch && matchesBalance;
  });

  // Estadísticas
  const totalDebt = playerAccounts.reduce((sum, account) => 
    sum + (account.balance < 0 ? Math.abs(account.balance) : 0), 0
  );
  
  const totalCredit = playerAccounts.reduce((sum, account) => 
    sum + (account.balance > 0 ? account.balance : 0), 0
  );
  
  const debtorsCount = playerAccounts.filter(account => account.balance < 0).length;
  const creditorsCount = playerAccounts.filter(account => account.balance > 0).length;

  const getBalanceColor = (balance: number) => {
    if (balance < 0) return 'text-red-600';
    if (balance > 0) return 'text-green-600';
    return 'text-gray-600';
  };

  const getBalanceIcon = (balance: number) => {
    if (balance < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
    if (balance > 0) return <TrendingUp className="w-4 h-4 text-green-500" />;
    return <DollarSign className="w-4 h-4 text-gray-500" />;
  };

  const handlePlayerSelect = (player: PlayerProfile) => {
    setSearchTerm(player.name);
    setShowPlayerSearch(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cuenta Corriente</h2>
          <p className="text-gray-600">Gestiona saldos y pagos. Usa el buscador para ver cualquier jugador registrado.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Deudas</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totalDebt)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total a Favor</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(totalCredit)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Deudores</p>
              <p className="text-xl font-bold text-gray-900">{debtorsCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Saldo Neto</p>
              <p className={`text-xl font-bold ${getBalanceColor(totalCredit - totalDebt)}`}>
                {formatCurrency(totalCredit - totalDebt)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar jugador por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowPlayerSearch(true)}
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 whitespace-nowrap"
          >
            <Users className="w-5 h-5" />
            <span className="hidden sm:inline">Buscar Jugador</span>
          </button>
        </div>

        <select
          value={filterBalance}
          onChange={(e) => setFilterBalance(e.target.value as any)}
          className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
        >
          <option value="all">Todos los saldos</option>
          <option value="debtors">Solo deudores (por defecto)</option>
          <option value="creditors">Solo a favor</option>
        </select>
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jugador
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Saldo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Último Movimiento
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Movimientos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAccounts.map(account => (
                <tr key={account.playerId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{account.playerName}</div>
                        <div className="text-sm text-gray-500">
                          {account.entries.length} movimiento{account.entries.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {getBalanceIcon(account.balance)}
                      <span className={`text-lg font-bold ${getBalanceColor(account.balance)}`}>
                        {formatCurrency(Math.abs(account.balance))}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {account.balance < 0 ? 'Debe' : account.balance > 0 ? 'A favor' : 'Sin saldo'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {account.lastMovement ? (
                      <div className="text-sm text-gray-900">
                        {formatDate(account.lastMovement)}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">
                        {searchTerm ? 'Sin movimientos' : 'Sin movimientos'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {account.entries.length > 0 ? (
                      <>
                        <div className="text-sm text-gray-900">
                          {account.entries.filter(e => e.type === 'debit').length} débitos
                        </div>
                        <div className="text-sm text-gray-500">
                          {account.entries.filter(e => e.type === 'credit').length} pagos
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-500">
                        Sin historial
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => onViewAccount(account.playerId)}
                      className="inline-flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      title={account.entries.length > 0 ? "Ver historial completo" : "Ver cuenta (sin movimientos)"}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Ver
                    </button>
                    {account.balance < 0 && (
                      <button
                        onClick={() => onAddPayment(account.playerId)}
                        className="inline-flex items-center px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Cobrar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAccounts.length === 0 && (
          <div className="text-center py-12">
            <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron jugadores' : 
               filterBalance === 'debtors' ? 'No hay jugadores con deudas' :
               filterBalance === 'creditors' ? 'No hay jugadores con saldo a favor' :
               'No hay jugadores con saldo'}
            </h3>
            <p className="text-gray-600">
              {searchTerm ? 
                'Intenta con otros términos de búsqueda. El buscador muestra todos los jugadores registrados.' : 
                'Usa el buscador para encontrar cualquier jugador registrado y ver su historial completo.'}
            </p>
          </div>
        )}
      </div>

      {/* Player Search Popup */}
      {showPlayerSearch && (
        <PlayerSearchPopup
          players={players}
          selectedPlayers={[]}
          maxPlayers={1}
          onPlayerSelect={handlePlayerSelect}
          onPlayerDeselect={() => {}}
          onClose={() => setShowPlayerSearch(false)}
          onCreateNew={() => setShowPlayerSearch(false)}
        />
      )}
    </div>
  );
};

export default CurrentAccountList;
