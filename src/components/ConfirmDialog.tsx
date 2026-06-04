import React from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  content?: React.ReactNode;
  type?: 'confirm' | 'success' | 'info' | 'error';
  confirmText?: string;
  cancelText?: string;
  maxWidth?: 'md' | '3xl';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  content,
  type = 'confirm',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  maxWidth = 'md',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'error':
        return <AlertTriangle className="w-6 h-6 text-red-600" />;
      case 'info':
        return <Info className="w-6 h-6 text-blue-600" />;
      default:
        return <AlertTriangle className="w-6 h-6 text-orange-600" />;
    }
  };

  const getColors = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          button: 'bg-green-600 hover:bg-green-700'
        };
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          button: 'bg-red-600 hover:bg-red-700'
        };
      case 'info':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          button: 'bg-blue-600 hover:bg-blue-700'
        };
      default:
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          button: 'bg-orange-600 hover:bg-orange-700'
        };
    }
  };

  const colors = getColors();
  const widthClass = maxWidth === '3xl' ? 'max-w-3xl' : 'max-w-md';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-xl shadow-2xl ${widthClass} w-full`}>
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            {getIcon()}
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          
          <div className={`p-4 rounded-lg ${colors.bg} ${colors.border} border mb-6`}>
            {content || <p className="text-gray-700 whitespace-pre-line">{message}</p>}
          </div>

          <div className="flex space-x-3">
            {type === 'confirm' && (
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-2 text-white rounded-lg font-medium transition-colors ${colors.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
