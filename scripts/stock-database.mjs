import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [mode, client] = process.argv.slice(2);
const projects = { 'padel-center': 'zcixnnzxxkylotbjudhk', 'pura-vida': 'qsvdpdifygmzdawxfyqv' };
if (!['apply', 'verify'].includes(mode) || !projects[client]) throw new Error('Expected apply|verify and padel-center|pura-vida');
const version = '20261029120000', name = 'product_stock';
const source = readFileSync(`supabase/migrations/${version}_${name}.sql`, 'utf8');
const verification = `SELECT
  (SELECT version FROM supabase_migrations.schema_migrations WHERE version='${version}') AS migration,
  (SELECT count(*) FROM public.consumables) AS products,
  (SELECT count(*) FROM public.consumables WHERE stock_enabled) AS controlled_products,
  (SELECT count(*) FROM public.consumables WHERE NOT stock_enabled) AS uncontrolled_products,
  (SELECT count(*) FROM public.stock_movements) AS stock_movements,
  (SELECT count(*) FROM public.stock_source_totals) AS historical_baselines,
  (SELECT count(*) FROM public.sales) AS sales,
  (SELECT count(*) FROM public.bookings) AS bookings,
  (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('inventory_sales','inventory_sale_items','inventory_bookings','inventory_consumptions')) AS stock_triggers,
  to_regprocedure('public.inventory_save_product(uuid,jsonb)')::text AS product_rpc,
  to_regprocedure('public.inventory_create_booking(jsonb)')::text AS booking_rpc;`;
let sql = verification;
if (mode === 'apply') {
  sql = `BEGIN;
SET LOCAL lock_timeout='15s';
SET LOCAL statement_timeout='90s';
SELECT pg_advisory_xact_lock(29120000);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') THEN RAISE EXCEPTION 'Stock migration already recorded; use verify'; END IF;
  IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261026180000') THEN RAISE EXCEPTION 'Missing prerequisite migrations'; END IF;
END $$;
${source.replace(/^\s*(BEGIN|COMMIT);[ \t]*\r?$/gm, '')}
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.consumables WHERE stock_enabled OR stock_quantity<>0 OR stock_minimum<>0) THEN RAISE EXCEPTION 'Products must start with stock control disabled'; END IF;
  IF EXISTS(SELECT 1 FROM public.stock_movements) THEN RAISE EXCEPTION 'Migration must not generate inventory movements'; END IF;
END $$;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES('${version}','${name}',ARRAY[$stock_migration$${source}$stock_migration$]);
COMMIT;
${verification}`;
}
mkdirSync('dev/release.local', { recursive: true });
const file = `dev/release.local/${client}-stock-${mode}.sql`;
writeFileSync(file, sql);
try {
  console.log(execFileSync('supabase', ['db','query','--linked','--project-ref',projects[client],'--file',file,'--output','json'],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','pipe'] }));
} catch (error) { console.error(error.stderr || error.message); process.exitCode = 1; }
