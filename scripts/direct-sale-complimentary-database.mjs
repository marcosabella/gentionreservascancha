import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [mode, client = 'pura-vida'] = process.argv.slice(2);
const projects = { 'pura-vida': 'qsvdpdifygmzdawxfyqv', 'padel-center': 'zcixnnzxxkylotbjudhk' };
if (!['inspect', 'test', 'apply', 'verify'].includes(mode) || !projects[client]) throw new Error('Expected inspect, test, apply or verify and a client');
const version = '20261026170000', name = 'direct_sale_complimentary';
const source = readFileSync(`supabase/migrations/${version}_${name}.sql`, 'utf8');
let sql = 'BEGIN;\n' + (mode === 'verify' ? '' : source.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')) + '\n';
if (mode === 'apply') sql += `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[$migration$${source}$migration$]);\nCOMMIT;\nSELECT 'Bonificaciones de venta directa aplicadas en ${client}' AS result;`;
else sql += readFileSync('scripts/test-direct-sale-complimentary.sql', 'utf8') + "\nROLLBACK;\nSELECT 'PASS: venta directa bonificada, caja, cuentas, permisos y reversión' AS result;";
if (mode === 'inspect') sql = "SELECT version,name FROM supabase_migrations.schema_migrations WHERE version IN ('20261026150000','20261026170000','20261026180000') ORDER BY version;";
const file = `dev/release.local/${client}-direct-sale-complimentary-${mode}.sql`;
writeFileSync(file, sql);
try { console.log(execFileSync('supabase', ['db', 'query', '--linked', '--project-ref', projects[client], '--file', file, '--output', 'json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })); }
catch (error) { console.error(error.stderr || error.message); process.exitCode = 1; }
