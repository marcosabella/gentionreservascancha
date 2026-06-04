import React, { useState } from 'react';
import { CreditCard, Plus, Search, Calendar, Clock, User, Users, Filter, Eye, Trash2, CreditCard as Edit } from 'lucide-react';
import { Sale, Booking } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';
import { getArgentinaDateString } from '../utils/date';

interface SalesListProps {
  sales: Sale[];
  bookings: Booking[];
  onAddSale: () => void;
  onViewSale: (sale: Sale) => void;
  onEditSale: (sale: Sale) => void;
  onDeleteSale: (saleId: string) => void;
}

const SalesList: React.FC<SalesListProps> = ({ 
  sales, 
  bookings,
  onAddSale, 
  onViewSale, 
  onEditSale,
  onDeleteSale 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'registered' | 'guest'>('all');
  const [dateFilter, setDateFilter] = useState('');

  // Combinar ventas directas con turnos finalizados
  const completedBookings = bookings.filter(booking =>
    booking.status === 'completed' && booking.finalTotal !== undefined
  );

  const getBookingCourtTotal = (booking: Booking) => {
    const consumptionsTotal = booking.consumptions.reduce(
      (sum, consumption) => sum + consumption.price * consumption.quantity,
      0
    );

    return booking.totalPrice > 0
      ? booking.totalPrice
      : Math.max((booking.finalTotal || 0) - consumptionsTotal, 0);
  };

  const bookingSales: Sale[] = completedBookings.map(booking => ({
    id: `booking-${booking.id}`,
    type: 'booking' as const,
    date: booking.date,
    time: booking.startTime,
    customerType: 'registered' as const,
    customer: {
      id: booking.players[0]?.id,
      name: booking.players[0]?.name || 'Cliente',
      email: booking.players[0]?.email,
      phone: booking.players[0]?.phone
    },
    items: booking.consumptions.map(consumption => ({
      id: consumption.id,
      consumableId: consumption.id,
      name: consumption.name,
      price: consumption.price,
      quantity: consumption.quantity,
      subtotal: consumption.price * consumption.quantity
    })),
    totalAmount: booking.finalTotal || 0,
    paymentMethod: 'cash' as const, // Default, se puede modificar
    notes: `Turno en ${booking.courtName}`,
    createdAt: booking.closedAt || booking.createdAt,
    bookingId: booking.id,
    courtName: booking.courtName,
    bookingTotalPrice: getBookingCourtTotal(booking),
    bookingPlayers: booking.players,
    bookingConsumptions: booking.consumptions
  }));

  const allSales = [...sales, ...bookingSales].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filteredSales = allSales.filter(sale => {
    const matchesSearch = sale.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sale.customer.phone?.includes(searchTerm) ||
                         (sale.courtName && sale.courtName.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = filterType === 'all' || sale.customerType === filterType;
    const matchesDate = !dateFilter || sale.date === dateFilter;
    
    return matchesSearch && matchesType && matchesDate;
  });

  const totalSales = allSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const todaySales = allSales.filter(sale => sale.date === getArgentinaDateString());
  const todayTotal = todaySales.reduce((sum, sale) => sum + sale.totalAmount, 0);

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

  const getSaleTypeLabel = (sale: Sale) => {
    return sale.type === 'booking' ? 'Turno' : 'Venta Directa';
  };

  const getSaleTypeColor = (sale: Sale) => {
    return sale.type === 'booking' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  };

  const isSyntheticBookingSale = (sale: Sale) => sale.id.startsWith('booking-');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Ventas</h2>
          <p className="text-gray-600">Registra ventas de consumibles a clientes</p>
        </div>
        <button
          onClick={onAddSale}
          className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nueva Venta</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Ventas</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totalSales)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Ventas Hoy</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(todayTotal)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Ventas Directas</p>
              <p className="text-xl font-bold text-gray-900">
                {allSales.filter(s => s.type === 'direct').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Turnos Finalizados</p>
              <p className="text-xl font-bold text-gray-900">
                {allSales.filter(s => s.type === 'booking').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por cliente o cancha..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          >
            <option value="all">Todos los clientes</option>
            <option value="registered">Jugadores registrados</option>
            <option value="guest">Clientes ocasionales</option>
          </select>
        </div>

        <div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          />
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pago
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSales.map(sale => (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatDate(sale.date)}
                        </div>
                        <div className="text-sm text-gray-500">{sale.time}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{sale.customer.name}</div>
                      {sale.customer.phone && (
                        <div className="text-sm text-gray-500">{sale.customer.phone}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSaleTypeColor(sale)}`}>
                        {getSaleTypeLabel(sale)}
                      </span>
                      {sale.courtName && (
                        <div className="text-xs text-gray-500 mt-1">{sale.courtName}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(sale.totalAmount)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      sale.paymentMethod === 'cash' ? 'bg-green-100 text-green-800' :
                      sale.paymentMethod === 'card' ? 'bg-blue-100 text-blue-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {getPaymentMethodLabel(sale.paymentMethod)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                    <button
                      onClick={() => onViewSale(sale)}
                      className="inline-flex items-center px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {!isSyntheticBookingSale(sale) && (
                      <button
                        onClick={() => onEditSale(sale)}
                        className="inline-flex items-center px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                        title="Editar venta"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteSale(sale.id)}
                      className="inline-flex items-center px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      title={sale.type === 'booking' ? 'No se pueden eliminar ventas de turnos' : 'Eliminar venta'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredSales.length === 0 && (
          <div className="text-center py-12">
            <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterType !== 'all' || dateFilter ? 'No se encontraron ventas' : 'No hay ventas o turnos registrados'}
            </h3>
            <p className="text-gray-600">
              {searchTerm || filterType !== 'all' || dateFilter ? 'Intenta con otros filtros' : 'Las ventas directas y turnos finalizados aparecerán aquí'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesList;
