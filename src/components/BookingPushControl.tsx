import { useEffect, useState } from 'react';
import { BellRing, Bell } from 'lucide-react';
import { bookingPushService, pushOwner, pushRegistration, supportsBookingPush, type PushSettings } from '../services/bookingPushService';
import { isAppleMobile } from '../utils/pwaInstall';

export default function BookingPushControl({ userId, isPlayer = false }: { userId: string; isPlayer?: boolean }) {
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testRequested, setTestRequested] = useState(false);
  const [testVisible, setTestVisible] = useState<boolean | null>(null);
  const needsInstall = isAppleMobile(navigator) && !(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone);
  const supported = supportsBookingPush();

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    const check = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        if (!supported || needsInstall) return;
        const config = await bookingPushService.settings();
        if (!disposed) { setSettings(config); setError(null); }
        if (!config?.enabled) return;
        const registration = await pushRegistration();
        const subscription = await registration.pushManager.getSubscription();
        const active = !!subscription && Notification.permission === 'granted' && pushOwner() === userId;
        if (active) await bookingPushService.register(subscription, userId);
        // A permission revoked in browser settings must not appear enabled.
        if (!disposed) setEnabled(active);
      } catch (cause) {
        if (!disposed) { setEnabled(false); setError(cause instanceof Error ? cause.message : 'No se pudieron verificar las notificaciones.'); }
      } finally { inFlight = false; if (!disposed) setChecking(false); }
    };
    void check();
    const onFocus = () => { void check(); };
    window.addEventListener('focus', onFocus);
    return () => { disposed = true; window.removeEventListener('focus', onFocus); };
  }, [userId, supported, needsInstall]);

  const toggle = async () => {
    if (busy || !settings?.enabled) return;
    setBusy(true); setError(null);
    try {
      if (enabled) { await bookingPushService.disable(); setEnabled(false); }
      else { await bookingPushService.enable(userId, settings); setEnabled(true); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron configurar las notificaciones.');
    } finally { setBusy(false); }
  };

  if (needsInstall) return <p className="max-w-xs text-xs text-gray-600">Para recibir avisos con la app cerrada, agregá esta app a la pantalla de inicio y abrila desde su ícono.</p>;
  if (!supported) return null;
  return <div className="max-w-xs text-left">
    <button type="button" onClick={() => void toggle()} disabled={checking || busy || testing || !settings?.enabled}
      aria-pressed={enabled} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm font-medium text-green-700 shadow-sm hover:bg-green-50 disabled:opacity-50">
      <BellRing className="h-5 w-5" />{busy ? 'Configurando…' : checking ? 'Verificando avisos…' : enabled ? 'Desactivar avisos al dispositivo' : 'Activar avisos al dispositivo'}
    </button>
    {enabled && <p className="mt-1 text-xs text-gray-600">{isPlayer ? 'Recibís mensajes del club y recordatorios de tus turnos aunque la app esté cerrada.' : 'Recibís avisos aunque la app esté cerrada.'}</p>}
    {enabled && <div className="mt-3 space-y-2">
      <button type="button" disabled={checking || busy || testing} onClick={async () => {
        setTesting(true); setError(null); setTestRequested(false); setTestVisible(null);
        try { await bookingPushService.testNotification(); setTestRequested(true); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear el aviso de prueba.'); }
        finally { setTesting(false); }
      }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 disabled:opacity-50"><Bell className="h-4 w-4" />{testing ? 'Probando aviso…' : 'Probar aviso en este dispositivo'}</button>
      <p className="text-xs text-gray-600">Esta prueba comprueba la visualización en este dispositivo. La recepción por Internet se verifica enviando un mensaje desde el administrador.</p>
      {testRequested && <div className="space-y-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
        <p role="status">El navegador aceptó crear el aviso. Revisá la barra de notificaciones del dispositivo.</p>
        <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={testVisible === true} onClick={() => setTestVisible(true)} className="min-h-10 rounded-lg border border-blue-200 bg-white px-3">Sí, apareció</button><button type="button" aria-pressed={testVisible === false} onClick={() => setTestVisible(false)} className="min-h-10 rounded-lg border border-blue-200 bg-white px-3">No apareció</button></div>
        {testVisible === true && <p role="status">El dispositivo puede mostrar avisos. Para comprobar la recepción, enviá una nueva notificación desde el administrador con esta app en segundo plano y la sesión abierta.</p>}
        {testVisible === false && <p role="status">Revisá los permisos en Ajustes del teléfono → Aplicaciones → Padel Center o Pura Vida → Notificaciones. Si el permiso depende de Chrome, revisá también sus notificaciones y los permisos del sitio. Verificá que los avisos no estén silenciados y que No molestar esté desactivado. Los nombres de los ajustes pueden variar según el teléfono.</p>}
      </div>}
    </div>}
    {!checking && !error && !settings?.enabled && <p className="mt-1 text-xs text-gray-600">El envío al dispositivo todavía no está disponible.</p>}
    {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
  </div>;
}
