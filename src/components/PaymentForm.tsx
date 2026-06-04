import React, { useState } from 'react';
import { Save, X, CreditCard, DollarSign } from 'lucide-react';
import { PlayerProfile, CurrentAccountEntry } from '../types';
import { formatCurrency } from '../utils/timeSlots';
import { getArgentinaDateString, getArgentinaTimeString } from '../utils/date';
import { calculatePlayerBalance } from '../data/currentAccounts';

interface PaymentFormProps {
  player: PlayerProfile;
  currentBalance: number;
  onSave: (payment: Omit<CurrentAccountEntry, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ 
  player, 
  currentBalance, 
  onSave, 
  onCancel 
}) => {
  const [formData, setFormData] = useState({
    amount: Math.abs(currentBalance), // Sugerir pagar toda la deuda
    description: 'Pago cuenta corriente',
    paymentMethod: 'cash' as 'cash' | 'card' | 'transfer'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.amount <= 0) {
      alert('El monto debe ser mayor a cero');
      return;
    }

    const payment: Omit<CurrentAccountEntry, 'id' | 'createdAt'> = {
      playerId: player.id,
      type: 'credit',
      amount: formData.amount,
      description: formData.description,
      date: getArgentinaDateString(),
      time: getArgentinaTimeString(),
      paymentMethod: formData.paymentMethod
    };

    onSave(payment);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'amount' ? Number(value) : value
    }));
  };

  const newBalance = currentBalance + formData.amount;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                <CreditCard className="w-6 h-6 mr-2" />
                Registrar Pago
              </h2>
              <p className="text-gray-600">{player.name}</p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Current Balance */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700">Saldo actual</p>
                <p className="text-xl font-bold text-red-600">
                  Debe {formatCurrency(Math.abs(currentBalance))}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-red-500" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monto a Cobrar
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  required
                  min="0.01"
                  step="0.01"
                  className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="0.00"
                />
              </div>
              <div className="mt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, amount: Math.abs(currentBalance) }))}
                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors"
                >
                  Pagar todo ({formatCurrency(Math.abs(currentBalance))})
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, amount: Math.abs(currentBalance) / 2 }))}
                  className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
                >
                  Pagar mitad ({formatCurrency(Math.abs(currentBalance) / 2)})
                </button>
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Método de Pago
              </label>
              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
              >
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors resize-none"
                placeholder="Descripción del pago..."
              />
            </div>

            {/* New Balance Preview */}
            {formData.amount > 0 && (
              <div className={`p-4 rounded-lg border ${
                newBalance >= 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
              }`}>
                <p className="text-sm font-medium text-gray-700 mb-1">Nuevo saldo después del pago:</p>
                <p className={`text-lg font-bold ${
                  newBalance > 0 ? 'text-green-600' : 
                  newBalance < 0 ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {newBalance > 0 ? `A favor: ${formatCurrency(newBalance)}` :
                   newBalance < 0 ? `Debe: ${formatCurrency(Math.abs(newBalance))}` :
                   'Sin saldo'}
                </p>
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex space-x-3 pt-4">
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
                <span>Registrar Pago</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PaymentForm;
