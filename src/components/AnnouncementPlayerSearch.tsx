import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { filterAnnouncementPlayers, searchAnnouncementPlayers, type AnnouncementPlayer } from '../services/playerAnnouncementsService';

export default function AnnouncementPlayerSearch({ players, addedIds, onAdd, onClose }: {
  players: AnnouncementPlayer[]; addedIds: string[]; onAdd: (ids: string[]) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); }, []);
  const matches = searchAnnouncementPlayers(filterAnnouncementPlayers(players, {
    category: category ? Number(category) : null, gender: gender || null, player_id: null,
  }), search);
  const available = matches.filter(player => !addedIds.includes(player.id));
  const allSelected = available.length > 0 && available.every(player => selected.includes(player.id));
  const fieldClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2';
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="announcement-search-title"
    className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-2xl backdrop:bg-black/50 sm:p-6">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 id="announcement-search-title" className="text-lg font-semibold">Buscar jugadores</h2><button type="button" onClick={onClose} aria-label="Cerrar búsqueda de jugadores" className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
    <p className="mb-4 text-sm text-gray-600">Buscá por nombre, marcá los jugadores y agregalos a la grilla de destinatarios.</p>
    <label className="block text-sm font-medium">Nombre del jugador<input autoFocus type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Escribí un nombre o apellido" className={fieldClass} /></label>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Categoría<select value={category} onChange={event => setCategory(event.target.value)} className={fieldClass}><option value="">Todas las categorías</option>{[1,2,3,4,5,6,7,8].map(value => <option key={value} value={value}>{value}ª categoría</option>)}</select></label>
      <label className="text-sm font-medium">Género<select value={gender} onChange={event => setGender(event.target.value)} className={fieldClass}><option value="">Todos los géneros</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option></select></label>
    </div>
    <div className="my-4 flex flex-wrap items-center justify-between gap-2 text-sm"><span role="status">{matches.length} resultado(s) · {selected.length} por agregar</span><button type="button" disabled={!available.length} onClick={() => setSelected(previous => allSelected ? previous.filter(id => !available.some(player => player.id === id)) : [...new Set([...previous, ...available.map(player => player.id)])])} className="min-h-10 rounded-lg border px-3 text-green-700 disabled:opacity-50">{allSelected ? 'Desmarcar resultados' : 'Seleccionar resultados'}</button></div>
    <div className="max-h-[40dvh] overflow-y-auto rounded-lg border border-gray-200">
      {!matches.length && <p role="status" className="p-6 text-center text-sm text-gray-500">No hay jugadores con cuenta activa que coincidan con la búsqueda.</p>}
      {matches.map(player => {
        const added = addedIds.includes(player.id);
        return <label key={player.id} className={`flex cursor-pointer items-center gap-3 border-b p-3 last:border-b-0 ${added ? 'bg-gray-50 text-gray-500' : 'hover:bg-green-50'}`}>
          <input type="checkbox" checked={added || selected.includes(player.id)} disabled={added} onChange={event => setSelected(previous => event.target.checked ? [...new Set([...previous, player.id])] : previous.filter(id => id !== player.id))} className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{player.name}</span><span className="block text-xs text-gray-500">{player.category ? `${player.category}ª categoría` : 'Sin categoría'} · {player.gender === 'masculino' ? 'Masculino' : player.gender === 'femenino' ? 'Femenino' : 'Sin género'} · {player.push_devices} dispositivo(s) push</span></span>
          {added && <span className="text-xs">En la grilla</span>}
        </label>;
      })}
    </div>
    <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border px-4 text-sm">Cancelar</button><button type="button" disabled={!selected.length} onClick={() => { onAdd(selected); onClose(); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white disabled:opacity-50"><Plus className="h-4 w-4" />Agregar seleccionados ({selected.length})</button></div>
  </dialog>;
}
