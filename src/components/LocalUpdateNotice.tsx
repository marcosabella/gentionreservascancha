import { useEffect, useState } from 'react';
import { CheckCircle, Download, RefreshCw, X } from 'lucide-react';

interface ReleaseInfo { version: string; publishedAt: string; notes: string[] }
interface LocalStatus {
  protocol: 1;
  app: 'padel-center';
  active: ReleaseInfo;
  latest: ReleaseInfo | null;
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'error';
  lastError: string | null;
  updatedAt: string | null;
  token: string;
}

const appVersion = import.meta.env.VITE_APP_VERSION as string | undefined;
const isLocal = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);
const storageKey = 'padel-center:last-update-notice';
function isLocalStatus(value: unknown): value is LocalStatus {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<LocalStatus>;
  const release = (item: unknown): item is ReleaseInfo => {
    if (!item || typeof item !== 'object') return false;
    const info = item as Partial<ReleaseInfo>;
    return typeof info.version === 'string' && typeof info.publishedAt === 'string'
      && Array.isArray(info.notes) && info.notes.every(note => typeof note === 'string');
  };
  return data.protocol === 1 && data.app === 'padel-center' && release(data.active)
    && (data.latest === null || release(data.latest)) && typeof data.token === 'string'
    && ['idle', 'checking', 'available', 'downloading', 'error'].includes(data.phase ?? '')
    && (data.updatedAt === null || typeof data.updatedAt === 'string')
    && (data.lastError === null || typeof data.lastError === 'string');
}

export default function LocalUpdateNotice() {
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try { return localStorage.getItem(storageKey); } catch { return null; }
  });
  const [busy, setBusy] = useState(false);
  const [hiddenOffer, setHiddenOffer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLocal() || !appVersion) return;
    let disposed = false;
    let inFlight = false;
    const refresh = async (check = false) => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch('/__local-update/status', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
        const initial: unknown = await response.json();
        if (!isLocalStatus(initial)) return;
        let value = initial;
        if (!disposed) setStatus(value);
        if (check) {
          const result = await fetch('/__local-update/check', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Update-Token': value.token }, body: '{}', signal: AbortSignal.timeout(40000) });
          if (result.ok) {
            const checked: unknown = await result.json();
            if (isLocalStatus(checked)) { value = checked; if (!disposed) setStatus(value); }
          }
        }
      } catch { /* An unavailable local updater must not block reservations or payments. */ }
      finally { inFlight = false; }
    };
    void refresh(true);
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    const check = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(true); }, 300000);
    const onFocus = () => { void refresh(true); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => { disposed = true; window.clearInterval(poll); window.clearInterval(check); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus); };
  }, []);

  if (!status || !appVersion) return null;
  const needsReload = status.active.version !== appVersion;
  const available = !needsReload && !!status.latest && status.latest.version !== status.active.version;
  const updating = busy || status.phase === 'downloading';
  const completed = !needsReload && !available && !!status.updatedAt && dismissed !== status.active.version;
  const offerKey = needsReload ? `reload:${status.active.version}` : `available:${status.latest?.version}`;
  if ((available || needsReload) && hiddenOffer === offerKey && !updating && !error) return null;
  if (!needsReload && !available && !updating && !completed && !error) return null;

  const apply = async () => {
    if (needsReload) { window.location.reload(); return; }
    if (!status.latest || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch('/__local-update/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Update-Token': status.token },
        body: JSON.stringify({ version: status.latest.version }), signal: AbortSignal.timeout(45000),
      });
      const value: unknown = await response.json();
      if (!isLocalStatus(value)) throw new Error('No se pudo comunicar con el actualizador local. Volvé a intentar.');
      const result = value;
      setStatus(result);
      if (!response.ok || result.active.version !== status.latest.version) throw new Error(result.lastError ?? 'No se pudo completar la actualización. Volvé a intentar.');
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar. Se conserva la versión actual.');
      setBusy(false);
    }
  };

  return <aside role="status" aria-live="polite" aria-label="Actualizaciones del sistema" className="fixed bottom-4 left-4 right-4 z-[70] rounded-xl border border-green-200 bg-white p-4 shadow-xl sm:left-auto sm:w-96">
    <div className="flex items-start gap-3">
      {updating ? <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-green-600" /> : completed ? <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" /> : <Download className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-gray-900">{updating ? 'Actualizando el sistema…' : completed ? 'El sistema se actualizó correctamente' : needsReload ? 'El sistema tiene una versión nueva' : 'Hay una actualización disponible'}</p>
        <p className="mt-1 text-gray-600">{updating ? 'Esperá a que termine la descarga y verificación.' : completed ? `Versión publicada el ${new Date(status.active.publishedAt).toLocaleDateString('es-AR')}.` : 'Guardá tus cambios antes de recargar. Tus datos guardados se conservan.'}</p>
        {completed && status.active.notes.map((note, i) => <p key={i} className="mt-1 text-gray-600">{note}</p>)}
        {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
        {(available || needsReload) && <button type="button" onClick={() => void apply()} disabled={updating} className="mt-3 min-h-10 rounded-lg bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50">{needsReload ? 'Recargar para usar la nueva versión' : 'Actualizar y recargar'}</button>}
      </div>
      {!updating && <button type="button" aria-label={completed ? 'Cerrar aviso de actualización' : 'Recordar la actualización más tarde'} onClick={() => {
        if (completed) {
          setDismissed(status.active.version);
          try { localStorage.setItem(storageKey, status.active.version); } catch { /* Optional preference. */ }
        } else { setHiddenOffer(offerKey); setError(null); }
      }} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>}
    </div>
  </aside>;
}
