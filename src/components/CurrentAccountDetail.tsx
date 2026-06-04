import React from 'react';
import { X, Calendar, Clock, TrendingDown, TrendingUp, CreditCard, FileText, Trash2 } from 'lucide-react';
import { PlayerCurrentAccount, CurrentAccountEntry } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';

interface CurrentAccountDetailProps {
  account: PlayerCurrentAccount;
  onDeleteEntry: (entryId: string) => void;
  onClose: () => void;
  isModal?: boolean;
}

const CurrentAccountDetail: React.FC<CurrentAccountDetailProps> = ({ account, onDeleteEntry, onClose, isModal = true }) => {
  const getEntryIcon = (entry: CurrentAccountEntry) => {
    if (entry.type === 'debit') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <TrendingUp className="w-4 h-4 text-green-500" />;
  };

  const getEntryColor = (entry: CurrentAccountEntry) => {
    if (entry.type === 'debit') return 'text-red-600';
    return 'text-green-600';
  };

  const getPaymentMethodLabel = (method?: string) => {
    switch (method) {
      case 'cash': return 'Efectivo';
      case 'card': return 'Tarjeta';
      case 'transfer': return 'Transferencia';
      case 'current_account': return 'Cuenta Corriente';
      default: return 'N/A';
    }
  };

  const totalDebits = account.entries
    .filter(e => e.type === 'debit')
    .reduce((sum, e) => sum + e.amount, 0);
  
  const totalCredits = account.entries
    .filter(e => e.type === 'credit')
    .reduce((sum, e) => sum + e.amount, 0);

  const content = (
    <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Cuenta Corriente</h2>
              <p className="text-gray-600">{account.playerName}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Balance Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <CreditCard className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Saldo Actual</span>
              </div>
              <p className={`text-2xl font-bold ${
                account.balance < 0 ? 'text-red-600' : 
                account.balance > 0 ? 'text-green-600' : 'text-gray-600'
              }`}>
                {formatCurrency(Math.abs(account.balance))}
              </p>
              <p className="text-xs text-gray-500">
                {account.balance < 0 ? 'Debe' : account.balance > 0 ? 'A favor' : 'Sin saldo'}
              </p>
            </div>

            <div className="bg-red-50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingDown className="w-5 h-5 text-red-600" />
                <span className="text-sm font-medium text-red-700">Total Débitos</span>
              </div>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totalDebits)}</p>
              <p className="text-xs text-red-500">
                {account.entries.filter(e => e.type === 'debit').length} movimientos
              </p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-700">Total Pagos</span>
              </div>
              <p className="text-xl font-bold text-green-600">{formatCurrency(totalCredits)}</p>
              <p className="text-xs text-green-500">
                {account.entries.filter(e => e.type === 'credit').length} movimientos
              </p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">Movimientos</span>
              </div>
              <p className="text-xl font-bold text-blue-600">{account.entries.length}</p>
              <p className="text-xs text-blue-500">
                {account.lastMovement ? `Último: ${formatDate(account.lastMovement)}` : 'Sin movimientos'}
              </p>
            </div>
          </div>

          {/* Movements History */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Historial de Movimientos</h3>
            
            {account.entries.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No hay movimientos registrados</p>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Fecha</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Descripción</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Tipo</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Monto</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Saldo</th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(() => {
                      let runningBalance = 0;
                      return [...account.entries].reverse().map(entry => {
                        runningBalance += entry.type === 'credit' ? entry.amount : -entry.amount;
                        
                        return (
                          <tr key={entry.id}>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              <div className="flex items-center space-x-2">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <div>
                                  <div>{formatDate(entry.date)}</div>
                                  <div className="text-xs text-gray-500">{entry.time}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              <div>
                                <div>{entry.description}</div>
                                {entry.paymentMethod && (
                                  <div className="text-xs text-gray-500">
                                    Método: {getPaymentMethodLabel(entry.paymentMethod)}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex items-center space-x-2">
                                {getEntryIcon(entry)}
                                <span className={`font-medium ${getEntryColor(entry)}`}>
                                  {entry.type === 'debit' ? 'Débito' : 'Pago'}
                                </span>
                              </div>
                            </td>
                            <td className={`px-4 py-3 text-sm font-medium text-right ${getEntryColor(entry)}`}>
                              {entry.type === 'debit' ? '-' : '+'}{formatCurrency(entry.amount)}
                            </td>
                            <td className={`px-4 py-3 text-sm font-bold text-right ${
                              runningBalance < 0 ? 'text-red-600' : 
                              runningBalance > 0 ? 'text-green-600' : 'text-gray-600'
                            }`}>
                              {formatCurrency(Math.abs(runningBalance))}
                              <div className="text-xs font-normal text-gray-500">
                                {runningBalance < 0 ? 'Debe' : runningBalance > 0 ? 'A favor' : 'Sin saldo'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => onDeleteEntry(entry.id)}
                                className="inline-flex items-center px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                title="Eliminar movimiento"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Close Button */}
          {isModal && (
            <div className="mt-6">
              <button
                onClick={onClose}
                className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {content}
    </div>
  );
};

export default CurrentAccountDetail;