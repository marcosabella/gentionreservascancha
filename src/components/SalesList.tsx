import { ActionButton } from '../config/AccessContext';
import React, { useState } from 'react';
import { CreditCard, Plus, Search, Calendar, Filter, Eye, Trash2, CreditCard as Edit } from 'lucide-react';
import { Sale, Booking } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';
import { getSalePaymentTotals, isSaleInPeriod, matchesSalePayment, salesPaymentMethods, summarizeSales } from '../utils/salesReport';
import type { SalesPaymentFilter } from '../utils/salesReport';
import { bookingNetTotal, bookingComplimentaryTotal } from '../utils/bookingComplimentary';
import { saleNetTotal, saleComplimentaryTotal } from '../utils/saleDistribution';

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
  const [paymentFilter, setPaymentFilter] = useState<SalesPaymentFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const invalidPeriod = Boolean(dateFrom && dateTo && dateFrom > dateTo);

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
      consumableId: consumption.consumableId || consumption.id,
      name: consumption.name,
      price: consumption.price,
      quantity: consumption.quantity,
      subtotal: consumption.price * consumption.quantity
    })),
    totalAmount: bookingNetTotal(booking),
    paymentMethod: 'cash' as const, // Payment totals below use each player's actual payments.
    notes: `Turno en ${booking.courtName}` + (bookingComplimentaryTotal(booking) > 0 ? ` · Bonificado: ${formatCurrency(bookingComplimentaryTotal(booking))}` : ''),
    createdAt: booking.closedAt || booking.createdAt,
    bookingId: booking.id,
    courtName: booking.courtName,
    bookingTotalPrice: getBookingCourtTotal(booking),
    bookingPlayers: booking.players,
    bookingConsumptions: booking.consumptions
  }));

  const bookingIds = new Set(completedBookings.map(booking => booking.id));
  const allSales = [...sales.filter(sale => !(sale.type === 'booking' && sale.bookingId && bookingIds.has(sale.bookingId))), ...bookingSales].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filteredSales = allSales.filter(sale => {
    const matchesSearch = sale.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sale.distribution?.participants.some(person => person.name.toLowerCase().includes(searchTerm.toLowerCase()) || person.phone?.includes(searchTerm)) ||
                         sale.customer.phone?.includes(searchTerm) ||
                         (sale.courtName && sale.courtName.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = filterType === 'all' || (sale.distribution ? sale.distribution.participants.some(person => person.registered === (filterType === 'registered')) : sale.customerType === filterType);
    const matchesDate = !invalidPeriod && isSaleInPeriod(sale.date, dateFrom, dateTo);
    
    return matchesSearch && matchesType && matchesDate && matchesSalePayment(sale, paymentFilter);
  });

  const summary = summarizeSales(filteredSales);

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
        <ActionButton permission="sales.create"
          onClick={onAddSale}
          className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nueva Venta</span>
        </ActionButton>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 items-end gap-4">
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
            onChange={(e) => setFilterType(e.target.value as 'all' | 'registered' | 'guest')}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          >
            <option value="all">Todos los clientes</option>
            <option value="registered">Jugadores registrados</option>
            <option value="guest">Clientes ocasionales</option>
          </select>
        </div>

        <div>
          <label htmlFor="sales-payment-method" className="block text-sm font-medium text-gray-700 mb-1">Medio de pago</label>
          <select id="sales-payment-method" value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as SalesPaymentFilter)}
            className="w-full min-w-0 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500">
            <option value="all">Todos los medios</option>
            {salesPaymentMethods.map(method => <option key={method.id} value={method.id}>{method.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sales-date-from" className="block text-sm font-medium text-gray-700 mb-1">Fecha desde</label>
          <input id="sales-date-from" type="date" value={dateFrom} max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500" />
        </div>
        <div>
          <label htmlFor="sales-date-to" className="block text-sm font-medium text-gray-700 mb-1">Fecha hasta</label>
          <input id="sales-date-to" type="date" value={dateTo} min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-gray-600">{filteredSales.length} ventas y turnos encontrados. Las fechas incluyen ambos días.</p>
        <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setSearchTerm(''); setFilterType('all'); setPaymentFilter('all'); }}
          className="font-medium text-green-700 hover:text-green-800">Limpiar filtros</button>
      </div>
      {invalidPeriod && <p role="alert" className="text-sm text-red-600">La fecha desde debe ser anterior o igual a la fecha hasta.</p>}

      <section aria-label="Totales del período" className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Totales del período</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">Total del período</p>
            <p className="mt-1 text-xl font-bold text-green-800">{formatCurrency(summary.total)}</p>
          </div>
          {salesPaymentMethods.map(method => (
            <div key={method.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-600">{method.label}</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(summary.payments[method.id])}</p>
            </div>
          ))}
        </div>
        {summary.payments.unassigned > 0 && <p className="text-sm text-amber-800">Sin medio de pago registrado: {formatCurrency(summary.payments.unassigned)}</p>}
      </section>

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
              {filteredSales.map(sale => {
                const payments = getSalePaymentTotals(sale);
                return (
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
                      <div className="text-sm font-medium text-gray-900">{sale.distribution ? sale.distribution.participants.map(person => person.name).join(', ') : sale.customer.name}</div>
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
                      {formatCurrency(saleNetTotal(sale))}
                      {saleComplimentaryTotal(sale) > 0 && <span className="block text-xs font-normal text-amber-800">Bonificado: {formatCurrency(saleComplimentaryTotal(sale))}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      {salesPaymentMethods.filter(method => payments[method.id] > 0).map(method => (
                        <span key={method.id} className="block text-xs text-gray-700">
                          {method.label}: {formatCurrency(payments[method.id])}
                        </span>
                      ))}
                      {payments.unassigned > 0 && <span className="block text-xs text-amber-700">Sin medio: {formatCurrency(payments.unassigned)}</span>}
                    </div>
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
                      <ActionButton permission="sales.edit"
                        onClick={() => onEditSale(sale)}
                        className="inline-flex items-center px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                        title="Editar venta"
                      >
                        <Edit className="w-4 h-4" />
                      </ActionButton>
                    )}
                    <ActionButton permission="sales.delete"
                      onClick={() => onDeleteSale(sale.id)}
                      className="inline-flex items-center px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      title={sale.type === 'booking' ? 'No se pueden eliminar ventas de turnos' : 'Eliminar venta'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </ActionButton>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredSales.length === 0 && (
          <div className="text-center py-12">
            <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterType !== 'all' || paymentFilter !== 'all' || (dateFrom || dateTo) ? 'No se encontraron ventas' : 'No hay ventas o turnos registrados'}
            </h3>
            <p className="text-gray-600">
              {searchTerm || filterType !== 'all' || paymentFilter !== 'all' || (dateFrom || dateTo) ? 'Intenta con otros filtros' : 'Las ventas directas y turnos finalizados aparecerán aquí'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesList;
