import React from 'react';
import { X, Calendar, Clock, User, CreditCard, FileText, Users, ShoppingCart } from 'lucide-react';
import { Sale } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';

interface SaleDetailModalProps {
  sale: Sale;
  onClose: () => void;
}

const SaleDetailModal: React.FC<SaleDetailModalProps> = ({ sale, onClose }) => {
  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Efectivo';
      case 'card': return 'Tarjeta';
      case 'transfer': return 'Transferencia';
      case 'current_account': return 'Cuenta Corriente';
      default: return method;
    }
  };

  const getCustomerTypeLabel = (type: string) => {
    switch (type) {
      case 'registered': return 'Jugador Registrado';
      case 'guest': return 'Cliente Ocasional';
      default: return type;
    }
  };

  const getPlayerPaymentLabel = (player: NonNullable<Sale['bookingPlayers']>[number]) => {
    if (player.paymentSplits && player.paymentSplits.length > 0) {
      return player.paymentSplits
        .filter(split => split.amount > 0)
        .map(split => `${getPaymentMethodLabel(split.method)} ${formatCurrency(split.amount)}`)
        .join(' + ');
    }

    return player.paymentMethod ? getPaymentMethodLabel(player.paymentMethod) : 'Sin pago';
  };

  const bookingPlayers = sale.bookingPlayers || [];
  const bookingConsumptions = sale.bookingConsumptions || [];
  const bookingPlayerCosts = bookingPlayers.reduce<Record<string, number>>((costs, player) => {
    costs[player.id] = bookingPlayers.length > 0 ? (sale.bookingTotalPrice || 0) / bookingPlayers.length : 0;
    return costs;
  }, {});

  bookingConsumptions.forEach(consumption => {
    const consumptionTotal = consumption.price * consumption.quantity;

    if (consumption.splitBetweenPlayers && bookingPlayers.length > 0) {
      const amountByPlayer = consumptionTotal / bookingPlayers.length;
      bookingPlayers.forEach(player => {
        bookingPlayerCosts[player.id] = (bookingPlayerCosts[player.id] || 0) + amountByPlayer;
      });
    } else if (consumption.assignedToPlayers && consumption.assignedToPlayers.length > 0) {
      const amountByPlayer = consumptionTotal / consumption.assignedToPlayers.length;
      consumption.assignedToPlayers.forEach(playerId => {
        if (bookingPlayerCosts[playerId] !== undefined) {
          bookingPlayerCosts[playerId] += amountByPlayer;
        }
      });
    }
  });

  const getConsumptionAssignment = (itemId: string) => {
    const consumption = bookingConsumptions.find(consumption => consumption.id === itemId);

    if (!consumption) return null;
    if (consumption.splitBetweenPlayers) return 'Dividido entre todos los jugadores';
    if (!consumption.assignedToPlayers || consumption.assignedToPlayers.length === 0) return 'Sin jugadores asignados';

    const assignedPlayers = consumption.assignedToPlayers
      .map(playerId => bookingPlayers.find(player => player.id === playerId)?.name)
      .filter(Boolean);

    return assignedPlayers.length > 0
      ? `Asignado a: ${assignedPlayers.join(', ')}`
      : 'Asignado a jugadores no disponibles';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Detalle de Venta</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Sale Type */}
            {sale.type === 'booking' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-900">Venta de Turno Finalizado</p>
                    <p className="text-sm text-blue-700">
                      Consumibles vendidos durante el turno en {sale.courtName}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Sale Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Calendar className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Fecha</p>
                    <p className="font-medium">{formatDate(sale.date)}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Hora</p>
                    <p className="font-medium">{sale.time}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <CreditCard className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Método de Pago</p>
                    <p className="font-medium">{getPaymentMethodLabel(sale.paymentMethod)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <User className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Cliente</p>
                    <p className="font-medium">{sale.customer.name}</p>
                    <p className="text-sm text-gray-400">{getCustomerTypeLabel(sale.customerType)}</p>
                  </div>
                </div>

                {sale.customer.phone && (
                  <div className="ml-8">
                    <p className="text-sm text-gray-500">Teléfono</p>
                    <p className="font-medium">{sale.customer.phone}</p>
                  </div>
                )}

                {sale.customer.email && (
                  <div className="ml-8">
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium">{sale.customer.email}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Booking Players */}
            {bookingPlayers.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Users className="w-5 h-5 text-gray-500" />
                  <h3 className="text-lg font-semibold text-gray-900">Jugadores</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {bookingPlayers.map(player => (
                    <div key={player.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {player.name}
                            {player.isOrganizer && (
                              <span className="ml-2 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded">
                                Organizador
                              </span>
                            )}
                          </p>
                          {player.phone && (
                            <p className="text-sm text-gray-500 mt-1">{player.phone}</p>
                          )}
                          {player.email && (
                            <p className="text-sm text-gray-500">{player.email}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 px-2 py-1">
                          {getPlayerPaymentLabel(player)}
                        </span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-sm text-gray-600">Abonado</span>
                        <span className="text-base font-bold text-green-600">
                          {formatCurrency(bookingPlayerCosts[player.id] || 0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Items */}
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <ShoppingCart className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-900">Consumibles</h3>
              </div>
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                {sale.items.length > 0 ? (
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Producto</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Cantidad</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Precio Unit.</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sale.items.map(item => {
                        const assignment = getConsumptionAssignment(item.id);

                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              <div>{item.name}</div>
                              {assignment && (
                                <div className="text-xs text-gray-500 mt-1">{assignment}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-center">{item.quantity}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right">
                              {formatCurrency(item.price)}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                              {formatCurrency(item.subtotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          Total:
                        </td>
                        <td className="px-4 py-3 text-lg font-bold text-green-600 text-right">
                          {formatCurrency(sale.totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <div className="px-4 py-6 text-sm text-gray-600">
                    No hay consumibles registrados para esta venta.
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {sale.notes && (
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <FileText className="w-5 h-5 text-gray-500" />
                  <h3 className="text-lg font-semibold text-gray-900">Notas</h3>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700">{sale.notes}</p>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700">Venta registrada el</p>
                  <p className="font-medium text-green-900">
                    {new Date(sale.createdAt).toLocaleString('es-AR')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-green-700">Total de la venta</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(sale.totalAmount)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="mt-6">
            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SaleDetailModal;
