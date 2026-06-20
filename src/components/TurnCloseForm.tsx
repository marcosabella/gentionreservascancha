import React, { useState } from 'react';
import { Save, X, Plus, Minus, Users, ShoppingCart, Calculator, Search } from 'lucide-react';
import { Booking, Player, Consumption, ConsumableItem, PlayerProfile, ConsumableCategory, Court, PaymentMethod } from '../types';
import { formatCurrency } from '../utils/timeSlots';
import PlayerSearchPopup from './PlayerSearchPopup';
import PlayerEditForm from './PlayerEditForm';
import ConsumableSearchPopup from './ConsumableSearchPopup';

interface TurnCloseFormProps {
  booking: Booking;
  courts: Court[];
  consumables: ConsumableItem[];
  categories: ConsumableCategory[];
  players: PlayerProfile[];
  onSave: (updatedBooking: Booking) => void;
  onPlayerSave: (player: Omit<PlayerProfile, 'id' | 'createdAt' | 'totalBookings' | 'lastBooking'> & { id?: string }) => void;
  onCancel: () => void;
}

const TurnCloseForm: React.FC<TurnCloseFormProps> = ({ 
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
  const [activeManagementTab, setActiveManagementTab] = useState<'players' | 'consumables'>('players');

  // Calcular el costo de la cancha basado en duración y precio por hora
  const court = courts.find(c => c.id === booking.courtId);
  const courtCost = court ? court.pricePerTurn : 0;
  
  const consumptionsCost = formData.consumptions.reduce((total, consumption) => 
    total + (consumption.price * consumption.quantity), 0);
  const finalTotal = courtCost + consumptionsCost;
  const paymentMethods: { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: 'Efectivo' },
    { value: 'card', label: 'Tarjeta' },
    { value: 'transfer', label: 'Transferencia' },
    { value: 'current_account', label: 'Cuenta Corriente' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.players.length === 0) {
      alert('Debe mantener al menos el jugador organizador');
      return;
    }

    // Verificar que todos los jugadores tengan método de pago seleccionado
    const playersWithInvalidPayments = formData.players.filter(player => {
      const expectedAmount = Math.round((playerCosts[player.id] || 0) * 100) / 100;
      const paidAmount = getPlayerPaymentTotal(player);
      return expectedAmount > 0 && Math.abs(paidAmount - expectedAmount) > 0.01;
    });

    if (playersWithInvalidPayments.length > 0) {
      alert(`Los pagos deben coincidir con el costo de cada jugador: ${playersWithInvalidPayments.map(p => p.name).join(', ')}`);
      return;
    }
    const updatedBooking: Booking = {
      ...booking,
      players: formData.players.map(player => {
        const paymentSplits = getPlayerPaymentSplits(player).filter(split => split.amount > 0);

        return {
          ...player,
          paymentSplits,
          paymentMethod: paymentSplits[0]?.method
        };
      }),
      consumptions: formData.consumptions,
      totalPrice: courtCost,
      finalTotal,
      status: 'completed',
      closedAt: new Date().toISOString()
    };
    
    onSave(updatedBooking);
  };

  const handlePlayerSelect = (playerProfile: PlayerProfile) => {
    const newPlayer: Player = {
      id: playerProfile.id,
      name: playerProfile.name,
      email: playerProfile.email,
      phone: playerProfile.phone,
      isOrganizer: false,
      paymentMethod: 'cash'
    };
    
    setFormData(prev => ({
      ...prev,
      players: [...prev.players, newPlayer]
    }));
  };
  
  const handlePlayerDeselect = (playerId: string) => {
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
    // No permitir eliminar al organizador
    const playerToRemove = formData.players.find(p => p.id === playerId);
    if (playerToRemove?.isOrganizer) {
      alert('No se puede eliminar al organizador de la reserva');
      return;
    }
    
    handlePlayerDeselect(playerId);
  };
  
  const handleNewPlayerSave = (playerData: Omit<PlayerProfile, 'id' | 'createdAt' | 'totalBookings' | 'lastBooking'> & { id?: string }) => {
    onPlayerSave(playerData);
    setShowPlayerForm(false);
    // El nuevo jugador se agregará automáticamente cuando se actualice la lista
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

  const calculatePlayerCosts = () => {
    const numPlayers = formData.players.length;
    if (numPlayers === 0) return {};

    const playerCosts: { [playerId: string]: number } = {};
    
    // Court cost divided equally
    const courtCostPerPlayer = courtCost / numPlayers;
    formData.players.forEach(player => {
      playerCosts[player.id] = courtCostPerPlayer;
    });

    // Add consumption costs
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

  const playerCosts = calculatePlayerCosts();
  const getPlayerPaymentSplits = (player: Player) => {
    if (player.paymentSplits && player.paymentSplits.length > 0) {
      return player.paymentSplits;
    }

    return player.paymentMethod
      ? [{ method: player.paymentMethod, amount: playerCosts[player.id] || 0 }]
      : [{ method: 'cash' as PaymentMethod, amount: playerCosts[player.id] || 0 }];
  };

  const getPlayerPaymentTotal = (player: Player) =>
    getPlayerPaymentSplits(player).reduce((total, split) => total + (Number(split.amount) || 0), 0);

  const updatePlayerPaymentSplit = (playerId: string, index: number, field: 'method' | 'amount', value: PaymentMethod | number) => {
    setFormData(prev => ({
      ...prev,
      players: prev.players.map(player => {
        if (player.id !== playerId) return player;

        const paymentSplits = getPlayerPaymentSplits(player).map((split, splitIndex) =>
          splitIndex === index ? { ...split, [field]: value } : split
        );

        return {
          ...player,
          paymentSplits,
          paymentMethod: paymentSplits.find(split => split.amount > 0)?.method || paymentSplits[0]?.method
        };
      })
    }));
  };

  const addPlayerPaymentSplit = (playerId: string) => {
    setFormData(prev => ({
      ...prev,
      players: prev.players.map(player =>
        player.id === playerId
          ? {
              ...player,
              paymentSplits: [...getPlayerPaymentSplits(player), { method: 'cash', amount: 0 }]
            }
          : player
      )
    }));
  };

  const removePlayerPaymentSplit = (playerId: string, index: number) => {
    setFormData(prev => ({
      ...prev,
      players: prev.players.map(player => {
        if (player.id !== playerId) return player;
        const paymentSplits = getPlayerPaymentSplits(player).filter((_, splitIndex) => splitIndex !== index);
        const normalizedSplits = paymentSplits.length > 0 ? paymentSplits : [{ method: 'cash' as PaymentMethod, amount: 0 }];

        return {
          ...player,
          paymentSplits: normalizedSplits,
          paymentMethod: normalizedSplits.find(split => split.amount > 0)?.method || normalizedSplits[0].method
        };
      })
    }));
  };

  const getPaymentMethodLabel = (method: PaymentMethod) =>
    paymentMethods.find(paymentMethod => paymentMethod.value === method)?.label || method;

  return (
    <>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Finalizar Turno</h2>
              <p className="text-gray-600">
                {booking.courtName} - {booking.date} - {booking.startTime} a {booking.endTime}
              </p>
            </div>
            <div className="text-sm text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
              Finalización y totales
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
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

            <div className="space-y-6">
            {/* Players Information */}
            {activeManagementTab === 'players' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Jugadores del Turno ({formData.players.length})
              </h3>
              
              {/* Add Players Button */}
              <button
                type="button"
                onClick={() => setShowPlayerSearch(true)}
                className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <Search className="w-5 h-5" />
                <span>Buscar y Agregar Jugadores</span>
              </button>
              
              {/* Current Players */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {formData.players.map((player) => (
                  <div key={player.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {player.name} {player.isOrganizer && '(Organizador)'}
                        </h4>
                        <p className="text-sm text-gray-600">{player.email || 'Sin email'}</p>
                        <p className="text-sm text-gray-500">{player.phone || 'Sin teléfono'}</p>
                      </div>
                      
                      {!player.isOrganizer && (
                        <button
                          type="button"
                          onClick={() => handleRemovePlayer(player.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                      
                      {player.isOrganizer && (
                        <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                          Organizador
                        </span>
                      )}
                    </div>
                    
                    {/* Payment Method Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Métodos de pago
                      </label>
                      <div className="space-y-2">
                        {getPlayerPaymentSplits(player).map((split, index) => (
                          <div key={`${player.id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_120px_32px] gap-2 items-center">
                            <select
                              value={split.method}
                              onChange={(e) => updatePlayerPaymentSplit(player.id, index, 'method', e.target.value as PaymentMethod)}
                              className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                            >
                              {paymentMethods.map(paymentMethod => (
                                <option key={paymentMethod.value} value={paymentMethod.value}>
                                  {paymentMethod.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={split.amount}
                              onChange={(e) => updatePlayerPaymentSplit(player.id, index, 'amount', Number(e.target.value))}
                              className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removePlayerPaymentSplit(player.id, index)}
                              className="h-9 w-8 flex items-center justify-center text-red-500 hover:text-red-700 disabled:text-gray-300"
                              disabled={getPlayerPaymentSplits(player).length === 1}
                              title="Quitar forma de pago"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => addPlayerPaymentSplit(player.id)}
                            className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-700"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Agregar pago</span>
                          </button>
                          <span className={Math.abs(getPlayerPaymentTotal(player) - (playerCosts[player.id] || 0)) <= 0.01 ? 'text-green-600' : 'text-orange-600'}>
                            {formatCurrency(getPlayerPaymentTotal(player))} / {formatCurrency(playerCosts[player.id] || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>


                ))}
              </div>
            </div>
            )}

            {/* Consumptions */}
            {activeManagementTab === 'consumables' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <ShoppingCart className="w-5 h-5 mr-2" />
                Gestionar Consumiciones
              </h3>
              
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>Nota:</strong> Aquí puedes agregar, modificar o quitar consumiciones antes de finalizar el turno.
                </p>
              </div>
              
              {/* Add Consumption */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowConsumableSearch(true)}
                  className="w-full flex items-center justify-center space-x-2 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  <Search className="w-5 h-5" />
                  <span>Buscar y Agregar Consumibles</span>
                </button>
              </div>

              {/* Current Consumptions */}
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
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Calculator className="w-5 h-5 mr-2" />
                Totales Finales
              </h3>
              
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Costo de cancha (reserva inicial):</span>
                  <span className="font-medium">{formatCurrency(courtCost)}</span>
                </div>
                {consumptionsCost > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Consumiciones:</span>
                    <span className="font-medium">{formatCurrency(consumptionsCost)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-lg font-bold text-green-600 border-t pt-2">
                  <span>Total Final:</span>
                  <span>{formatCurrency(finalTotal)}</span>
                </div>
              </div>
              
              {/* Player Cost Breakdown */}
              {formData.players.length > 0 && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Costo por jugador:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {formData.players.map(player => (
                      <div key={player.id} className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                          <span className="text-gray-700 font-medium">{player.name}</span>
                          <div className="text-xs text-gray-500">
                            {getPlayerPaymentSplits(player)
                              .filter(split => split.amount > 0)
                              .map(split => `${getPaymentMethodLabel(split.method)} ${formatCurrency(split.amount)}`)
                              .join(' + ') || 'Sin pagos cargados'}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-green-600">
                            {formatCurrency(playerCosts[player.id] || 0)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
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
                className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Save className="w-5 h-5" />
                <span>Finalizar Turno</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
    
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
    
    {/* Consumable Search Popup */}
    {showConsumableSearch && (
      <ConsumableSearchPopup
        consumables={consumables}
        categories={categories}
        onConsumableSelect={handleConsumableSelect}
        onClose={() => setShowConsumableSearch(false)}
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

export default TurnCloseForm;
