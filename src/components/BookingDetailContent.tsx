import React from 'react';
import { Booking } from '../types';
import { calculatePlayerCost, formatCurrency, formatDate } from '../utils/timeSlots';

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
      default: return 'Sin metodo';
    }
  };

  const getPlayerPaymentLabel = (player: Booking['players'][number]) => {
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
        <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white">
          <div className="min-w-[680px] divide-y divide-gray-100">
            <div className="grid grid-cols-[minmax(190px,1.4fr)_minmax(130px,1fr)_minmax(150px,1fr)_minmax(120px,0.8fr)] gap-3 px-3 py-2 text-xs font-semibold uppercase text-gray-500">
              <span>Jugador</span>
              <span>Telefono</span>
              <span>Pago</span>
              <span className="text-right">Abonado</span>
            </div>
            {booking.players.map(player => (
              <div
                key={player.id}
                className="grid grid-cols-[minmax(190px,1.4fr)_minmax(130px,1fr)_minmax(150px,1fr)_minmax(120px,0.8fr)] gap-3 px-3 py-2 items-center whitespace-nowrap"
              >
                <span className="font-medium text-gray-900">
                  {player.name}
                  {player.isOrganizer && <span className="ml-2 text-xs font-normal text-blue-700">Organizador</span>}
                </span>
                <span>{player.phone || 'Sin telefono'}</span>
                <span>{getPlayerPaymentLabel(player)}</span>
                <span className="text-right font-medium">
                  {booking.status === 'completed' ? formatCurrency(playerCosts[player.id] || 0) : '-'}
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
        Total: {formatCurrency(booking.finalTotal || booking.totalPrice)}
      </div>
    </div>
  );
};

export default BookingDetailContent;
