import React, { useLayoutEffect, useRef, useState } from 'react';
import { LogIn, Eye, EyeOff, User, Lock } from 'lucide-react';
import { complexName, complexLogo } from '../config/complex';
import ThemeSwitch from './ThemeSwitch';

interface LoginFormProps {
  onLogin: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loading?: boolean;
  error?: string;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLogin, loading, error }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ width: 358.4, height: 560, scale: 0.8 });

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const fitLogin = () => {
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      if (!width || !height) return;
      const mobile = window.innerWidth < 768;
      const scale = mobile
        ? Math.min(1, (window.innerWidth - 24) / width)
        : Math.min(0.8, (window.innerWidth - 24) / width, (window.innerHeight - 24) / height);
      setLayout({ width: width * scale, height: height * scale, scale });
    };
    const observer = new ResizeObserver(fitLogin);
    observer.observe(card);
    window.addEventListener('resize', fitLogin);
    fitLogin();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fitLogin);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(formData.username, formData.password);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="login-screen min-h-dvh bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-3">
      <div className="relative shrink-0" style={{ width: layout.width, height: layout.height }}>
      <div ref={cardRef} className="login-card absolute left-0 top-0 origin-top-left bg-white rounded-2xl shadow-2xl p-8" style={{ transform: `scale(${layout.scale})` }}>
        <div className="mb-4 flex justify-end"><ThemeSwitch /></div>
        {/* Header */}
        <div className="text-center mb-8">
          {complexLogo ? (
            <h1 className="mb-4"><img src={complexLogo} alt={complexName} className={`mx-auto h-auto max-w-full object-contain ${complexName.toUpperCase() === 'PURA VIDA' ? 'w-52' : 'w-64 rounded-xl'}`} /></h1>
          ) : (
            <>
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{complexName}</h1>
            </>
          )}
          <p className="text-gray-600">Sistema de Gestión de Reservas</p>
          {import.meta.env.VITE_TEST_ENVIRONMENT === 'true' && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Entorno de pruebas · datos independientes de producción</p>}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3" role="alert">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Usuario
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="Tu usuario"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="Tu contraseña"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Iniciando sesión...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>Iniciar Sesión</span>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()} {complexName} - Sistema de Gestión
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default LoginForm;
