import { useEffect, useRef, useState } from 'react';
import { Search, Send, Trash2, Users } from 'lucide-react';
import { playerAnnouncementsService, type AnnouncementPlayer } from '../services/playerAnnouncementsService';
import AnnouncementPlayerSearch from './AnnouncementPlayerSearch';
import AnnouncementEditor from './AnnouncementEditor';

export default function PlayerAnnouncementSettings({ onSent }: { onSent?: () => void } = {}) {
  const [players, setPlayers] = useState<AnnouncementPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // Reuse a request after a network failure so a retry cannot duplicate a campaign.
  const request = useRef<{ payload: string; id: string } | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    let disposed = false;
    setLoading(true); setError(null);
    playerAnnouncementsService.audience().then(data => { if (!disposed) setPlayers(data); })
      .catch(() => { if (!disposed) { setPlayers([]); setError('No se pudieron cargar los destinatarios.'); } })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [retry]);
  const matches = players.filter(player => selectedIds.includes(player.id));
  const addPlayers = (ids: string[]) => setSelectedIds(previous => [...new Set([...previous, ...ids])]);
  const fieldClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2';
  return <section className="mt-6 border-t border-gray-200 pt-5">
    <h3 className="font-semibold text-gray-900">Enviar notificaciones a jugadores</h3>
    <p className="mt-1 text-sm text-gray-600">Agregá los destinatarios a la grilla. El mensaje queda en la bandeja de quienes tienen cuenta activa y también se envía por push a los dispositivos habilitados.</p>
    <form className="mt-4 space-y-4" onSubmit={async event => {
      event.preventDefault();
      if (busy.current || loading || !matches.length || !title.trim() || !body.trim()) return;
      busy.current = true; setSending(true); setError(null); setResult(null);
      const filter = { category: null, gender: null, player_id: null, player_ids: matches.map(player => player.id).sort() };
      const payload = JSON.stringify({ title: title.trim(), body: body.trim(), filter });
      if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
      try {
        const sent = await playerAnnouncementsService.send(request.current.id, title.trim(), body.trim(), filter);
        setResult(`Mensaje guardado en la bandeja de ${sent.players} jugador(es). Se solicitaron ${sent.devices} aviso(s) push. Consultá el estado en el historial.`);
        onSent?.();
        setTitle(''); setBody(''); request.current = null;
      } catch { setError('No se pudo confirmar el envío. Podés reintentar con el mismo mensaje sin duplicarlo.'); }
      finally { busy.current = false; setSending(false); }
    }}>
      <fieldset disabled={loading || sending} className="space-y-4 disabled:opacity-60">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSearchOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white"><Search className="h-4 w-4" />Buscar jugadores</button>
          <button type="button" onClick={() => addPlayers(players.map(player => player.id))} disabled={!players.length} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm"><Users className="h-4 w-4" />Agregar todos</button>
          <button type="button" disabled={!selectedIds.length} onClick={() => setSelectedIds([])} className="min-h-11 rounded-lg border px-4 py-2 text-sm text-red-700 disabled:opacity-50">Vaciar grilla</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm"><caption className="p-3 text-left font-semibold text-gray-900">Jugadores seleccionados ({matches.length})</caption><thead className="bg-gray-50 text-gray-600"><tr><th scope="col" className="px-3 py-2">Jugador</th><th scope="col" className="px-3 py-2">Categoría</th><th scope="col" className="px-3 py-2">Género</th><th scope="col" className="px-3 py-2">Push</th><th scope="col" className="px-3 py-2">Acciones</th></tr></thead>
            <tbody>{!matches.length ? <tr><td colSpan={5} className="p-5 text-center text-gray-500">{loading ? 'Cargando jugadores…' : 'No hay destinatarios. Usá Buscar jugadores o Agregar todos.'}</td></tr> : matches.map(player => <tr key={player.id} className="border-t"><td className="px-3 py-2">{player.name}</td><td className="px-3 py-2">{player.category ? `${player.category}ª` : 'Sin categoría'}</td><td className="px-3 py-2">{player.gender === 'masculino' ? 'Masculino' : player.gender === 'femenino' ? 'Femenino' : 'Sin género'}</td><td className="px-3 py-2">{player.push_devices} dispositivo(s)</td><td className="px-3 py-2"><button type="button" aria-label={`Quitar a ${player.name}`} onClick={() => setSelectedIds(previous => previous.filter(id => id !== player.id))} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Quitar</button></td></tr>)}</tbody>
          </table>
        </div>
        <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900" role="status">{matches.length} jugador(es) destinatario(s) · {matches.reduce((sum, player) => sum + player.push_devices, 0)} dispositivo(s) con push activo.<p className="mt-1">El envío incluye únicamente los jugadores de la grilla. En el buscador podés filtrar por categoría y género.</p></div>
        <label className="block text-sm font-medium">Título<input required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} className={fieldClass} /></label>
        <AnnouncementEditor value={body} onChange={setBody} />
        <button disabled={!matches.length || !title.trim() || !body.trim()} type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Enviando…' : `Enviar a ${matches.length} jugador(es)`}</button>
      </fieldset>
      {result && <p role="status" className="text-sm text-green-700">{result}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error} <button type="button" disabled={sending} onClick={() => setRetry(value => value + 1)} className="underline">Actualizar destinatarios</button></p>}
    </form>
    {searchOpen && <AnnouncementPlayerSearch players={players} addedIds={selectedIds} onAdd={addPlayers} onClose={() => setSearchOpen(false)} />}
  </section>;
}
