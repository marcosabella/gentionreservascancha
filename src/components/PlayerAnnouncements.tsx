import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { playerAnnouncementsService, type PlayerAnnouncement } from '../services/playerAnnouncementsService';
import AnnouncementMessage from './AnnouncementMessage';

export default function PlayerAnnouncements({ userId }: { userId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<PlayerAnnouncement[]>([]);
  const [unread, setUnread] = useState(0);
  const [cursor, setCursor] = useState<PlayerAnnouncement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlayerAnnouncement | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const result = await playerAnnouncementsService.list(cursor);
      if (current !== sequence.current) return;
      setItems(result.items); setUnread(result.unreadCount); setError(null);
    } catch { if (current === sequence.current) setError('No se pudieron actualizar tus notificaciones.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [cursor]);
  useEffect(() => {
    void refresh();
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    const invalidate = () => { sequence.current++; };
    return () => { invalidate(); window.clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('online', update); document.removeEventListener('visibilitychange', update); };
  }, [userId, refresh]);
  useEffect(() => {
    const open = () => { setCursor(null); setSelected(null); if (!dialog.current?.open) dialog.current?.showModal(); void refresh(); };
    const url = new URL(window.location.href);
    if (url.searchParams.has('playerAnnouncement')) { open(); url.searchParams.delete('playerAnnouncement'); window.history.replaceState(window.history.state, '', url); }
    const onMessage = (event: MessageEvent) => { if (event.data?.type === 'OPEN_PLAYER_ANNOUNCEMENT') open(); };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => { navigator.serviceWorker?.removeEventListener('message', onMessage); };
  }, [refresh]);
  return <>
    <div className="mb-4 flex justify-end"><button type="button" onClick={() => { dialog.current?.showModal(); void refresh(); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><Bell className="h-5 w-5" />Notificaciones{unread > 0 && <span className="rounded-full bg-red-600 px-2 text-white">{unread}</span>}</button></div>
    <dialog ref={dialog} onClose={() => setSelected(null)} aria-labelledby="player-announcements-title" className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl backdrop:bg-black/50">
      <div className="mb-4 flex items-center justify-between"><h2 id="player-announcements-title" className="text-lg font-semibold">Notificaciones del club</h2><button type="button" aria-label="Cerrar notificaciones" onClick={() => dialog.current?.close()} className="p-2"><X className="h-5 w-5" /></button></div>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {selected ? <><button type="button" onClick={() => setSelected(null)} className="mb-4 min-h-11 text-sm text-blue-700">Volver a la bandeja</button><h3 className="break-words font-semibold">{selected.title}</h3><AnnouncementMessage body={selected.body} className="mt-3" /></> : <>
        <div className="mb-3 flex justify-between text-sm"><span>{unread} sin leer</span><button type="button" disabled={loading} onClick={() => void refresh()} className="text-blue-700">Actualizar</button></div>
        {!items.length && <p role="status" className="py-5 text-sm text-gray-500">{loading ? 'Cargando…' : 'No tenés notificaciones.'}</p>}
        <div className="space-y-2">{items.slice(0,30).map(item => <button key={item.id} type="button" className={`w-full rounded-lg border p-3 text-left ${item.read_at ? 'bg-white' : 'border-blue-200 bg-blue-50'}`} onClick={async () => {
          setSelected(item);
          if (!item.read_at) try { await playerAnnouncementsService.read(item.id); await refresh(); } catch { setError('No se pudo marcar el mensaje como leído.'); }
        }}><span className="block break-words font-medium">{item.title}{!item.read_at && <span className="ml-2 text-xs text-blue-700">Sin leer</span>}</span><span className="mt-1 block text-xs text-gray-500">{new Date(item.created_at).toLocaleString('es-AR')}</span></button>)}</div>
        <div className="mt-4 flex justify-between text-sm"><button disabled={!cursor || loading} type="button" onClick={() => setCursor(null)} className="min-h-11 text-blue-700 disabled:opacity-40">Más recientes</button>{items.length > 30 && <button type="button" disabled={loading} onClick={() => setCursor(items[29])} className="min-h-11 text-blue-700">Ver anteriores</button>}</div>
      </>}
    </dialog>
  </>;
}
