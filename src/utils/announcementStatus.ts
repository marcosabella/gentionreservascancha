import type { AnnouncementDelivery, AnnouncementHistory } from '../services/playerAnnouncementsService';

export function announcementStatus(item: AnnouncementHistory): string {
  if (item.sending) return 'Procesando';
  if (item.queued) return 'En cola';
  if (item.untracked) return 'Sin registro completo';
  if (item.failed) return item.sent ? 'Enviado parcialmente' : 'Error de envío';
  return item.devices ? 'Enviado' : 'En bandeja (sin push)';
}
export const deliveryStatus = { queued: 'En cola', sending: 'Procesando', sent: 'Enviado', failed: 'Error de envío' };

export function deliveryDescription(item: AnnouncementDelivery): string {
  if (item.state === 'sent') return 'Aceptado por el servicio push.';
  if (item.state === 'sending') return 'El servicio está procesando el envío.';
  if (item.last_status === 404 || item.last_status === 410) return 'El dispositivo dejó de aceptar notificaciones. Debe volver a activarlas.';
  if (item.last_status === 409) return 'Envío cancelado: dispositivo desactivado, sesión cerrada o aviso vencido.';
  if (item.state === 'queued') return item.attempts ? 'Pendiente de reintento automático.' : 'Pendiente del primer intento.';
  if (item.last_status === 0) return 'No hubo respuesta del servicio push.';
  return item.last_status ? `El servicio push respondió con error ${item.last_status}.` : 'El envío no pudo completarse.';
}
