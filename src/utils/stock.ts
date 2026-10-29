import type { ConsumableItem } from '../types';

type StockLine = { consumableId?: string; id?: string; quantity: number };
// This is immediate feedback; the database independently validates and locks
// stock when saving, including simultaneous sales from different employees.
export function validateStock(products: ConsumableItem[], next: StockLine[], previous: StockLine[] = []): string | null {
  const quantity = (lines: StockLine[], id: string) => lines.reduce((sum, line) => {
    const key = line.consumableId || line.id || '';
    return key === id || key.startsWith(`${id}-`) ? sum + line.quantity : sum;
  }, 0);
  for (const product of products) {
    if (!product.stockEnabled) continue;
    const additional = quantity(next, product.id) - quantity(previous, product.id);
    if (additional > (product.stockQuantity ?? 0)) return `Stock insuficiente de «${product.name}»: disponible ${product.stockQuantity ?? 0}, solicitado ${additional}.`;
  }
  return null;
}
