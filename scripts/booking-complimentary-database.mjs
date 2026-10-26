import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [mode, client = 'pura-vida'] = process.argv.slice(2);
const projects = { 'pura-vida': 'qsvdpdifygmzdawxfyqv', 'padel-center': 'zcixnnzxxkylotbjudhk' };
if (!['test', 'apply', 'verify'].includes(mode) || !projects[client]) throw new Error('Expected test, apply or verify and a client');
const version = '20261026150000', name = 'booking_complimentary';
const source = readFileSync(`supabase/migrations/${version}_${name}.sql`, 'utf8');
let sql = 'BEGIN;\n' + (mode === 'verify' ? '' : source.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')) + '\n';
if (mode === 'apply') sql += `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[$migration$${source}$migration$]);\nCOMMIT;\nSELECT 'Bonificaciones aplicadas en ${client}' AS result;`;
else sql += readFileSync('scripts/test-booking-complimentary.sql', 'utf8') + "\nROLLBACK;\nSELECT 'PASS: bonificaciones, caja, cuentas y permisos; todos los datos de prueba revertidos' AS result;";
const file = `dev/release.local/${client}-booking-complimentary-${mode}.sql`;
writeFileSync(file, sql);
try { console.log(execFileSync('supabase', ['db', 'query', '--linked', '--project-ref', projects[client], '--file', file, '--output', 'json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })); }
catch (error) { console.error(error.stderr || error.message); process.exitCode = 1; }
