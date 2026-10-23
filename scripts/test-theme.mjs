import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { buildSync } from 'esbuild';
import config from '../tailwind.config.js';

const result = await postcss([tailwindcss(config)]).process('@tailwind base; @tailwind utilities;', { from: 'src/index.css' });
const root = postcss.parse(result.css);
function rule(selector, property) {
  let value;
  root.walkRules(item => {
    if (item.selector.split(/,\s*/).includes(selector)) item.walkDecls(property, declaration => { value = declaration.value; });
  });
  assert(value, `Missing theme style: ${selector} ${property}`);
  return value;
}
function rgb(value) {
  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if (hex.length === 3) hex = [...hex].map(item => item + item).join('');
    return hex.match(/../g).map(item => parseInt(item, 16));
  }
  return value.match(/[\d.]+/g).slice(0, 3).map(Number);
}
function luminance(value) {
  const values = rgb(value).map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(background, foreground) {
  const values = [luminance(background), luminance(foreground)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
assert.deepEqual(rgb(rule('.bg-white', 'background-color')), [255, 255, 255], 'Original light background is preserved');
for (const background of ['white', 'gray-50', 'gray-100', 'gray-200']) {
  for (const text of [500, 600, 700, 800, 900]) {
    assert(contrast(rule(`.dark .bg-${background}`, 'background-color'), rule(`.dark .text-gray-${text}`, 'color')) >= 4.5, `Insufficient dark contrast: ${background}/gray-${text}`);
  }
}
for (const family of ['green', 'blue', 'red', 'yellow', 'amber', 'orange', 'purple', 'indigo', 'teal']) {
  for (const shade of [50, 100, 200]) {
    assert(contrast(rule(`.dark .bg-${family}-${shade}`, 'background-color'), rule(`.dark .text-${family}-600`, 'color')) >= 4.5, `Insufficient status contrast: ${family}-${shade}`);
  }
}
assert.equal(rule('.dark img[src*="logo-"]', 'filter'), 'brightness(0) invert(1)', 'Dark logos are white while preserving alpha');
root.walkRules(item => {
  if (!item.selector.includes('.dark ')) return;
  let parent = item.parent;
  while (parent && !(parent.type === 'atrule' && parent.name === 'media')) parent = parent.parent;
  assert.equal(parent?.params, 'screen', 'Dark palette must not change printed receipts');
});
const script = readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
for (const stored of ['dark', 'light', null, 'invalid']) {
  let enabled;
  runInNewContext(script, { localStorage: { getItem: () => stored }, document: { documentElement: { classList: { toggle: (name, value) => { assert.equal(name, 'dark'); enabled = value; } } } } });
  assert.equal(enabled, stored === 'dark', 'Saved preference is restored before the page renders');
}
assert.doesNotThrow(() => runInNewContext(script, { localStorage: { getItem: () => { throw Error('Storage blocked'); } } }));
const compiled = buildSync({ stdin: { contents: `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from './src/config/ThemeContext';
import Switch from './src/components/ThemeSwitch';
export function render(dark, compact) {
  globalThis.localStorage = { getItem: () => dark ? 'dark' : 'light' };
  return renderToStaticMarkup(<ThemeProvider><Switch compact={compact}/></ThemeProvider>);
}`, resolveDir: process.cwd(), loader: 'tsx' }, jsx: 'automatic', bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom/server', 'react/jsx-runtime'] });
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
for (const compact of [false, true]) for (const dark of [false, true]) {
  const html = module.exports.render(dark, compact);
  assert(html.includes('role="switch"') && html.includes('aria-label="Modo oscuro"'));
  assert(html.includes(`aria-checked="${dark}"`));
}
console.log('PASS: original light palette, readable dark text/status colors, screen-only styling, transparent white logos, initial saved preference, blocked storage and accessible switches.');
