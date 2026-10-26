import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const mode = process.argv[2];
const client = process.argv[3] || 'pura-vida';
const projects = { 'pura-vida': 'qsvdpdifygmzdawxfyqv', 'padel-center': 'zcixnnzxxkylotbjudhk' };
if (!['inspect', 'test', 'verify', 'apply'].includes(mode) || !projects[client]) throw new Error('Expected inspect, test, verify or apply and pura-vida or padel-center');
const version = '20261026120000';
const source = readFileSync(`supabase/migrations/${version}_shared_direct_sales.sql`, 'utf8');
let sql = 'BEGIN;\n' + (mode === 'verify' ? '' : source.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')) + '\n';
if (mode !== 'apply') sql += readFileSync('scripts/test-shared-sales.sql', 'utf8') + "\nROLLBACK;\nSELECT 'Shared sale tests passed; all changes rolled back' AS result;";
else sql += `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','shared_direct_sales',ARRAY[$migration$${source}$migration$]);\nCOMMIT;\nSELECT 'Shared sales migration applied to Pura Vida' AS result;`;
if (mode === 'inspect') sql = `SELECT to_regprocedure('public.save_shared_sale(text,uuid,jsonb)')::text AS shared_sales,
  to_regprocedure('public.cash_save_sale(text,uuid,jsonb)')::text AS atomic_sales,
  to_regprocedure('public.employee_mutate(text,text,uuid,jsonb)')::text AS employee_mutations,
  to_regprocedure('public.cash_payment_totals(text,uuid)')::text AS cash_totals,
  to_regprocedure('public.cash_source_detail(text,uuid)')::text AS cash_detail,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') AS recorded;`;
if (mode === 'apply') sql = sql.replace('Shared sales migration applied to Pura Vida', `Shared sales migration applied to ${client}`);
const file = `dev/release.local/${client}-shared-sales-${mode}.sql`;
writeFileSync(file, sql);
const result = execFileSync('supabase', ['db', 'query', '--linked', '--project-ref', projects[client], '--file', file, '--output', 'json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
console.log(result);
