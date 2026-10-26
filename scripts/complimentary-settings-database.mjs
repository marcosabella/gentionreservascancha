import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [mode, client = 'pura-vida'] = process.argv.slice(2);
const projects = { 'pura-vida': 'qsvdpdifygmzdawxfyqv', 'padel-center': 'zcixnnzxxkylotbjudhk' };
if (!['test', 'apply', 'verify'].includes(mode) || !projects[client]) throw new Error('Expected test, apply or verify and a client');
function query(sql, suffix) {
  const file = `dev/release.local/${client}-complimentary-settings-${suffix}.sql`;
  writeFileSync(file, sql);
  return execFileSync('supabase', ['db', 'query', '--linked', '--project-ref', projects[client], '--file', file, '--output', 'json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}
try {
  const history = JSON.parse(query("SELECT version FROM supabase_migrations.schema_migrations WHERE version IN ('20261026170000','20261026180000');", 'inspect')).rows;
  const recorded = new Set(history.map(row => row.version));
  const migrations = ['20261026170000_direct_sale_complimentary', '20261026180000_complimentary_reason_optional']
    .filter(name => !recorded.has(name.slice(0, 14))).map(name => ({ name, source: readFileSync(`supabase/migrations/${name}.sql`, 'utf8') }));
  if (mode === 'verify' && migrations.length) throw new Error('Missing required migrations');
  let sql = 'BEGIN;\n' + migrations.map(item => item.source.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')).join('\n') + '\n';
  if (mode === 'apply') {
    for (const item of migrations) sql += `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${item.name.slice(0,14)}','${item.name.slice(15)}',ARRAY[$migration$${item.source}$migration$]);\n`;
    sql += `COMMIT; SELECT 'Bonificaciones sin motivo obligatorio y sin Consumidor Final aplicadas en ${client}' AS result;`;
  } else {
    for (const file of ['test-booking-complimentary.sql', 'test-direct-sale-complimentary.sql', 'test-complimentary-no-reason.sql']) sql += '\nSET CONSTRAINTS ALL DEFERRED;\n' + readFileSync(`scripts/${file}`, 'utf8');
    sql += "\nROLLBACK; SELECT 'PASS: turno y venta sin motivo, Consumidor Final excluido, caja y cuentas correctas; prueba revertida' AS result;";
  }
  console.log(query(sql, mode));
} catch (error) { console.error(error.stderr || error.message); process.exitCode = 1; }
