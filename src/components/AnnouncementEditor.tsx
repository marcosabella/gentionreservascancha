import { useRef, useState } from 'react';
import AnnouncementMessage from './AnnouncementMessage';
import { announcementLimit } from '../../supabase/functions/_shared/announcementText';

const emojis = ['😀', '😊', '😍', '😎', '🥳', '💪', '👏', '👍', '❤️', '🎾', '🏆', '🥇', '🔥', '⭐', '🎉', '🎊', '📣', '📅', '⏰', '📍', '✅', '⚠️', '💬', '🙏'];

export default function AnnouncementEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [notice, setNotice] = useState('');
  function replace(start: number, end: number, text: string, selectionStart: number, selectionEnd: number) {
    const next = value.slice(0, start) + text + value.slice(end);
    if (next.length > announcementLimit) { setNotice('No hay espacio suficiente. El máximo es de 2000 caracteres, incluido el formato.'); return; }
    onChange(next); setNotice('');
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(selectionStart, selectionEnd); });
  }
  function format(mark: string) {
    const start = input.current?.selectionStart ?? value.length;
    const end = input.current?.selectionEnd ?? start;
    const selected = value.slice(start, end) || 'texto';
    const formatted = selected.split('\n').map(line => line.replace(/^(\s*(?:- )?)(\S[\s\S]*?)(\s*)$/, `$1${mark}$2${mark}$3`)).join('\n');
    replace(start, end, formatted, start, start + formatted.length);
  }
  function list() {
    const selectionStart = input.current?.selectionStart ?? 0;
    const start = selectionStart === 0 ? 0 : value.lastIndexOf('\n', selectionStart - 1) + 1;
    const selectionEnd = input.current?.selectionEnd ?? value.length;
    const newline = value.indexOf('\n', selectionEnd);
    const end = newline < 0 ? value.length : newline;
    const text = value.slice(start, end).split('\n').map(line => line.startsWith('- ') ? line : '- ' + line).join('\n');
    replace(start, end, text, start, start + text.length);
  }
  return <div className="space-y-2">
    <label htmlFor="announcement-message" className="block text-sm font-medium">Mensaje</label>
    <div role="group" aria-label="Formato del mensaje" className="flex flex-wrap gap-1">
      {([['Negrita', '**', 'font-bold'], ['Cursiva', '_', 'italic'], ['Subrayado', '__', 'underline'], ['Tachado', '~~', 'line-through']] as const).map(([label, mark, style]) => <button key={mark} type="button" onMouseDown={event => event.preventDefault()} onClick={() => format(mark)} className={`min-h-10 rounded-lg border px-3 text-sm ${style}`}>{label}</button>)}
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={list} className="min-h-10 rounded-lg border px-3 text-sm">Lista</button>
      <button type="button" aria-expanded={showEmojis} aria-controls="announcement-emojis" onClick={() => setShowEmojis(previous => !previous)} className="min-h-10 rounded-lg border px-3 text-sm">😊 Emojis</button>
    </div>
    <p className="text-xs text-gray-500">Podés usar emojis que no estén entre los sugeridos. Hacé clic en el título o mensaje y presioná <kbd className="rounded border bg-gray-50 px-1">Windows + .</kbd> para abrir el catálogo de emojis. En el celular, usá el botón de emojis del teclado. También podés copiar y pegar cualquier emoji.</p>
    {showEmojis && <div id="announcement-emojis" role="group" aria-label="Elegir emoji" className="flex flex-wrap gap-1 rounded-lg border bg-gray-50 p-2">{emojis.map(emoji => <button type="button" key={emoji} aria-label={`Insertar ${emoji}`} className="min-h-11 min-w-11 rounded-lg text-xl hover:bg-white" onMouseDown={event => event.preventDefault()} onClick={() => {
      const start = input.current?.selectionStart ?? value.length;
      replace(start, input.current?.selectionEnd ?? start, emoji, start + emoji.length, start + emoji.length);
    }}>{emoji}</button>)}</div>}
    <textarea id="announcement-message" ref={input} required maxLength={announcementLimit} rows={5} value={value} onChange={event => { onChange(event.target.value); setNotice(''); }} aria-describedby="announcement-message-help announcement-message-count" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
    <div id="announcement-message-count" className="text-xs text-gray-500">{value.length}/{announcementLimit}</div>
    <p id="announcement-message-help" className="text-xs text-gray-500">Seleccioná texto y aplicá un formato. También podés escribir o pegar emojis en el título y el mensaje.</p>
    {notice && <p role="status" className="text-sm text-amber-800">{notice}</p>}
    <div className="rounded-lg border bg-gray-50 p-3"><p className="mb-2 text-xs font-semibold text-gray-600">Vista previa en la bandeja</p>{value ? <AnnouncementMessage body={value} /> : <p className="text-sm text-gray-400">Tu mensaje aparecerá aquí.</p>}</div>
    <p className="text-xs text-gray-500">Los avisos push muestran texto y emojis. El formato se ve al abrir el mensaje en la app.</p>
  </div>;
}
