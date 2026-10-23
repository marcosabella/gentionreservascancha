import { useRef, useState, useSyncExternalStore } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { complexName } from '../config/complex';
import { isAppleMobile, pwaInstall } from '../utils/pwaInstall';

export default function InstallPlayerApp() {
  const state = useSyncExternalStore(pwaInstall.subscribe, pwaInstall.getSnapshot, pwaInstall.getServerSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const apple = typeof navigator !== 'undefined' && isAppleMobile(navigator);
  if (state.installed || typeof window !== 'undefined' && !window.isSecureContext) return null;

  const install = async () => {
    setError(null);
    if (state.canPrompt) {
      const outcome = await pwaInstall.install();
      if (outcome === 'accepted' || outcome === 'dismissed') { dialog.current?.close(); return; }
      if (outcome === 'error') setError('El navegador no pudo abrir la instalación. Podés seguir estos pasos.');
    }
    if (!dialog.current?.open) dialog.current?.showModal();
  };

  return <div className="mb-4 md:hidden">
    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-white p-3 shadow-sm">
      <Smartphone className="h-6 w-6 shrink-0 text-green-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">Llevá tus reservas en el celular</p>
        <p className="mt-0.5 text-xs text-gray-500">Accedé desde tu pantalla de inicio.</p>
      </div>
      {state.accepted ? <span role="status" className="max-w-28 text-xs text-green-700">El navegador está completando la instalación.</span>
        : <button type="button" onClick={() => void install()} disabled={state.prompting}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" />{state.prompting ? 'Instalando…' : 'Instalar app'}
        </button>}
    </div>

    <dialog ref={dialog} aria-labelledby="install-player-app-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl bg-white p-5 text-gray-900 shadow-2xl backdrop:bg-black/50">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id="install-player-app-title" className="text-lg font-semibold">Instalar {complexName}</h2>
        <button type="button" aria-label="Cerrar instrucciones de instalación" onClick={() => dialog.current?.close()} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
      {state.canPrompt && <button type="button" onClick={() => void install()} disabled={state.prompting} className="mb-4 min-h-[44px] w-full rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700">Instalar ahora</button>}
      <ol className="list-decimal space-y-3 pl-5 text-sm text-gray-700">
        {apple ? <>
          <li>Abrí esta página en Safari. Si entraste desde WhatsApp o Instagram, usá la opción de abrir en el navegador.</li>
          <li>Tocá <strong className="inline-flex items-center gap-1"><Share className="h-4 w-4" aria-hidden="true" />Compartir</strong> en el navegador.</li>
          <li>Elegí <strong>Agregar a pantalla de inicio</strong>. Si aparece, mantené activada la opción <strong>Abrir como app</strong>.</li>
          <li>Confirmá con <strong>Agregar</strong>.</li>
        </> : <>
          <li>Abrí esta página en Chrome o en el navegador habitual del celular. Si entraste desde otra app, abrí su menú y elegí abrir en el navegador.</li>
          <li>En el menú del navegador, buscá <strong>Instalar app</strong>, <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla principal</strong>.</li>
          <li>Confirmá la instalación. Si la opción todavía no aparece, dejá la página abierta unos segundos y volvé a intentar.</li>
        </>}
      </ol>
      <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">La app tendrá el icono de {complexName}. Necesitás Internet para consultar tus reservas y movimientos o realizar operaciones.</p>
      <button type="button" onClick={() => dialog.current?.close()} className="mt-4 min-h-[44px] w-full rounded-lg bg-gray-100 px-4 py-3 font-medium text-gray-700 hover:bg-gray-200">Entendido</button>
    </dialog>
  </div>;
}
