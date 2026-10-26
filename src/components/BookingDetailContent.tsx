import React from 'react';
import { Booking } from '../types';
import { calculatePlayerCost, formatCurrency, formatDate } from '../utils/timeSlots';
import { playerPaymentAmount } from '../utils/bookingPayments';
import { bookingNetTotal, bookingComplimentaryTotal } from '../utils/bookingComplimentary';

interface BookingDetailContentProps {
  booking: Booking;
  getStatusText: (status: string) => string;
}

const BookingDetailContent: React.FC<BookingDetailContentProps> = ({ booking, getStatusText }) => {
  const playerCosts = calculatePlayerCost(booking);

  const getPaymentMethodLabel = (method?: string) => {
    switch (method) {
      case 'cash': return 'Efectivo';
      case 'card': return 'Tarjeta';
      case 'transfer': return 'Transferencia';
      case 'current_account': return 'Cuenta Corriente';
      case 'complimentary': return 'Bonificado';
      default: return 'Sin metodo';
    }
  };

  const getPlayerPaymentLabel = (player: Booking['players'][number]) => {
    if (player.paymentSplits?.length === 0 || (!player.paymentSplits && !player.paymentMethod)) return 'Sin pago propio';
    if (player.paymentSplits && player.paymentSplits.length > 0) {
      return player.paymentSplits
        .filter(split => split.amount > 0)
        .map(split => `${getPaymentMethodLabel(split.method)} ${formatCurrency(split.amount)}`)
        .join(' + ');
    }

    return getPaymentMethodLabel(player.paymentMethod);
  };

  return (
    <div className="space-y-4 text-sm text-gray-700">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        <p><span className="font-semibold">Cancha:</span> {booking.courtName}</p>
        <p><span className="font-semibold">Fecha:</span> {formatDate(booking.date)}</p>
        <p><span className="font-semibold">Horario:</span> {booking.startTime} - {booking.endTime}</p>
        <p><span className="font-semibold">Estado:</span> {getStatusText(booking.status)}</p>
      </div>

      {booking.isRecurring && (
        <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-blue-800">
          <p className="font-semibold">Turno fijo</p>
          <p>Este turno se genera automaticamente cada semana.</p>
        </div>
      )}

      <div>
        <h4 className="mb-2 font-semibold text-gray-900">Jugadores ({booking.players.length})</h4>
        <div role="region" aria-label="Lista de jugadores de la reserva" tabIndex={0} className="max-h-[32dvh] overflow-y-auto overscroll-contain rounded-lg border border-blue-100 bg-white">
          <div className="w-full divide-y divide-gray-100">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-2 px-2 sm:gap-3 sm:px-3 py-2 text-xs font-semibold uppercase text-gray-500 sticky top-0 z-10 bg-white">
              <span>Jugador</span>
              <span>Teléfono</span>
              <span>Pago</span>
              <span className="text-right">Abonado</span>
            </div>
            {booking.players.map(player => (
              <div
                key={player.id}
                className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-2 px-2 sm:gap-3 sm:px-3 py-2 items-center [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere]"
              >
                <span className="font-medium text-gray-900">
                  {player.name}
                  {player.isOrganizer && <span className="block text-xs font-normal text-blue-700">Organizador</span>}
                </span>
                <span>{player.phone || 'Sin teléfono'}</span>
                <span>{getPlayerPaymentLabel(player)}{player.paymentSplits?.filter(split => split.method === 'complimentary').map((split, index) => <span key={index} className="block text-xs text-amber-800">{split.complimentaryFor === 'court' ? 'Cancha' : split.complimentaryFor === 'consumptions' ? 'Consumibles' : 'Bonificación'}: {split.reason}</span>)}</span>
                <span className="text-right font-medium">
                  {booking.status === 'completed' ? formatCurrency(playerPaymentAmount(player, playerCosts[player.id] || 0)) : '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 font-semibold text-gray-900">Consumiciones</h4>
        {booking.consumptions.length > 0 ? (
          <div className="space-y-1">
            {booking.consumptions.map(consumption => (
              <div key={consumption.id} className="flex justify-between gap-4">
                <span>{consumption.name} x{consumption.quantity}</span>
                <span className="font-medium">{formatCurrency(consumption.price * consumption.quantity)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p>Sin consumiciones</p>
        )}
      </div>

      <div className="border-t border-blue-200 pt-3 text-right text-base font-bold text-gray-900">
        {bookingComplimentaryTotal(booking) > 0 && <p className="text-sm font-medium text-amber-800">Bonificado: {formatCurrency(bookingComplimentaryTotal(booking))}</p>}
        Total a cobrar: {formatCurrency(bookingNetTotal(booking))}
      </div>
    </div>
  );
};

export default BookingDetailContent;
