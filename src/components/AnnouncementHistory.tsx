import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { playerAnnouncementsService, type AnnouncementDelivery, type AnnouncementHistory as HistoryItem } from '../services/playerAnnouncementsService';
import { announcementStatus, deliveryDescription, deliveryStatus } from '../utils/announcementStatus';
import AnnouncementMessage from './AnnouncementMessage';

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—';
const statusClass = (state: string) => state === 'Enviado' ? 'bg-green-100 text-green-800' : state.includes('Error') || state.includes('parcialmente') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-900';

export default function AnnouncementHistory({ version, active = true }: { version: number; active?: boolean }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<HistoryItem | null>(null);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [deliveries, setDeliveries] = useState<AnnouncementDelivery[]>([]);
  const [deliveryCursor, setDeliveryCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const detailRequest = useRef(0);
  const selectedId = selected?.id;
  const refresh = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    try {
      const data = await playerAnnouncementsService.history(cursor);
      if (current !== request.current) return;
      setItems(data); setError(null);
      setSelected(previous => previous ? data.find(item => item.id === previous.id) ?? previous : null);
    } catch { if (current === request.current) setError('No se pudo actualizar el historial.'); }
    finally { if (current === request.current) setLoading(false); }
  }, [cursor]);
  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    const current = ++detailRequest.current;
    setDetailLoading(true);
    try {
      const data = await playerAnnouncementsService.deliveries(selectedId, deliveryCursor);
      if (current !== detailRequest.current) return;
      setDeliveries(data); setDetailError(null);
    } catch { if (current === detailRequest.current) setDetailError('No se pudieron actualizar los estados por dispositivo.'); }
    finally { if (current === detailRequest.current) setDetailLoading(false); }
  }, [selectedId, deliveryCursor]);
  useEffect(() => { setCursor(null); }, [version]);
  useEffect(() => {
    if (!active) return;
    void refresh();
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(update, 10000);
    window.addEventListener('focus', update);
    const invalidate = () => { request.current++; };
    return () => { invalidate(); window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh, version, active]);
  useEffect(() => {
    if (!active) return;
    void refreshDetail();
    if (!selectedId) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshDetail(); }, 10000);
    const invalidate = () => { detailRequest.current++; };
    return () => { invalidate(); window.clearInterval(timer); };
  }, [refreshDetail, selectedId, active]);
  const counts = (item: HistoryItem) => <span className="block text-xs text-gray-600">En cola: {item.queued} · Procesando: {item.sending} · Enviados: {item.sent} · Errores: {item.failed}{item.untracked > 0 && ` · Sin registro: ${item.untracked}`}</span>;
  return <section className="mt-8 border-t border-gray-200 pt-5" aria-labelledby="announcement-history-title">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="announcement-history-title" className="font-semibold text-gray-900">Historial de notificaciones enviadas</h3><button type="button" disabled={loading} onClick={() => void refresh()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar historial</button></div>
    <p className="my-3 text-xs text-gray-600">Actualización automática cada 10 segundos. «Enviado» confirma que el servicio push aceptó el aviso; la columna «Leídos» registra la apertura del mensaje en la bandeja.</p>
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th scope="col" className="p-3">Fecha y mensaje</th><th scope="col" className="p-3">Destinatarios</th><th scope="col" className="p-3">Estado push</th><th scope="col" className="p-3">Detalle</th></tr></thead><tbody>
      {!items.length && <tr><td colSpan={4} role="status" className="p-5 text-center text-gray-500">{loading ? 'Cargando historial…' : error ? 'Actualizá para volver a intentar.' : 'Todavía no hay notificaciones enviadas.'}</td></tr>}
      {items.slice(0,20).map(item => <tr key={item.id} className="border-t align-top"><td className="p-3"><span className="block text-xs text-gray-500">{dateTime(item.created_at)}</span><span className="block break-words font-medium">{item.title}</span><span className="text-xs text-gray-500">Por {item.sender}</span></td><td className="p-3"><span className="block">{item.players} jugador(es) en bandeja</span><span className="block text-xs text-gray-600">{item.devices} dispositivo(s) push · Leídos: {item.read_players}</span></td><td className="space-y-2 p-3"><span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${statusClass(announcementStatus(item))}`}>{announcementStatus(item)}</span>{counts(item)}</td><td className="p-3"><button type="button" onClick={() => { setDeliveries([]); setDetailError(null); setDeliveryCursor(null); setSelected(item); dialog.current?.showModal(); }} className="min-h-10 whitespace-nowrap rounded-lg border px-3 text-blue-700">Ver detalle</button></td></tr>)}
    </tbody></table></div>
    <div className="mt-3 flex justify-between text-sm"><button type="button" disabled={!cursor || loading} onClick={() => setCursor(null)} className="min-h-10 text-blue-700 disabled:opacity-40">Más recientes</button>{items.length>20 && <button type="button" disabled={loading} onClick={() => setCursor(items[19])} className="min-h-10 text-blue-700">Ver anteriores</button>}</div>
    <dialog ref={dialog} onClose={() => { setSelected(null); setDeliveries([]); }} aria-labelledby="announcement-history-detail-title" className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl backdrop:bg-black/50">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="announcement-history-detail-title" className="text-lg font-semibold">Detalle del envío</h2><button type="button" aria-label="Cerrar detalle del envío" onClick={() => dialog.current?.close()} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
      {selected && <><p className="text-xs text-gray-500">{dateTime(selected.created_at)} · {selected.sender}</p><h3 className="mt-2 break-words font-semibold">{selected.title}</h3><AnnouncementMessage body={selected.body} className="my-3" /><p className="mb-2 text-sm">{selected.players} jugador(es) en bandeja · {selected.read_players} leído(s) · {selected.devices} dispositivo(s) push</p>{counts(selected)}
        {selected.untracked>0 && <p className="my-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Hay {selected.untracked} dispositivo(s) de envíos anteriores sin registro de estado disponible. No se puede confirmar su resultado.</p>}
        <div className="my-4 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Estado por dispositivo</h4><button type="button" disabled={detailLoading} onClick={() => { void refresh(); void refreshDetail(); }} className="min-h-10 rounded-lg border px-3 text-sm disabled:opacity-50">Actualizar estados</button></div>
        {detailError && <p role="alert" className="mb-3 text-sm text-red-700">{detailError}</p>}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th scope="col" className="p-2">Jugador / dispositivo</th><th scope="col" className="p-2">Estado</th><th scope="col" className="p-2">Intentos</th><th scope="col" className="p-2">Fecha / próximo intento</th></tr></thead><tbody>{!deliveries.length && <tr><td colSpan={4} role="status" className="p-4 text-gray-500">{detailLoading ? 'Cargando estados…' : selected.devices ? 'No hay registros disponibles en esta página.' : 'Sin dispositivos push. El mensaje está disponible en la bandeja de los jugadores.'}</td></tr>}{deliveries.slice(0,30).map(item => <tr key={item.id} className="border-t align-top"><td className="p-2"><span className="block">{item.player_name}</span><span className="text-xs text-gray-500">Dispositivo {item.id.slice(0,8)}</span></td><td className="p-2"><span className={`inline-block rounded-full px-2 py-1 text-xs ${statusClass(deliveryStatus[item.state])}`}>{deliveryStatus[item.state]}</span><span className="mt-1 block max-w-xs text-xs text-gray-600">{deliveryDescription(item)}</span></td><td className="p-2">{item.attempts}</td><td className="p-2 text-xs">{item.state==='queued' || item.state==='sending' ? <>Próximo intento: {dateTime(item.next_attempt_at)}</> : dateTime(item.finished_at)}</td></tr>)}</tbody></table></div>
        <div className="mt-3 flex justify-between text-sm"><button type="button" disabled={!deliveryCursor || detailLoading} onClick={() => { setDeliveries([]); setDeliveryCursor(null); }} className="min-h-10 text-blue-700 disabled:opacity-40">Primeros dispositivos</button>{deliveries.length>30 && <button type="button" disabled={detailLoading} onClick={() => { setDeliveries([]); setDeliveryCursor(deliveries[29].id); }} className="min-h-10 text-blue-700">Más dispositivos</button>}</div>
      </>}
    </dialog>
  </section>;
}
