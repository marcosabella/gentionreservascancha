import { useState, useSyncExternalStore } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { pwaUpdates } from '../utils/pwaUpdates';

export default function AppUpdateNotice() {
  const available = useSyncExternalStore(pwaUpdates.subscribe, pwaUpdates.getSnapshot, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!available || dismissed) return null;

  return <aside role="status" aria-live="polite" aria-label="Actualización de la app"
    className="fixed bottom-4 left-4 right-4 z-[70] rounded-xl border border-green-200 bg-white p-4 shadow-xl sm:left-auto sm:w-96">
    <div className="flex items-start gap-3">
      <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-gray-900">Hay una nueva versión de la app</p>
        <p className="mt-1 text-gray-600">Guardá tus cambios y tocá Actualizar ahora para usarla.</p>
        <button type="button" onClick={() => window.location.reload()}
          className="mt-3 min-h-10 rounded-lg bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700">Actualizar ahora</button>
      </div>
      <button type="button" aria-label="Actualizar más tarde" onClick={() => setDismissed(true)}
        className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
    </div>
  </aside>;
}
