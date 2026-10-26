import React, { useState } from 'react';
import { Save, X, Plus, Minus, Search } from 'lucide-react';
import { Sale, SaleItem, SaleParticipant, SaleDistribution, ConsumableItem, PlayerProfile, ConsumableCategory } from '../types';
import { addSaleParticipant, getSaleShares, isFinalConsumer, saleParticipantAmounts, validateSaleDistribution } from '../utils/saleDistribution';
import { formatCurrency } from '../utils/timeSlots';
import { getArgentinaDateString, getArgentinaTimeString } from '../utils/date';
import PlayerSearchPopup from './PlayerSearchPopup';
import ConsumableSearchPopup from './ConsumableSearchPopup';
import { isCreditEnabled } from '../utils/playerCredit';

interface SaleFormProps {
  consumables: ConsumableItem[];
  categories: ConsumableCategory[];
  players: PlayerProfile[];
  sale?: Sale;
  onSave: (sale: Omit<Sale, 'id' | 'createdAt'>) => void | Promise<void>;
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
  const [isSaving, setIsSaving] = useState(false);
  const [participants, setParticipants] = useState<SaleParticipant[]>(() => sale?.distribution?.participants.map(person => ({ ...person, paymentMethod: person.paymentMethod || sale.paymentMethod })) || [{ id: sale?.customer.id || crypto.randomUUID(), name: sale?.customer.name || 'Consumidor Final', registered: sale?.customerType === 'registered', email: sale?.customer.email, phone: sale?.customer.phone, paymentMethod: sale?.paymentMethod || 'cash' }]);
  const [assignments, setAssignments] = useState<SaleDistribution['items']>(sale?.distribution?.items || []);
  const distribution = { participants, items: assignments };
  const shares = getSaleShares(formData.items, distribution);

  const addParticipant = (person: SaleParticipant) => {
    const next = addSaleParticipant(participants, person);
    const first = next[0];
    setFormData(previous => ({ ...previous, customerType: first.registered ? 'registered' : 'guest', customer: { id: first.registered ? first.id : undefined, name: first.name, email: first.email || '', phone: first.phone || '' } }));
    setParticipants(next);
    setAssignments(previous => previous.map(item => ({ ...item, assignedToPlayers: item.assignedToPlayers.filter(id => next.some(person => person.id === id)) })));
  };
  const removeParticipant = (id: string) => {
    const remaining = participants.filter(person => person.id !== id);
    setParticipants(remaining.length ? remaining : [{ id: crypto.randomUUID(), name: 'Consumidor Final', registered: false, paymentMethod: 'cash' }]);
    setAssignments(previous => previous.map(item => ({ ...item, assignedToPlayers: item.assignedToPlayers.filter(personId => personId !== id) })));
    if (!remaining.length) handleResetToConsumidorFinal();
    if (remaining.length) {
      const first = remaining[0];
      setFormData(previous => ({ ...previous, customerType: first.registered ? 'registered' : 'guest', customer: { id: first.registered ? first.id : undefined, name: first.name, email: first.email || '', phone: first.phone || '' } }));
    }
  };
  const updateAssignment = (consumableId: string, patch: Partial<SaleDistribution['items'][number]>) => {
    setAssignments(previous => {
      const row = previous.find(item => item.consumableId === consumableId) || { consumableId, splitBetweenPlayers: true, assignedToPlayers: [] };
      return [...previous.filter(item => item.consumableId !== consumableId), { ...row, ...patch }];
    });
  };

