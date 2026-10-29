import { supabase } from '../lib/supabase';
import type { ConsumableItem, StockMovement } from '../types';

export const stockService = {
  async configure(product: ConsumableItem, enabled: boolean, minimum: number, initialStock?: number) {
    // Fetch current commercial fields so configuring stock cannot overwrite a
    // price/name changed since this window was opened.
    const { data, error } = await supabase.from('consumables').select('*').eq('id', product.id).single();
    if (error) throw error;
    if (Boolean(data.stock_enabled) !== Boolean(product.stockEnabled)) {
      throw new Error('El control de stock cambió desde que abriste esta ventana. Cerrala y volvé a abrirla para actualizar los datos.');
    }
    return stockService.saveProduct({ id: data.id, name: data.name, description: data.description,
      price: data.price, category: data.category, available: data.available, icon: data.icon,
      stockEnabled: enabled, stockMinimum: minimum, initialStock });
  },
  async saveProduct(product: Omit<ConsumableItem, 'id'> & { id?: string }): Promise<ConsumableItem> {
    const { data, error } = await supabase.rpc('inventory_save_product', { target: product.id || null, payload: product });
    if (error) throw error;
    return { id: data.id, name: data.name, description: data.description, price: data.price,
      category: data.category, available: data.available, icon: data.icon,
      stockEnabled: data.stock_enabled, stockQuantity: data.stock_quantity, stockMinimum: data.stock_minimum };
  },
  async movements(id: string): Promise<StockMovement[]> {
    const { data, error } = await supabase.from('stock_movements').select('*').eq('product_id', id)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200);
    if (error) throw error;
    return (data || []) as StockMovement[];
  },
  async move(id: string, kind: string, quantity: number, reason: string) {
    const { error } = await supabase.rpc('inventory_move', { target: id, movement_kind: kind, amount: quantity, explanation: reason });
    if (error) throw error;
  },
  async cancel(resource: 'sales' | 'bookings', target: string, returnStock: boolean) {
    const { error } = await supabase.rpc('inventory_cancel', { resource, target, return_stock: returnStock });
    if (error) throw error;
  }
};
