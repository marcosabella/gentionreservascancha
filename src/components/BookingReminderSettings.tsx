import { useEffect, useState } from 'react';
import { bookingPushService } from '../services/bookingPushService';

export default function BookingReminderSettings() {
  const [minutes, setMinutes] = useState('60');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let disposed = false;
    setLoading(true); setLoaded(false); setError(null);
    bookingPushService.settings().then(settings => {
      if (disposed) return;
      if (!settings) throw new Error('No se pudo cargar la configuración.');
      setMinutes(String(settings.reminderMinutes)); setEnabled(settings.remindersEnabled); setLoaded(true);
    }).catch(() => { if (!disposed) setError('No se pudo cargar la configuración de recordatorios.'); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [retry]);
  return <section className="mt-6 border-t border-gray-200 pt-5">
    <h3 className="font-semibold text-gray-900">Recordatorios de turnos para jugadores</h3>
    <p className="mt-1 text-sm text-gray-600">Elegí con cuánta anticipación reciben el recordatorio los jugadores que activaron las notificaciones.</p>
    <form className="mt-4 space-y-4" onSubmit={async event => {
      event.preventDefault();
      if (!loaded || saving) return;
      const value = Number(minutes);
      if (!Number.isInteger(value) || value < 5 || value > 1440) { setError('Ingresá entre 5 y 1440 minutos.'); return; }
      setSaving(true); setSaved(false); setError(null);
      try { await bookingPushService.updateReminders(value, enabled); setSaved(true); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); }
      finally { setSaving(false); }
    }}>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={loading || saving} onChange={event => { setEnabled(event.target.checked); setSaved(false); }} />Enviar recordatorios a los jugadores</label>
      <label className="block max-w-xs text-sm font-medium text-gray-700">Anticipación del recordatorio (minutos)
        <input type="number" min="5" max="1440" step="1" required value={minutes} disabled={loading || saving} onChange={event => { setMinutes(event.target.value); setSaved(false); }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <p className="text-xs text-gray-500">60 minutos = 1 hora · 120 minutos = 2 horas.</p>
      <button type="submit" disabled={loading || saving || !loaded} className="min-h-10 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar recordatorios'}</button>
      {saved && <p role="status" className="text-sm text-green-700">Configuración guardada.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Volver a cargar</button></p>}
    </form>
  </section>;
}
