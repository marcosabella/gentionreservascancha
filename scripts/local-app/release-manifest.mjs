import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

export const APP_ID = 'padel-center';
export const PROJECT_ID = 'zcixnnzxxkylotbjudhk';
export const RELEASE_ORIGIN = 'https://padelcenter.netlify.app/';
export const MANIFEST_NAME = 'local-update.json';
const extensions = new Set(['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.jfif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.webmanifest']);
export const digest = data => createHash('sha256').update(data).digest('hex');
export const validVersion = version => typeof version === 'string' && /^[a-zA-Z0-9-]{8,100}$/.test(version);

export function validPublicPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !/[\\%?#:\x00-\x1f<>"|*]/.test(path)
    && path.slice(1).split('/').every(part => part && !part.startsWith('.') && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part))
    && extensions.has(extname(path).toLowerCase());
}

export function validateManifest(value) {
  if (!value || value.protocol !== 1 || value.app !== APP_ID || value.project !== PROJECT_ID || !validVersion(value.version)
    || !Number.isFinite(Date.parse(value.publishedAt)) || !Array.isArray(value.files) || !value.files.length || value.files.length > 500
    || !Array.isArray(value.notes) || value.notes.length > 20 || value.notes.some(note => typeof note !== 'string' || note.length > 500)) {
    throw new Error('La versión publicada no es compatible con Padel Center.');
  }
  const paths = new Set();
  let total = 0;
  for (const file of value.files) {
    if (!validPublicPath(file.path) || file.path === `/${MANIFEST_NAME}` || paths.has(file.path.toLowerCase())
      || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 20 * 1024 * 1024) {
      throw new Error('La lista de archivos de la actualización es inválida.');
    }
    paths.add(file.path.toLowerCase()); total += file.size;
  }
  if (!paths.has('/index.html') || !value.files.some(file => file.path.startsWith('/assets/') && file.path.endsWith('.js')) || total > 100 * 1024 * 1024) {
    throw new Error('La actualización está incompleta o es demasiado grande.');
  }
  return value;
}

export async function createReleaseManifest(directory, { version, publishedAt = new Date().toISOString(), notes = ['Mejoras y correcciones del sistema.'] }) {
  const files = [];
  async function visit(folder, prefix = '') {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await visit(join(folder, entry.name), path);
      else if (entry.isFile() && path !== `/${MANIFEST_NAME}` && validPublicPath(path)) {
        const data = await readFile(join(folder, entry.name));
        files.push({ path, size: data.length, sha256: digest(data) });
      }
    }
  }
  await visit(directory);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = validateManifest({ protocol: 1, app: APP_ID, project: PROJECT_ID, version, publishedAt, notes, files });
  await verifyReleaseDirectory(directory, manifest);
  await writeFile(join(directory, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export async function verifyReleaseDirectory(directory, manifest) {
  validateManifest(manifest);
  let hasProject = false, hasVersion = false;
  let html = '';
  for (const file of manifest.files) {
    const data = await readFile(join(directory, file.path.slice(1)));
    if (data.length !== file.size || digest(data) !== file.sha256) throw new Error(`No se pudo verificar ${file.path}.`);
    if (file.path.endsWith('.js') && data.includes(PROJECT_ID)) hasProject = true;
    if (file.path.endsWith('.js') && data.includes(manifest.version)) hasVersion = true;
    if (file.path === '/index.html') html = data.toString('utf8');
  }
  if (!hasProject) throw new Error('La actualización no corresponde a la base de Padel Center.');
  if (!hasVersion) throw new Error('La versión de la app no coincide con la actualización.');
  const refs = [...html.matchAll(/(?:src|href)=["']\.?\/?(assets\/[^"']+)["']/g)].map(match => `/${match[1]}`);
  if (!refs.length || refs.some(path => !manifest.files.some(file => file.path === path))) throw new Error('Faltan archivos necesarios para abrir la app.');
}
