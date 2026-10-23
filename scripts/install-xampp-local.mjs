import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJECT_ID, validateManifest, verifyReleaseDirectory } from './local-app/release-manifest.mjs';

// Deliberately fixed to the existing installation explicitly named by the user.
const target = resolve('C:/xampp/htdocs/Sistema de Reservas');
if (target.toLowerCase() !== 'c:\\xampp\\htdocs\\sistema de reservas' || !lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink()) throw Error('La carpeta de instalación no es la esperada.');
const manifest = validateManifest(JSON.parse(readFileSync('dist/padel-center/local-update.json', 'utf8')));
const source = resolve(`output/padel-center-xampp-actualizable-${manifest.version}`);
await verifyReleaseDirectory(join(source, 'app'), manifest);
if (!['index.php','.htaccess','runtime/updater.php'].every(path => existsSync(join(source, path)))) throw Error('El paquete XAMPP está incompleto.');
for (const child of ['app', 'runtime', 'index.php', '.htaccess']) {
  const path = join(target, child);
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw Error('No se reemplazan enlaces de la instalación local.');
}
const assetDir = existsSync(join(target, 'assets')) ? join(target, 'assets') : join(target, 'app/assets');
const installedJs = readdirSync(assetDir).filter(name => name.endsWith('.js')).map(name => readFileSync(join(assetDir, name), 'utf8')).join('\n');
if (!installedJs.includes(PROJECT_ID)) throw Error('La carpeta existente no corresponde a Padel Center.');
if (existsSync(join(target, '.htaccess')) && !readFileSync(join(target, '.htaccess'), 'utf8').includes('RewriteRule ^ index.php')) throw Error('La carpeta tiene reglas personalizadas de Apache: requieren revisión antes de reemplazarlas.');
const backup = resolve('output', `respaldo-xampp-Sistema-de-Reservas-${Date.now()}-${randomUUID().slice(0,8)}`);
cpSync(target, backup, { recursive: true });
cpSync(join(source, 'app'), join(target, 'app'), { recursive: true });
mkdirSync(join(target, 'runtime'), { recursive: true });
cpSync(join(source, 'runtime/updater.php'), join(target, 'runtime/updater.php'));
cpSync(join(source, 'LEEME-XAMPP.txt'), join(target, 'LEEME-XAMPP.txt'));
function replaceFile(name) {
  const temporary = join(target, `install-${randomUUID()}.tmp`);
  writeFileSync(temporary, readFileSync(join(source, name)));
  renameSync(temporary, join(target, name));
}
replaceFile('index.php');
// Enable the new controller only after all of its files and the bundled app exist.
replaceFile('.htaccess');
console.log(JSON.stringify({ installed: target, backup, version: manifest.version, url: 'http://localhost/Sistema%20de%20Reservas/' }));