  const totalAmount = formData.items.reduce((sum, item) => sum + item.subtotal, 0);
  const complimentaryTotal = participants.reduce((sum, person) => sum + saleParticipantAmounts(person, shares[person.id] || 0).waived, 0);
  const setParticipantMethod = (id: string, method: SaleParticipant['paymentMethod']) => {
    setParticipants(previous => previous.map(person => person.id !== id ? person : { ...person, paymentMethod: method,
      complimentary: method === 'complimentary' ? { amount: shares[id] || 0, ...(person.complimentary?.reason ? { reason: person.complimentary.reason } : {}) } : person.paymentMethod === 'complimentary' ? undefined : person.complimentary }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSaving) return;
    
    if (formData.items.length === 0) {
      alert('Debe agregar al menos un producto');
      return;
    }

    if (!formData.customer.name.trim()) {
      alert('Debe ingresar el nombre del cliente');
      return;
    }

    if (participants.length) {
      const error = validateSaleDistribution(formData.items, distribution);
      if (error) { alert(error); return; }
      if (participants.some(person => person.paymentMethod === 'current_account' && (!person.registered || !isCreditEnabled(person.id, players)))) {
        alert('La cuenta corriente solo está disponible para jugadores habilitados.'); return;
      }
    }

    if (!participants.length && formData.paymentMethod === 'current_account' &&
      (formData.customerType !== 'registered' || !isCreditEnabled(formData.customer.id, players) &&
        !(sale?.paymentMethod === 'current_account' && sale.customer.id === formData.customer.id && totalAmount <= sale.totalAmount))) {
      alert('Este jugador no tiene cuenta corriente habilitada. Seleccioná otro medio de pago.');
      return;
    }

    const saleToSave: Omit<Sale, 'id' | 'createdAt'> = {
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
      distribution: participants.length ? { participants: participants.map(person => person.complimentary ? { ...person, complimentary: { ...person.complimentary, amount: saleParticipantAmounts(person, shares[person.id] || 0).waived } } : person), items: assignments.filter(row => formData.items.some(item => item.consumableId === row.consumableId)) } : { participants: [{ id: crypto.randomUUID(), name: 'Consumidor Final', registered: false, paymentMethod: 'cash' }], items: [] },
      totalAmount: Math.round(totalAmount * 100) / 100,
      paymentMethod: 'cash',
      notes: formData.notes || undefined,
      bookingId: sale?.bookingId,
      courtName: sale?.courtName
    };

    try {
      setIsSaving(true);
      await onSave(saleToSave);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlayerSelect = (player: PlayerProfile) => {
    addParticipant({ id: player.id, name: player.name, registered: true, email: player.email, phone: player.phone });
  };

  const handleResetToConsumidorFinal = () => {
    setFormData(prev => ({
      ...prev,
      customerType: 'guest',
      paymentMethod: 'cash',
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
        id: crypto.randomUUID(),
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
          ? { ...item, quantity, subtotal: Math.round(item.price * quantity * 100) / 100 }
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
        <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">Jugadores / clientes</h3>
                    <button type="button" onClick={() => setShowPlayerSearch(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Search className="h-4 w-4" />Agregar/buscar cliente</button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-gray-600"><tr><th className="p-3">Cliente / jugador</th><th className="p-3">Tipo</th><th className="p-3">Medio de pago</th><th className="p-3 text-right">Importe</th><th className="w-12 p-3"><span className="sr-only">Quitar</span></th></tr></thead>
                      <tbody className="divide-y">{participants.map(person => {
                        const amounts = saleParticipantAmounts(person, shares[person.id] || 0);
                        return <React.Fragment key={person.id}><tr>
                          <td className="p-3 font-medium">{person.name}</td><td className="p-3 text-gray-500">{person.registered ? 'Registrado' : 'Ocasional'}</td>
                          <td className="p-3"><select aria-label={'Medio de pago de ' + person.name} value={person.paymentMethod || 'cash'} onChange={event => setParticipantMethod(person.id, event.target.value as SaleParticipant['paymentMethod'])} className="w-full min-w-32 rounded-lg border p-2"><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="current_account" disabled={!person.registered || !isCreditEnabled(person.id, players)}>Cuenta Corriente</option>{!isFinalConsumer(person) && <option value="complimentary">Bonificado (sin cobro)</option>}</select>
                          </td>
                          <td className="p-3 text-right font-semibold">{formatCurrency(amounts.net)}{amounts.waived > 0 && <span className="block text-xs font-normal text-amber-800">Bonificado: {formatCurrency(amounts.waived)}</span>}</td>
                          <td className="p-3"><button type="button" aria-label={`Quitar a ${person.name}`} onClick={() => removeParticipant(person.id)}><X className="h-4 w-4 text-red-600" /></button></td>
                        </tr></React.Fragment>;
                      })}</tbody>
                    </table>
                    {!participants.length && <p className="p-3 text-sm text-gray-500">Agregá clientes para dividir consumibles. Sin selección, se registra a Consumidor Final.</p>}
                  </div>
                  {participants.length > 0 && <p className="text-xs text-gray-500">Cada cliente paga su parte con el medio elegido. Cuenta corriente disponible para jugadores habilitados.</p>}
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
                  <div role="region" aria-label="Productos de la venta" tabIndex={0} className="max-h-[40dvh] overflow-y-auto overscroll-contain rounded-lg border border-gray-200">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-gray-50 text-xs text-gray-600">
                        <tr>
                          <th scope="col" className="px-2 sm:px-3 py-3 font-semibold">Producto</th>
                          <th scope="col" className="w-20 sm:w-24 px-2 py-3 font-semibold">Cantidad</th>
                          <th scope="col" className="w-[23%] px-2 sm:px-3 py-3 text-right font-semibold">Precio unitario</th>
                          <th scope="col" className="w-[23%] px-2 sm:px-3 py-3 text-right font-semibold">Subtotal</th>
                          <th scope="col" className="w-10 px-2 py-3"><span className="sr-only">Quitar</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {formData.items.map(item => (
                          <React.Fragment key={item.id}><tr className="hover:bg-gray-50">
                            <td className="px-2 sm:px-3 py-3 font-medium text-gray-900 [overflow-wrap:anywhere]">{item.name}</td>
                            <td className="px-2 py-3">
                              <input
                                type="number"
                                aria-label={'Cantidad de ' + item.name}
                                min="1"
                                step="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const quantity = Number(e.target.value);
                                  if (Number.isInteger(quantity) && quantity >= 1) updateItemQuantity(item.id, quantity);
                                }}
                                className="w-full min-w-0 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                              />
                            </td>
                            <td className="px-2 sm:px-3 py-3 text-right text-gray-600 [overflow-wrap:anywhere]">{formatCurrency(item.price)}</td>
                            <td className="px-2 sm:px-3 py-3 text-right font-medium text-gray-900 [overflow-wrap:anywhere]">{formatCurrency(item.subtotal)}</td>
                            <td className="px-2 py-3">
                              <button type="button" onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-700 transition-colors" title={'Quitar ' + item.name}>
                                <Minus className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                          {participants.length > 0 && <tr><td colSpan={5} className="px-3 pb-3">
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={assignments.find(row => row.consumableId === item.consumableId)?.splitBetweenPlayers ?? true} onChange={event => updateAssignment(item.consumableId, { splitBetweenPlayers: event.target.checked })} />Dividir {item.name} entre todos</label>
                            {assignments.find(row => row.consumableId === item.consumableId)?.splitBetweenPlayers === false && <div className="mt-2 flex flex-wrap gap-3">{participants.map(person => {
                              const selected = assignments.find(row => row.consumableId === item.consumableId)?.assignedToPlayers || [];
                              return <label key={person.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(person.id)} onChange={event => updateAssignment(item.consumableId, { assignedToPlayers: event.target.checked ? [...selected, person.id] : selected.filter(id => id !== person.id) })} />{person.name}</label>;
                            })}</div>}
                          </td></tr>}</React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                    <span>Total a cobrar:</span>
                    <span>{formatCurrency(totalAmount - complimentaryTotal)}</span>
                  </div>
                </div>
              )}

              {complimentaryTotal > 0 && <div className="flex justify-between rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><span>Bonificado (sin ingreso ni deuda):</span><strong>{formatCurrency(complimentaryTotal)}</strong></div>}
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
                  disabled={isSaving}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <Save className="w-5 h-5" />
                  <span>{isSaving ? 'Guardando...' : sale ? 'Actualizar Venta' : 'Registrar Venta'}</span>
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
          title="Agregar/buscar cliente"
          onGuestAdd={(name) => addParticipant({ id: crypto.randomUUID(), name, registered: false })}
          selectedPlayers={participants.map(person => ({ ...person, paymentMethod: person.paymentMethod === 'complimentary' ? undefined : person.paymentMethod, email: person.email || '', phone: person.phone || '', isOrganizer: false }))}
          onPlayerSelect={handlePlayerSelect}
          onPlayerDeselect={removeParticipant}
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
