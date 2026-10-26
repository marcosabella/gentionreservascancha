import React, { useState } from 'react';
import { Save, X, Plus, Minus, ShoppingCart, Users, Calendar, Clock, Search } from 'lucide-react';
import { Booking, Consumption, ConsumableItem, ConsumableCategory, Court, Player, PlayerProfile, PaymentSplit } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';
import ConsumableSearchPopup from './ConsumableSearchPopup';
import PlayerSearchPopup from './PlayerSearchPopup';
import PlayerEditForm from './PlayerEditForm';
import { isCreditEnabled, playersWithUnauthorizedCredit } from '../utils/playerCredit';
import { complimentaryAmount } from '../utils/bookingComplimentary';

type PaymentMethod = NonNullable<Player['paymentMethod']>;

interface BookingEditFormProps {
  booking: Booking;
  courts: Court[];
  consumables: ConsumableItem[];
  categories: ConsumableCategory[];
  players: PlayerProfile[];
  onSave: (updatedBooking: Booking) => void;
  onPlayerSave: (player: Omit<PlayerProfile, 'id' | 'createdAt' | 'totalBookings' | 'lastBooking'> & { id?: string }) => void;
  onCancel: () => void;
}

const BookingEditForm: React.FC<BookingEditFormProps> = ({
  booking,
  courts,
  consumables,
  categories,
  players,
  onSave,
  onPlayerSave,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    players: [...booking.players],
    consumptions: [...booking.consumptions]
  });
  const [activeManagementTab, setActiveManagementTab] = useState<'players' | 'consumables'>('players');
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [showConsumableSearch, setShowConsumableSearch] = useState(false);

  // Calcular el costo de la cancha basado en duración y precio por hora
  const court = courts.find(c => c.id === booking.courtId);
  const courtCost = court ? court.pricePerTurn : 0;
  
  const consumptionsCost = formData.consumptions.reduce((total, consumption) => 
    total + (consumption.price * consumption.quantity), 0);
  const newTotalPrice = courtCost + consumptionsCost;
  const isCompletedBooking = booking.status === 'completed';

  const calculatePlayerCosts = () => {
    const numPlayers = formData.players.length;
    if (numPlayers === 0) return {};

    const playerCosts: { [playerId: string]: number } = {};
    const courtCostPerPlayer = courtCost / numPlayers;

    formData.players.forEach(player => {
      playerCosts[player.id] = courtCostPerPlayer;
    });

    formData.consumptions.forEach(consumption => {
      const totalConsumptionCost = consumption.price * consumption.quantity;

      if (consumption.splitBetweenPlayers) {
        const costPerPlayer = totalConsumptionCost / numPlayers;
        formData.players.forEach(player => {
          playerCosts[player.id] += costPerPlayer;
        });
      } else if (consumption.assignedToPlayers && consumption.assignedToPlayers.length > 0) {
        const costPerPlayer = totalConsumptionCost / consumption.assignedToPlayers.length;
        consumption.assignedToPlayers.forEach(playerId => {
          if (playerCosts[playerId] !== undefined) {
            playerCosts[playerId] += costPerPlayer;
          }
        });
      }
    });

    return playerCosts;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.players.length === 0) {
      alert('Debe mantener al menos el jugador organizador');
      return;
    }

    if (isCompletedBooking) {
      const playerCosts = calculatePlayerCosts();
      const playersWithoutPayment = formData.players.filter(player =>
        (playerCosts[player.id] || 0) > complimentaryAmount(player) + 0.005 && !player.paymentMethod
      );
      if (playersWithoutPayment.length > 0) {
        alert(`Los siguientes jugadores necesitan un metodo de pago: ${playersWithoutPayment.map(player => player.name).join(', ')}`);
        return;
      }
    }

    const playerCosts = calculatePlayerCosts();
    if (formData.players.some(player => complimentaryAmount(player) > Math.round((playerCosts[player.id] || 0) * 100) / 100 + 0.01)) {
      alert('Revisá las bonificaciones: no pueden superar el importe del jugador.'); return;
    }
    
    const updatedBooking: Booking = {
      ...booking,
      players: isCompletedBooking
        ? formData.players.map(player => {
            const amount = Math.round((playerCosts[player.id] || 0) * 100) / 100;

            const paymentSplits = normalizeCompletedPlayerPaymentSplits(player, amount);
            return {
              ...player,
              paymentSplits,
              paymentMethod: paymentSplits.find(split => split.method !== 'complimentary')?.method as PaymentMethod | undefined
            };
          })
        : formData.players,
      consumptions: formData.consumptions,
      totalPrice: isCompletedBooking ? courtCost : newTotalPrice,
      finalTotal: isCompletedBooking ? newTotalPrice : booking.finalTotal
    };
    
    if (isCompletedBooking) {
      const blocked = playersWithUnauthorizedCredit(updatedBooking, booking, players);
      if (blocked.length) { alert(`Cuenta corriente deshabilitada: ${blocked.map(player => player.name).join(', ')}. Elegí otro medio de pago.`); return; }
    }
    onSave(updatedBooking);
  };

  const handlePlayerSelect = (playerProfile: PlayerProfile) => {
    const newPlayer: Player = {
      id: playerProfile.id,
      name: playerProfile.name,
      email: playerProfile.email,
      phone: playerProfile.phone,
      isOrganizer: false
    };

    setFormData(prev => ({
      ...prev,
      players: [...prev.players, newPlayer]
    }));
  };

  const handlePlayerDeselect = (playerId: string) => {
    const playerToRemove = formData.players.find(player => player.id === playerId);
    if (playerToRemove?.isOrganizer) {
      alert('No se puede eliminar al organizador de la reserva');
      return;
    }

    setFormData(prev => ({
      ...prev,
      players: prev.players.filter(player => player.id !== playerId),
      consumptions: prev.consumptions.map(consumption => ({
        ...consumption,
        assignedToPlayers: consumption.assignedToPlayers?.filter(id => id !== playerId)
      }))
    }));
  };

  const handleRemovePlayer = (playerId: string) => {
    handlePlayerDeselect(playerId);
  };

  const updatePlayerPaymentMethod = (playerId: string, paymentMethod: Player['paymentMethod']) => {
    setFormData(prev => ({
      ...prev,
      players: prev.players.map(player =>
        player.id === playerId ? { ...player, paymentMethod, paymentSplits: complimentaryAmount(player) > 0 ? [...(paymentMethod ? [{ method: paymentMethod, amount: Math.max(0, (calculatePlayerCosts()[playerId] || 0) - complimentaryAmount(player)) }] : []), ...(player.paymentSplits || []).filter(split => split.method === 'complimentary')] : undefined } : player
      )
    }));
  };

  const normalizeCompletedPlayerPaymentSplits = (player: Player, amount: number): PaymentSplit[] => {
    if ((!player.paymentMethod && complimentaryAmount(player) === 0) || amount <= 0) {
      return [];
    }

    const existingSplits = (player.paymentSplits || []).filter(split => split.amount > 0);
    if (existingSplits.length === 0) {
      return [{ method: player.paymentMethod || 'cash', amount }];
    }

    const currentTotal = existingSplits.reduce((total, split) => total + split.amount, 0);
    const difference = Math.round((amount - currentTotal) * 100) / 100;

    if (Math.abs(difference) < 0.01) {
      return existingSplits;
    }

    const targetMethod = existingSplits.some(split => split.method === 'current_account')
      ? 'current_account'
      : existingSplits.some(split => split.method === player.paymentMethod)
        ? player.paymentMethod || 'cash'
        : existingSplits.find(split => split.method !== 'complimentary')?.method || 'cash';
    const targetIndex = existingSplits.findIndex(split => split.method === targetMethod);

    if (targetIndex >= 0) {
      return existingSplits.map((split, index) =>
        index === targetIndex
          ? { ...split, amount: Math.max(0, Math.round((split.amount + difference) * 100) / 100) }
          : split
      ).filter(split => split.amount > 0);
    }

    return [...existingSplits, { method: targetMethod, amount: difference }];
  };

  const handleNewPlayerSave = (playerData: Omit<PlayerProfile, 'id' | 'createdAt' | 'totalBookings' | 'lastBooking'> & { id?: string }) => {
    onPlayerSave(playerData);
    setShowPlayerForm(false);
  };

  const handleConsumableSelect = (consumable: ConsumableItem) => {
    const newConsumption: Consumption = {
      id: `${consumable.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      consumableId: consumable.id,
      name: consumable.name,
      price: consumable.price,
      quantity: 1,
      category: consumable.category,
      splitBetweenPlayers: true
    };

    setFormData(prev => ({
      ...prev,
      consumptions: [...prev.consumptions, newConsumption]
    }));
    
    setShowConsumableSearch(false);
  };

  const updateConsumption = (consumptionId: string, field: keyof Consumption, value: any) => {
    setFormData(prev => ({
      ...prev,
      consumptions: prev.consumptions.map(consumption =>
        consumption.id === consumptionId ? { ...consumption, [field]: value } : consumption
      )
    }));
  };

  const removeConsumption = (consumptionId: string) => {
    setFormData(prev => ({
      ...prev,
      consumptions: prev.consumptions.filter(consumption => consumption.id !== consumptionId)
    }));
  };

  return (
    <>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Gestionar Reserva</h2>
              <p className="text-gray-600">Agregar o modificar jugadores y consumibles</p>
            </div>
            <div className="text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              Gestión de consumibles
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Booking Info */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Fecha</p>
                  <p className="font-medium">{formatDate(booking.date)}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Horario</p>
                  <p className="font-medium">{booking.startTime} - {booking.endTime}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Cancha</p>
                  <p className="font-medium">{booking.courtName}</p>
                </div>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t">
              <p className="text-sm text-gray-600">
                <strong>Organizador:</strong> {formData.players[0]?.name} ({formData.players[0]?.email})
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="border-b border-gray-200">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveManagementTab('players')}
                  className={`inline-flex items-center space-x-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors ${
                    activeManagementTab === 'players'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Jugadores ({formData.players.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveManagementTab('consumables')}
                  className={`inline-flex items-center space-x-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors ${
                    activeManagementTab === 'consumables'
                      ? 'border-green-600 text-green-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Consumibles ({formData.consumptions.length})</span>
                </button>
              </div>
            </div>

            {/* Players Management */}
            {activeManagementTab === 'players' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Jugadores del Turno ({formData.players.length})
              </h3>

              <button
                type="button"
                onClick={() => setShowPlayerSearch(true)}
                className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <Search className="w-5 h-5" />
                <span>Buscar y Agregar Jugadores</span>
              </button>

              <div role="region" aria-label="Jugadores de la reserva" tabIndex={0} className="max-h-[40dvh] overflow-y-auto overscroll-contain rounded-lg border border-gray-200">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th scope="col" className="px-3 py-3 font-semibold">Jugador</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Email</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Teléfono</th>
                      {isCompletedBooking && <th scope="col" className="px-3 py-3 font-semibold">Método de pago</th>}
                      <th scope="col" className="w-10 px-2 py-3"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {formData.players.map(player => (
                      <tr key={player.id} className="hover:bg-gray-50">
                        <td className="px-3 py-3 align-middle [overflow-wrap:anywhere]">
                          <span className="font-medium text-gray-900">{player.name}</span>
                          {player.isOrganizer && <span className="block mt-1 text-xs text-green-700">Organizador</span>}
                        </td>
                        <td className="px-3 py-3 align-middle text-gray-500 [overflow-wrap:anywhere]">{player.email || 'Sin email'}</td>
                        <td className="px-3 py-3 align-middle text-gray-500 [overflow-wrap:anywhere]">{player.phone || 'Sin teléfono'}</td>
                        {isCompletedBooking && (
                          <td className="px-3 py-3 align-middle">
                            <select
                              aria-label={'Método de pago de ' + player.name}
                              value={player.paymentMethod || ''}
                              onChange={(e) => updatePlayerPaymentMethod(player.id, e.target.value as Player['paymentMethod'])}
                              className="w-full min-w-0 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors text-sm"
                            >
                              <option value="">{complimentaryAmount(player) > 0 ? 'Bonificado sin cobro' : 'Seleccionar método'}</option>
                              <option value="cash">Efectivo</option>
                              <option value="card">Tarjeta</option>
                              <option value="transfer">Transferencia</option>
                              <option value="current_account" disabled={!isCreditEnabled(player.id, players)}>Cuenta Corriente{!isCreditEnabled(player.id, players) ? ' (deshabilitada)' : ''}</option>
                            </select>
                            {complimentaryAmount(player) > 0 && <p className="mt-1 text-xs text-amber-800">Bonificado: {formatCurrency(complimentaryAmount(player))}</p>}
                          </td>
                        )}
                        <td className="px-2 py-3 align-middle">
                          {!player.isOrganizer && (
                            <button type="button" onClick={() => handleRemovePlayer(player.id)} className="text-red-500 hover:text-red-700 transition-colors" title={'Quitar a ' + player.name}>
                              <X className="w-5 h-5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            )}

            {/* Consumptions Management */}
            {activeManagementTab === 'consumables' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <ShoppingCart className="w-5 h-5 mr-2" />
                Gestionar Consumiciones
              </h3>
              
              {/* Add Consumption */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowConsumableSearch(true)}
                  className="w-full flex items-center justify-center space-x-2 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span>Buscar y Agregar Consumibles</span>
                </button>
              </div>

              {/* Current Consumptions */}
              {formData.consumptions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No hay consumiciones agregadas</p>
                  <p className="text-sm">Selecciona productos del menú superior</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.consumptions.map(consumption => (
                    <div key={consumption.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900">{consumption.name}</h4>
                        <button
                          type="button"
                          onClick={() => removeConsumption(consumption.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
                          <input
                            type="number"
                            min="1"
                            value={consumption.quantity}
                            onChange={(e) => updateConsumption(consumption.id, 'quantity', parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors text-sm"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Precio unitario</label>
                          <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm">
                            {formatCurrency(consumption.price)}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Total</label>
                          <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium">
                            {formatCurrency(consumption.price * consumption.quantity)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-3">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={consumption.splitBetweenPlayers}
                            onChange={(e) => updateConsumption(consumption.id, 'splitBetweenPlayers', e.target.checked)}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <span className="text-sm text-gray-700">Dividir costo entre todos los jugadores</span>
                        </label>
                        
                        {!consumption.splitBetweenPlayers && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <h5 className="text-sm font-medium text-gray-700 mb-2">Asignar a jugadores específicos:</h5>
                            <div className="space-y-2">
                              {formData.players.map(player => (
                                <label key={player.id} className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    checked={consumption.assignedToPlayers?.includes(player.id) || false}
                                    onChange={(e) => {
                                      const currentAssigned = consumption.assignedToPlayers || [];
                                      const newAssigned = e.target.checked
                                        ? [...currentAssigned, player.id]
                                        : currentAssigned.filter(id => id !== player.id);
                                      updateConsumption(consumption.id, 'assignedToPlayers', newAssigned);
                                    }}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-700">{player.name}</span>
                                </label>
                              ))}
                            </div>
                            {consumption.assignedToPlayers && consumption.assignedToPlayers.length > 0 && (
                              <div className="mt-2 text-xs text-blue-600">
                                Costo por jugador: {formatCurrency((consumption.price * consumption.quantity) / consumption.assignedToPlayers.length)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            )}

            {/* Price Summary */}
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen de Costos</h3>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Costo de cancha:</span>
                  <span className="font-medium">{formatCurrency(courtCost)}</span>
                </div>
                {consumptionsCost > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Consumiciones:</span>
                    <span className="font-medium">{formatCurrency(consumptionsCost)}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-3">
                  <div className="flex items-center justify-between text-lg font-semibold">
                    <span>Total:</span>
                    <span className="text-green-600">{formatCurrency(newTotalPrice)}</span>
                  </div>
                </div>
              </div>
              
              {newTotalPrice !== booking.totalPrice && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <strong>Cambio:</strong> {formatCurrency(newTotalPrice - booking.totalPrice)} 
                    {newTotalPrice > booking.totalPrice ? ' (incremento)' : ' (reducción)'}
                  </p>
                </div>
              )}
            </div>

            {/* Submit Buttons */}
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Save className="w-5 h-5" />
                <span>Guardar Cambios</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    {/* Consumable Search Popup */}
    {showConsumableSearch && (
      <ConsumableSearchPopup
        consumables={consumables}
        categories={categories}
        onConsumableSelect={handleConsumableSelect}
        onClose={() => setShowConsumableSearch(false)}
      />
    )}

    {/* Player Search Popup */}
    {showPlayerSearch && (
      <PlayerSearchPopup
        players={players}
        selectedPlayers={formData.players}
        onPlayerSelect={handlePlayerSelect}
        onPlayerDeselect={handlePlayerDeselect}
        onClose={() => setShowPlayerSearch(false)}
        onCreateNew={() => {
          setShowPlayerSearch(false);
          setShowPlayerForm(true);
        }}
      />
    )}

    {/* Player Edit Form */}
    {showPlayerForm && (
      <PlayerEditForm
        onSave={handleNewPlayerSave}
        onCancel={() => setShowPlayerForm(false)}
      />
    )}
    </>
  );
};


export default BookingEditForm;
