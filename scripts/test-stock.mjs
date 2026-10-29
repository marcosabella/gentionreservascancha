import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.on('uncaughtException', error => { console.error(error.message, error.where || ''); process.exit(1); });
// Isolated PostgreSQL (WASM). Install with:
// npm install --prefix tmp/stock-test --no-save --package-lock=false @electric-sql/pglite
const { PGlite } = await import('../tmp/stock-test/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, phone text, created_at timestamptz, last_sign_in_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}', encrypted_password text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}') $$;`);
await db.exec(readFileSync('supabase/pura-vida-public-schema.sql','utf8'));
const migrations = [
  '20261019120000_employee_permissions', '20261019160000_cash_management',
  '20261019170000_cash_management_controls', '20261019180000_cash_sales_atomic',
  '20261019190000_player_current_account', '20261019200000_secure_user_profiles', '20261022120000_cash_movement_details', '20261023120000_cash_movement_source_name',
  '20261023160000_cash_zero_player_payments', '20261026120000_shared_direct_sales',
  '20261026150000_booking_complimentary', '20261026170000_direct_sale_complimentary',
  '20261026180000_complimentary_reason_optional'
];
for (const name of migrations) {
  try { await db.exec(readFileSync(`supabase/migrations/${name}.sql`, 'utf8')); }
  catch (err) { throw new Error(`Migration ${name}: ${err.message}`); }
}
const stockMigration = readFileSync('supabase/migrations/20261029120000_product_stock.sql', 'utf8');
// Seed receipts before migration, to verify the baseline is preserved.
await db.exec(`INSERT INTO auth.users(id) VALUES('10000000-0000-0000-0000-000000000001');
INSERT INTO public.user_profiles(id,username,password_hash,role,is_active) VALUES ('10000000-0000-0000-0000-000000000001','Stock admin','unused','admin',true);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',false);
SELECT public.cash_command('open','{"amount":0}');
INSERT INTO public.consumables(id,name,description,price) VALUES('20000000-0000-0000-0000-000000000001','Agua','Stock test',100);
INSERT INTO public.sales(id,type,date,time,customer_type,customer_name,total_amount,payment_method) VALUES('30000000-0000-0000-0000-000000000001','direct','2031-01-01','12:00','guest','Cliente',200,'cash');
INSERT INTO public.sale_items(sale_id,consumable_id,name,price,quantity,subtotal) VALUES('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Agua',100,2,200);`);
await db.exec(stockMigration);
await db.exec(readFileSync('scripts/test-stock.sql', 'utf8'));
await db.exec(`GRANT USAGE ON SCHEMA auth TO authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',false);
SET row_security=on; SET ROLE authenticated;`);
assert((await db.query('SELECT * FROM public.stock_movements')).rows.length > 0, 'Admin may read stock history');
await assert.rejects(db.query("UPDATE public.consumables SET stock_quantity=999 WHERE id='20000000-0000-0000-0000-000000000001'"), /Usá la gestión/);
await assert.rejects(db.query("SELECT public.inventory_apply('20000000-0000-0000-0000-000000000001',1,'entry','forbidden')"), /permission denied/);
await assert.rejects(db.query("DELETE FROM public.stock_movements"), /permission denied/);
await assert.rejects(db.query("SELECT * FROM public.stock_source_totals"), /permission denied/);
await db.exec('RESET ROLE');
const result = await db.query('SELECT stock_enabled,stock_quantity FROM public.consumables WHERE id=$1',['20000000-0000-0000-0000-000000000001']);
assert.equal(result.rows[0].stock_enabled, true);
console.log('PASS: stock PostgreSQL: defaults, activation, historical baseline, sales, bookings, edits, returns, shortages, permissions and audit.');
await db.close();
