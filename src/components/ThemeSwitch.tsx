import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../config/ThemeContext';

export default function ThemeSwitch({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return <button type="button" role="switch" aria-label="Modo oscuro" aria-checked={dark}
    title={dark ? 'Cambiar al modo claro' : 'Cambiar al modo oscuro'} onClick={toggleTheme}
    className={`inline-flex min-h-[44px] items-center rounded-lg text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${compact ? 'justify-center py-1' : 'justify-between gap-3 px-3 py-2'} ${className}`}>
    {!compact && <span>Modo oscuro</span>}
    <span aria-hidden="true" className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${dark ? 'bg-green-600' : 'bg-gray-300'}`}>
      <span style={{ backgroundColor: '#fff' }} className={`absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full shadow-sm transition-transform motion-reduce:transition-none ${dark ? 'translate-x-5' : 'translate-x-0'}`}>
        {dark ? <Moon className="h-3 w-3" style={{ color: '#166534' }} /> : <Sun className="h-3 w-3 text-amber-600" />}
      </span>
    </span>
  </button>;
}
