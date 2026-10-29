import React, { useContext, useEffect, useState } from 'react';
import { AccessContext, ActionButton } from '../config/AccessContext';
import { hasPermission } from '../config/permissions';
import { stockService } from '../services/stockService';
import type { ConsumableItem, StockMovement } from '../types';

const labels: Record<string, string> = { initial: 'Conteo inicial', disabled: 'Control desactivado', entry: 'Ingreso', loss: 'Pérdida', count: 'Conteo físico', consumption: 'Salida', return: 'Devolución' };
const message = (error: unknown) => String((error as { message?: string })?.message || 'No se pudo completar la operación');

export default function StockModal({ product, onClose, onChanged }: { product: ConsumableItem; onClose: () => void; onChanged: () => Promise<void> }) {
  const user = useContext(AccessContext);
  const canConfigure = hasPermission(user, 'products.stock') && hasPermission(user, 'products.edit');
  const [enabled, setEnabled] = useState(product.stockEnabled ?? false);
  const [minimum, setMinimum] = useState(String(product.stockMinimum ?? 0));
  const [initialStock, setInitialStock] = useState('');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [kind, setKind] = useState('entry');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setEnabled(product.stockEnabled ?? false);
    setMinimum(String(product.stockMinimum ?? 0));
    setInitialStock('');
  }, [product.id, product.stockEnabled, product.stockMinimum]);
  useEffect(() => {
    let active = true;
    stockService.movements(product.id).then(rows => { if (active) setMovements(rows); })
      .catch(err => { if (active) setError(message(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [product.id]);
  const saveConfiguration = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !canConfigure) return;
    const stockMinimum = Number(minimum);
    const count = enabled && !product.stockEnabled ? Number(initialStock) : undefined;
    if (minimum.trim() === '' || !Number.isSafeInteger(stockMinimum) || stockMinimum < 0 ||
      (count !== undefined && (initialStock.trim() === '' || !Number.isSafeInteger(count) || count < 0))) {
      setError('Ingresá cantidades enteras de unidades, iguales o mayores a cero.'); return;
    }
    try {
      setSaving(true); setError('');
      await stockService.configure(product, enabled, stockMinimum, count);
      await onChanged();
      setMovements(await stockService.movements(product.id));
    } catch (err) { setError(message(err)); }
    finally { setSaving(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const quantity = Number(amount);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || (kind !== 'count' && quantity === 0)) { setError('Ingresá una cantidad válida de unidades'); return; }
    try {
      setSaving(true); setError('');
      await stockService.move(product.id, kind, quantity, reason);
      setAmount(''); setReason('');
      setMovements(await stockService.movements(product.id));
      await onChanged();
    } catch (err) { setError(message(err)); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-label={`Stock de ${product.name}`}>
    <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
      <div className="flex justify-between gap-4"><h2 className="text-xl font-bold">Stock · {product.name}</h2><button disabled={saving} onClick={onClose} className="border rounded-lg px-3 py-1">Cerrar</button></div>
      <p>{product.stockEnabled ? `Existencias: ${product.stockQuantity ?? 0} unidades · Mínimo: ${product.stockMinimum ?? 0}` : 'Control de stock: NO. Podés seguir vendiendo sin cargar existencias.'}</p>
      {canConfigure && <form onSubmit={saveConfiguration} className="rounded-lg border border-gray-200 p-4 space-y-3">
        <h3 className="font-semibold">Control de stock</h3>
        <label className="block text-sm">Controlar stock
          <select value={String(enabled)} disabled={saving} onChange={e => setEnabled(e.target.value === 'true')} className="block mt-1 w-full border rounded-lg p-2">
            <option value="false">NO — vender sin control de existencias</option>
            <option value="true">SÍ — controlar existencias</option>
          </select>
        </label>
        {enabled && <div className="grid sm:grid-cols-2 gap-3">
          {!product.stockEnabled && <label className="text-sm">Stock inicial (unidades contadas)
            <input required type="number" min="0" step="1" value={initialStock} disabled={saving} onChange={e => setInitialStock(e.target.value)} className="block mt-1 w-full border rounded-lg p-2" />
          </label>}
          <label className="text-sm">Stock mínimo para alertas
            <input required type="number" min="0" step="1" value={minimum} disabled={saving} onChange={e => setMinimum(e.target.value)} className="block mt-1 w-full border rounded-lg p-2" />
          </label>
        </div>}
        {enabled && !product.stockEnabled && <p className="text-xs text-gray-500">Cargá el conteo físico actual. Las ventas anteriores no lo descuentan.</p>}
        {!enabled && product.stockEnabled && <p className="text-xs text-gray-500">Al desactivar, las ventas dejan de descontar existencias. El historial se conserva y al reactivar se pedirá un nuevo conteo.</p>}
        <button type="submit" disabled={saving} className="bg-green-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">{saving ? 'Guardando…' : enabled && !product.stockEnabled ? 'Activar control y cargar stock' : 'Guardar control de stock'}</button>
      </form>}
      {product.stockEnabled && <form onSubmit={submit} className="bg-gray-50 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">Cargar stock o registrar un ajuste</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">Movimiento<select value={kind} disabled={saving} onChange={e => setKind(e.target.value)} className="block mt-1 w-full border rounded-lg p-2"><option value="entry">Ingreso de mercadería</option><option value="loss">Pérdida / rotura</option><option value="count">Ajuste por conteo físico</option></select></label>
          <label className="text-sm">{kind === 'count' ? 'Cantidad real contada (nuevo saldo)' : 'Cantidad de unidades'}<input required type="number" min={kind === 'count' ? 0 : 1} step="1" value={amount} disabled={saving} onChange={e => setAmount(e.target.value)} className="block mt-1 w-full border rounded-lg p-2" /></label>
        </div>
        <label className="block text-sm">Motivo<input required minLength={3} maxLength={500} value={reason} disabled={saving} onChange={e => setReason(e.target.value)} placeholder="Ej.: reposición, rotura o diferencia de inventario" className="block mt-1 w-full border rounded-lg p-2" /></label>
        <ActionButton type="submit" permission="products.stock" disabled={saving} className="bg-green-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">{saving ? 'Guardando…' : 'Registrar movimiento'}</ActionButton>
      </form>}
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      <h3 className="font-semibold">Historial de movimientos</h3>
      <p className="text-xs text-gray-500">Últimos 200 movimientos. Las anulaciones solo reponen mercadería si se indica que fue devuelta.</p>
      {loading ? <p role="status">Cargando movimientos…</p> : movements.length === 0 ? <p className="text-gray-500">Sin movimientos registrados.</p> : <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b"><th className="p-2">Fecha / usuario</th><th className="p-2">Movimiento / motivo</th><th className="p-2">Cantidad</th><th className="p-2">Saldo</th></tr></thead><tbody>
        {movements.map(row => <tr key={row.id} className="border-b"><td className="p-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString('es-AR')}<div className="text-gray-500">{row.actor_name}</div></td><td className="p-2">{labels[row.kind] || row.kind}<div className="text-gray-500">{row.reason}</div>{row.source_id && <div className="text-xs text-gray-500">{row.source_kind === 'booking' ? 'Reserva' : 'Venta'}: {row.source_id}</div>}</td><td className={`p-2 font-medium ${row.quantity < 0 ? 'text-red-700' : 'text-green-700'}`}>{row.quantity > 0 ? '+' : ''}{row.quantity}</td><td className="p-2">{row.balance}</td></tr>)}
      </tbody></table></div>}
    </div>
  </div>;
}
