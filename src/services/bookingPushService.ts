import { supabase } from '../lib/supabase';

export interface PushSettings { publicKey: string; enabled: boolean; remindersEnabled: boolean; reminderMinutes: number }
const preferenceKey = `booking-push:${import.meta.env.VITE_SUPABASE_URL}:owner`;

export function pushOwner(): string | null {
  try { return localStorage.getItem(preferenceKey); } catch { return null; }
}
function rememberOwner(userId: string | null) {
  try {
    if (userId) localStorage.setItem(preferenceKey, userId);
    else localStorage.removeItem(preferenceKey);
  } catch { /* Server session binding still protects shared devices. */ }
}
export function supportsBookingPush() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}
export async function pushRegistration(): Promise<ServiceWorkerRegistration> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Recargá la app e intentá activar las notificaciones nuevamente.')), 10000); }),
    ]);
  } finally { clearTimeout(timeout); }
}
export const bookingPushService = {
  async testNotification() {
    if (!supportsBookingPush() || Notification.permission !== 'granted') {
      throw new Error('Permití las notificaciones de esta app antes de probar el aviso.');
    }
    const registration = await pushRegistration();
    await registration.showNotification('Prueba de notificaciones', {
      body: 'Este es un aviso de prueba de la app. Si lo ves, el dispositivo puede mostrar notificaciones.',
      tag: `booking-push-local-test-${Date.now()}`,
      data: { type: 'push-local-test' },
    });
  },
  async updateReminders(minutes: number, enabled: boolean) {
    const { error } = await supabase.rpc('update_booking_reminder_settings', { minutes_before: minutes, send_reminders: enabled });
    if (error) throw new Error('No se pudo guardar la configuración de recordatorios.');
  },
  async settings(): Promise<PushSettings | null> {
    const { data, error } = await supabase.rpc('booking_push_settings');
    if (error) throw new Error('No se pudo consultar el servicio de notificaciones.');
    return data;
  },
  async register(subscription: PushSubscription, userId: string) {
    const { error } = await supabase.rpc('register_booking_push', { subscription: subscription.toJSON() });
    if (error) throw new Error('No se pudo activar el envío al dispositivo. Volvé a intentar.');
    rememberOwner(userId);
  },
  async enable(userId: string, settings: PushSettings) {
    // Invoke permission directly from the button's user gesture (required on iOS).
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Para recibir avisos, permití las notificaciones en los ajustes del navegador o de la app.');
    const registration = await pushRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && pushOwner() !== userId) { await subscription.unsubscribe(); subscription = null; }
    const key = Uint8Array.from(atob(settings.publicKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    try { await this.register(subscription, userId); }
    catch (error) { await subscription.unsubscribe().catch(() => false); throw error; }
  },
  async disable() {
    if (!('serviceWorker' in navigator)) { rememberOwner(null); return; }
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription && supabase) {
      const { error } = await supabase.rpc('unregister_booking_push', { address: subscription.endpoint });
      if (error) {
        // Stop browser delivery even if the server cannot currently be reached.
        await subscription.unsubscribe();
        rememberOwner(null);
        throw new Error('Se desactivaron en el dispositivo; no se pudo actualizar el servidor.');
      }
    }
    if (subscription) await subscription.unsubscribe();
    rememberOwner(null);
  },
};
