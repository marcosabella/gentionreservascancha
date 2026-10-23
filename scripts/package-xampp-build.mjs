import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { MANIFEST_NAME, validateManifest, verifyReleaseDirectory } from './local-app/release-manifest.mjs';

const source = resolve('dist/padel-center');
const manifest = validateManifest(JSON.parse(readFileSync(join(source, MANIFEST_NAME), 'utf8')));
await verifyReleaseDirectory(source, manifest);
const output = resolve(`output/padel-center-xampp-actualizable-${manifest.version}`);
const archive = `${output}.zip`;
mkdirSync(join(output, 'runtime'), { recursive: true });
cpSync(source, join(output, 'app'), { recursive: true });
cpSync('scripts/local-app/php/index.php', join(output, 'index.php'));
cpSync('scripts/local-app/php/updater.php', join(output, 'runtime/updater.php'));
cpSync('scripts/local-app/php/htaccess.txt', join(output, '.htaccess'));
writeFileSync(join(output, 'LEEME-XAMPP.txt'), `PADEL CENTER - ACTUALIZACIÓN AUTOMÁTICA PARA XAMPP

INSTALACIÓN ÚNICA
1. Guarde una copia de la carpeta C:\\xampp\\htdocs\\Sistema de Reservas.
2. Copie el contenido de este paquete dentro de esa carpeta.
3. Deben quedar index.php, .htaccess y las carpetas app y runtime en la raíz.
4. Mantenga Apache iniciado desde XAMPP y abra:
   http://localhost/Sistema%20de%20Reservas/
5. La primera vez, recargue con Ctrl + F5.

Puede conservar el index.html y assets anteriores: .htaccess pasa a servir
la app mediante index.php. No necesita Node.js ni un iniciador CMD.
El paquete requiere PHP 8.1 o superior con cURL (incluidos en XAMPP actual),
mod_rewrite y AllowOverride All. El servidor debe poder escribir en esta carpeta.

ACTUALIZACIONES
Al abrir o recargar el sistema se comprueba la versión publicada de Padel Center.
Se descarga y verifica antes de activarla. Si falla, se conserva la copia anterior.
Al ingresar aparece el aviso de que el sistema se actualizó.

Con la app abierta, se avisa si hay una nueva versión. Guarde sus cambios
antes de pulsar "Actualizar y recargar". Las otras pestañas no se recargan solas.

No borre .local-updates: allí se guardan las actualizaciones y las copias anteriores.
Las carpetas app y runtime y el archivo .htaccess deben conservarse.
Los datos y credenciales siguen en la misma base real de Padel Center.
El acceso a los datos y la descarga de nuevas versiones requieren Internet.

Versión incluida: ${manifest.version}
Publicada: ${manifest.publishedAt}
`);
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  'Compress-Archive -LiteralPath $env:PADEL_XAMPP_DIRECTORY -DestinationPath $env:PADEL_XAMPP_ZIP -Force'], {
  env: { ...process.env, PADEL_XAMPP_DIRECTORY: output, PADEL_XAMPP_ZIP: archive }, windowsHide: true, stdio: 'inherit',
});
console.log(JSON.stringify({ xamppBuild: output, zip: archive, version: manifest.version, target: 'C:/xampp/htdocs/Sistema de Reservas' }));
