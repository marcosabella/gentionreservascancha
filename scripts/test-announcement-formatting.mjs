import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const compiled = await build({ stdin: { contents: `
export {default as Message} from './src/components/AnnouncementMessage';
export {default as Editor} from './src/components/AnnouncementEditor';
export {announcementPlainText} from './supabase/functions/_shared/announcementText';
export {pushPayload} from './supabase/functions/dispatch-booking-push/push';
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react'],
  plugins: [{ name: 'unused-push-transport', setup(builder) {
    builder.onResolve({ filter: /^web-push$/ }, () => ({ path: 'web-push', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export default {}' }));
  } }],
});
const module = { exports: {} }, require = createRequire(import.meta.url);
let host = null;
const react = { ...React,
  useRef(initial) { const index = host.index++; return host.slots[index] ??= { current: initial }; },
  useState(initial) { const owner = host, index = host.index++; if (!(index in owner.slots)) owner.slots[index] = initial; return [owner.slots[index], value => { owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value; }]; },
};
runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require: name => name === 'react' ? react : require(name), requestAnimationFrame: callback => callback() });
const { Message, Editor, announcementPlainText, pushPayload } = module.exports;
const body = '**Torneo _hoy_** 🎾\n__Inscribite__ ~~cerrado~~\n- Traé paleta\n- ¡Te esperamos! 🏆';
const html = renderToStaticMarkup(React.createElement(Message, { body }));
assert(html.includes('<strong>Torneo <em>hoy</em></strong> 🎾'));
assert(html.includes('<u>Inscribite</u> <s>cerrado</s>'));
assert(html.includes('<li>Traé paleta</li>'));
assert(html.includes('<li>¡Te esperamos! 🏆</li>'));
assert.equal(announcementPlainText(body), 'Torneo hoy 🎾\nInscribite cerrado\n• Traé paleta\n• ¡Te esperamos! 🏆');
const plain = 'Aviso común\nSegunda línea 😊';
assert.equal(announcementPlainText(plain), plain);
const hostile = '<img src=x onerror=alert(1)> <script>alert(1)</script>';
const safe = renderToStaticMarkup(React.createElement(Message, { body: hostile }));
assert(!safe.includes('<img')); assert(!safe.includes('<script>')); assert(safe.includes('&lt;script&gt;'));
assert.equal(announcementPlainText('**sin cerrar'), '**sin cerrar');
assert.equal(pushPayload({ kind: 'announcement', title: 'Torneo 🎾', body }).body, announcementPlainText(body));
assert.equal(pushPayload({ kind: 'announcement', body: '**' + '🎾'.repeat(181) + '**' }).body, '🎾'.repeat(180) + '…');

const owner = { slots: [], index: 0 };
let value = 'Hola mundo';
function render() { host = owner; owner.index = 0; const tree = Editor({ value, onChange: next => { value = next; } }); host = null; return tree; }
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
let tree = render();
const input = nodes(tree).find(node => node.type === 'textarea');
const selection = { selectionStart: 5, selectionEnd: 10, focus() {}, setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } };
input.ref.current = selection;
function click(label) { const button = nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label)); assert(button, label); button.props.onClick(); tree = render(); }
click('Negrita'); assert.equal(value, 'Hola **mundo**'); assert.equal(selection.selectionStart, 5); assert.equal(selection.selectionEnd, 14);
selection.selectionStart = selection.selectionEnd = value.length;
click('😊 Emojis'); click('Insertar 🎾'); assert.equal(value, 'Hola **mundo**🎾');
value = 'Uno\nDos'; tree = render(); selection.selectionStart = 0; selection.selectionEnd = value.length;
click('Lista'); assert.equal(value, '- Uno\n- Dos');
value = ' Uno \nDos'; tree = render(); selection.selectionStart = 0; selection.selectionEnd = value.length;
click('Negrita'); assert.equal(value, ' **Uno** \n**Dos**');
assert.equal(announcementPlainText(value), ' Uno \nDos');
const multiline = renderToStaticMarkup(React.createElement(Message, { body: value }));
assert(multiline.includes('<strong>Uno</strong>')); assert(multiline.includes('<strong>Dos</strong>'));
value = '- Uno\n- Dos'; tree = render(); selection.selectionStart = 0; selection.selectionEnd = value.length;
click('Negrita'); assert.equal(value, '- **Uno**\n- **Dos**');
value = 'x'.repeat(2000); tree = render(); selection.selectionStart = selection.selectionEnd = 2000;
click('Insertar 🎾'); assert.equal(value.length, 2000); assert(text(tree).includes('No hay espacio suficiente'));
console.log('PASS: formatting, nested styles, lists, safe HTML display, legacy plain text, push without formatting, emoji insertion, selections and length limits.');
