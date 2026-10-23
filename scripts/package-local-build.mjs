import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { MANIFEST_NAME, validateManifest, verifyReleaseDirectory } from './local-app/release-manifest.mjs';

const source = resolve('dist/padel-center');
const manifest = validateManifest(JSON.parse(readFileSync(join(source, MANIFEST_NAME), 'utf8')));
await verifyReleaseDirectory(source, manifest);
const output = resolve(`output/padel-center-local-actualizable-${manifest.version}`);
const archive = `${output}.zip`;
mkdirSync(output, { recursive: true });
cpSync(source, join(output, 'app'), { recursive: true });
cpSync(resolve('scripts/local-app'), join(output, 'runtime'), { recursive: true });
writeFileSync(join(output, 'servidor-local.mjs'), `import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalServer } from './runtime/local-server.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto local inválido.');
console.log('PADEL CENTER - Comprobando actualizaciones...');
try {
  const app = await startLocalServer({ root, port });
  const state = app.updater.status();
  if (state.lastError) console.log('Se conserva la versión local. ' + state.lastError);
  console.log('PADEL CENTER - http://localhost:' + port);
  console.log('Mantenga esta ventana abierta. Internet requerido para acceder a los datos.');
  console.log('Versión: ' + state.active.version);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
} catch (error) {
  console.error('No se pudo iniciar Padel Center: ' + error.message);
  process.exitCode = 1;
}
`);
writeFileSync(join(output, 'INICIAR-PADEL-CENTER.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nnode servidor-local.mjs\r\npause\r\n');
writeFileSync(join(output, 'LEEME.txt'), `PADEL CENTER - ACCESO LOCAL CON ACTUALIZACIÓN AUTOMÁTICA

INSTALACIÓN ÚNICA
1. Cierre el servidor local anterior y las pestañas de Padel Center.
2. Descomprima este ZIP en una carpeta nueva con permiso de escritura.
3. Necesita Node.js 18 o superior instalado. No requiere npm install.
4. Ejecute INICIAR-PADEL-CENTER.cmd de la carpeta nueva.
5. Espere el mensaje con la dirección y abra http://localhost:8080.
6. Mantenga la ventana del servidor abierta. Use este nuevo iniciador en su acceso directo.

No copie estos archivos sobre la carpeta anterior. Conserve la carpeta anterior como respaldo.
Los usuarios, reservas, ventas y cuentas siguen en la misma base real de PADEL CENTER.
Se mantienen las credenciales habituales. El acceso a los datos requiere Internet.

ACTUALIZACIONES
Al iniciar el servidor o abrir/recargar la app, se busca la última versión publicada
de Padel Center. Se descarga y verifica antes de activarla. Si falla, continúa
funcionando la copia anterior. Al ingresar aparece el aviso de actualización.

Si el sistema ya está abierto, se avisa cuando hay una versión nueva.
Guarde lo que esté cargando antes de pulsar "Actualizar y recargar".
Las otras pestañas no se recargan automáticamente: mostrarán su propio aviso.

No borre la carpeta .local-updates: contiene las versiones descargadas y su respaldo.
El actualizador descarga solo los archivos de la app desde https://padelcenter.netlify.app.
No modifica la base de datos ni las credenciales.

Si el puerto 8080 está ocupado, abra CMD en esta carpeta y ejecute:
  set PORT=8081
  node servidor-local.mjs
Luego abra http://localhost:8081.

Versión incluida: ${manifest.version}
Publicada: ${manifest.publishedAt}
`);
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  'Compress-Archive -LiteralPath $env:PADEL_PACKAGE_DIRECTORY -DestinationPath $env:PADEL_PACKAGE_ZIP -Force'], {
  env: { ...process.env, PADEL_PACKAGE_DIRECTORY: output, PADEL_PACKAGE_ZIP: archive }, windowsHide: true, stdio: 'inherit',
});
console.log(JSON.stringify({ localBuild: output, zip: archive, version: manifest.version }));
