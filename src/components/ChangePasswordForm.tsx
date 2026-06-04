import React, { useState } from 'react';
import { Save, X, Lock, Eye, EyeOff } from 'lucide-react';

interface ChangePasswordFormProps {
  onSave: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
}

const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({ onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.newPassword.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      alert('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    const result = await onSave(formData.newPassword);
    setLoading(false);

    if (result.success) {
      onCancel();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Lock className="w-6 h-6 mr-2" />
              Cambiar Contraseña
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nueva Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type={showPasswords ? 'text' : 'password'}
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleChange}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirmar Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type={showPasswords ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="Repite la contraseña"
                />
              </div>
            </div>

            {/* Password Strength Indicator */}
            {formData.newPassword && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    formData.newPassword.length >= 6 ? 'bg-green-500' : 'bg-gray-300'
                  }`}></div>
                  <span className="text-sm text-gray-600">Al menos 6 caracteres</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    formData.newPassword === formData.confirmPassword && formData.confirmPassword ? 'bg-green-500' : 'bg-gray-300'
                  }`}></div>
                  <span className="text-sm text-gray-600">Las contraseñas coinciden</span>
                </div>
              </div>
            )}

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
                disabled={loading}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Save className="w-5 h-5" />
                )}
                <span>Cambiar Contraseña</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordForm;