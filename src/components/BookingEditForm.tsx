import React, { useState } from 'react';
import { Save, X, Plus, Minus, ShoppingCart, Users, Calendar, Clock, Search } from 'lucide-react';
import { Booking, Consumption, ConsumableItem, ConsumableCategory, Court, Player, PlayerProfile } from '../types';
import { formatCurrency, formatDate } from '../utils/timeSlots';
import ConsumableSearchPopup from './ConsumableSearchPopup';
import PlayerSearchPopup from './PlayerSearchPopup';
import PlayerEditForm from './PlayerEditForm';

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
        (playerCosts[player.id] || 0) > 0 && !player.paymentMethod
      );
      if (playersWithoutPayment.length > 0) {
        alert(`Los siguientes jugadores necesitan un metodo de pago: ${playersWithoutPayment.map(player => player.name).join(', ')}`);
        return;
      }
    }

    const playerCosts = calculatePlayerCosts();
    
    const updatedBooking: Booking = {
      ...booking,
      players: isCompletedBooking
        ? formData.players.map(player => {
            const amount = Math.round((playerCosts[player.id] || 0) * 100) / 100;

            return {
              ...player,
              paymentSplits: normalizeCompletedPlayerPaymentSplits(player, amount)
            };
          })
        : formData.players,
      consumptions: formData.consumptions,
      totalPrice: isCompletedBooking ? courtCost : newTotalPrice,
      finalTotal: isCompletedBooking ? newTotalPrice : booking.finalTotal
    };
    
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
        player.id === playerId ? { ...player, paymentMethod, paymentSplits: undefined } : player
      )
    }));
  };

  const normalizeCompletedPlayerPaymentSplits = (player: Player, amount: number) => {
    if (!player.paymentMethod || amount <= 0) {
      return [];
    }

    const existingSplits = (player.paymentSplits || []).filter(split => split.amount > 0);
    if (existingSplits.length === 0) {
      return [{ method: player.paymentMethod, amount }];
    }

    const currentTotal = existingSplits.reduce((total, split) => total + split.amount, 0);
    const difference = Math.round((amount - currentTotal) * 100) / 100;

    if (Math.abs(difference) < 0.01) {
      return existingSplits;
    }

    const targetMethod: PaymentMethod = existingSplits.some(split => split.method === 'current_account')
      ? 'current_account'
      : existingSplits.some(split => split.method === player.paymentMethod)
        ? player.paymentMethod
        : existingSplits[0].method;
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
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
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
            {/* Players Management */}
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

              <div className="space-y-3">
                {formData.players.map(player => (
                  <div key={player.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {player.name} {player.isOrganizer && '(Organizador)'}
                        </h4>
                        <p className="text-sm text-gray-600">{player.email || 'Sin email'}</p>
                        <p className="text-sm text-gray-500">{player.phone || 'Sin telefono'}</p>
                        {isCompletedBooking && (
                          <div className="mt-3 max-w-xs">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Metodo de pago
                            </label>
                            <select
                              value={player.paymentMethod || ''}
                              onChange={(e) => updatePlayerPaymentMethod(player.id, e.target.value as Player['paymentMethod'])}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors text-sm"
                            >
                              <option value="">Seleccionar metodo</option>
                              <option value="cash">Efectivo</option>
                              <option value="card">Tarjeta</option>
                              <option value="transfer">Transferencia</option>
                              <option value="current_account">Cuenta Corriente</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {player.isOrganizer ? (
                        <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                          Organizador
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemovePlayer(player.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Quitar jugador"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Consumptions Management */}
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
