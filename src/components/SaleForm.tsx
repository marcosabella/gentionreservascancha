import React, { useState } from 'react';
import { Save, X, Plus, Minus, Search, User, Users } from 'lucide-react';
import { Sale, SaleItem, ConsumableItem, PlayerProfile, ConsumableCategory } from '../types';
import { formatCurrency } from '../utils/timeSlots';
import { getArgentinaDateString, getArgentinaTimeString } from '../utils/date';
import PlayerSearchPopup from './PlayerSearchPopup';
import ConsumableSearchPopup from './ConsumableSearchPopup';

interface SaleFormProps {
  consumables: ConsumableItem[];
  categories: ConsumableCategory[];
  players: PlayerProfile[];
  sale?: Sale;
  onSave: (sale: Omit<Sale, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

const SaleForm: React.FC<SaleFormProps> = ({ 
  consumables, 
  categories,
  players, 
  sale,
  onSave, 
  onCancel 
}) => {
  const [formData, setFormData] = useState({
    customerType: (sale?.customerType || 'guest') as 'registered' | 'guest',
    customer: {
      id: sale?.customer.id,
      name: sale?.customer.name || 'Consumidor Final',
      email: sale?.customer.email || '',
      phone: sale?.customer.phone || ''
    },
    items: sale?.items || [] as SaleItem[],
    paymentMethod: (sale?.paymentMethod || 'cash') as 'cash' | 'card' | 'transfer' | 'current_account',
    notes: sale?.notes || ''
  });

  const [showPlayerSearch, setShowPlayerSearch] = useState(false);
  const [showConsumableSearch, setShowConsumableSearch] = useState(false);

  const totalAmount = formData.items.reduce((sum, item) => sum + item.subtotal, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.items.length === 0) {
      alert('Debe agregar al menos un producto');
      return;
    }

    if (!formData.customer.name.trim()) {
      alert('Debe ingresar el nombre del cliente');
      return;
    }

    const sale: Omit<Sale, 'id' | 'createdAt'> = {
      type: sale?.type || 'direct',
      date: sale?.date || getArgentinaDateString(),
      time: sale?.time || getArgentinaTimeString(),
      customerType: formData.customerType,
      customer: {
        id: formData.customerType === 'registered' ? formData.customer.id : undefined,
        name: formData.customer.name,
        email: formData.customer.email || undefined,
        phone: formData.customer.phone || undefined
      },
      items: formData.items,
      totalAmount,
      paymentMethod: formData.paymentMethod,
      notes: formData.notes || undefined,
      bookingId: sale?.bookingId,
      courtName: sale?.courtName
    };

    onSave(sale);
  };

  const handlePlayerSelect = (player: PlayerProfile) => {
    setFormData(prev => ({
      ...prev,
      customerType: 'registered',
      customer: {
        id: player.id,
        name: player.name,
        email: player.email,
        phone: player.phone
      }
    }));
    setShowPlayerSearch(false);
  };

  const handleResetToConsumidorFinal = () => {
    setFormData(prev => ({
      ...prev,
      customerType: 'guest',
      customer: {
        id: undefined,
        name: 'Consumidor Final',
        email: '',
        phone: ''
      }
    }));
  };
  const handleConsumableSelect = (consumable: ConsumableItem) => {
    const existingItem = formData.items.find(item => item.consumableId === consumable.id);

    if (existingItem) {
      // Increment quantity if item already exists
      updateItemQuantity(existingItem.id, existingItem.quantity + 1);
    } else {
      // Add new item
      const newItem: SaleItem = {
        id: Date.now().toString(),
        consumableId: consumable.id,
        name: consumable.name,
        price: consumable.price,
        quantity: 1,
        subtotal: consumable.price
      };

      setFormData(prev => ({
        ...prev,
        items: [...prev.items, newItem]
      }));
    }
    
    setShowConsumableSearch(false);
  };

  const updateItemQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }

    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId
          ? { ...item, quantity, subtotal: item.price * quantity }
          : item
      )
    }));
  };

  const removeItem = (itemId: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {sale ? 'Editar Venta' : 'Nueva Venta'}
              </h2>
              <button
                onClick={onCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Customer Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Información del Cliente</h3>
                
                {/* Cliente Actual */}
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {formData.customerType === 'registered' ? (
                        <Users className="w-6 h-6 text-blue-600" />
                      ) : (
                        <User className="w-6 h-6 text-gray-600" />
                      )}
                      <div>
                        <h4 className="font-medium text-gray-900">{formData.customer.name}</h4>
                        {formData.customerType === 'registered' && formData.customer.email && (
                          <p className="text-sm text-gray-600">{formData.customer.email}</p>
                        )}
                        {formData.customerType === 'registered' && formData.customer.phone && (
                          <p className="text-sm text-gray-500">{formData.customer.phone}</p>
                        )}
                        <p className="text-xs text-blue-600 font-medium">
                          {formData.customerType === 'registered' ? 'Jugador Registrado' : 'Consumidor Final'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2">
                      {formData.customerType === 'registered' && (
                        <button
                          type="button"
                          onClick={handleResetToConsumidorFinal}
                          className="px-3 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          Consumidor Final
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPlayerSearch(true)}
                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-1"
                      >
                        <Search className="w-4 h-4" />
                        <span>Buscar Cliente</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Products */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Productos</h3>
                
                <div>
                  <button
                    type="button"
                    onClick={() => setShowConsumableSearch(true)}
                    className="w-full flex items-center justify-center space-x-2 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
                  >
                    <Search className="w-5 h-5" />
                    <span>Buscar y Agregar Productos</span>
                  </button>
                </div>

                {/* Current Items */}
                {formData.items.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                    <Plus className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No hay productos agregados</p>
                    <p className="text-sm">Selecciona productos del menú superior</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.items.map(item => (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-gray-900">{item.name}</h4>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="text-red-500 hover:text-red-700 transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(item.id, parseInt(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors text-sm"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Precio unitario</label>
                            <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm">
                              {formatCurrency(item.price)}
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Subtotal</label>
                            <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium">
                              {formatCurrency(item.subtotal)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Método de Pago
                </label>
                <div className="grid grid-cols-3 gap-4">
                  <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash"
                      checked={formData.paymentMethod === 'cash'}
                      onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value as any }))}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium">Efectivo</span>
                  </label>
                  
                  <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="card"
                      checked={formData.paymentMethod === 'card'}
                      onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value as any }))}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium">Tarjeta</span>
                  </label>
                  
                  <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="transfer"
                      checked={formData.paymentMethod === 'transfer'}
                      onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value as any }))}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium">Transferencia</span>
                  </label>
                </div>
                
                {/* Cuenta Corriente solo para jugadores registrados */}
                {formData.customerType === 'registered' && formData.customer.id && (
                  <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 mt-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="current_account"
                      checked={formData.paymentMethod === 'current_account'}
                      onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value as any }))}
                      className="text-green-600 focus:ring-green-500"
                    />
                    <span className="font-medium">Cuenta Corriente</span>
                    <span className="text-sm text-gray-500">(Solo jugadores registrados)</span>
                  </label>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notas (Opcional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors resize-none"
                  placeholder="Observaciones adicionales..."
                />
              </div>

              {/* Total */}
              {totalAmount > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between text-xl font-bold text-green-600">
                    <span>Total:</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
              )}

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
                  <span>{sale ? 'Actualizar Venta' : 'Registrar Venta'}</span>
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
          selectedPlayers={[]}
          maxPlayers={1}
          onPlayerSelect={handlePlayerSelect}
          onPlayerDeselect={() => {}}
          onClose={() => setShowPlayerSearch(false)}
          onCreateNew={() => setShowPlayerSearch(false)}
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
    </>
  );
};

export default SaleForm;
