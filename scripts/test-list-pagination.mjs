import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const compiled = await build({
  stdin: {
    contents: "export {usePagination} from './src/hooks/usePagination'; export {default as Pagination} from './src/components/Pagination';",
    resolveDir: process.cwd(), loader: 'tsx'
  },
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime']
});
const require = createRequire(import.meta.url);
let state = [];
let cursor = 0;
let changed = false;
const mockReact = {
  ...React,
  useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = value; changed = true; }];
  }
};
const module = { exports: {} };
runInNewContext(compiled.outputFiles[0].text, {
  module, exports: module.exports,
  require: name => name === 'react' ? mockReact : require(name)
});
const { usePagination, Pagination } = module.exports;
const records = Array.from({ length: 23 }, (_, index) => index + 1);
function render(items = records, filter = '') {
  for (let attempt = 0; attempt < 10; attempt++) {
    cursor = 0;
    changed = false;
    const result = usePagination(items, filter);
    if (!changed) return result;
  }
  throw new Error('Pagination failed to settle');
}
let result = render();
assert.equal(result.pagination.pageSize, 10);
assert.equal(result.paginatedItems.join(','), records.slice(0, 10).join(','));
result.pagination.onPageChange(3);
result = render();
assert.equal(result.paginatedItems.join(','), '21,22,23');
result = render(records.slice(0, 20));
assert.equal(result.pagination.page, 2, 'Removing the last page selects the previous page');
for (const size of [5, 10, 20]) {
  result.pagination.onPageSizeChange(size);
  result = render();
  assert.equal(result.pagination.page, 1);
  assert.equal(result.paginatedItems.length, size);
  result.pagination.onPageChange(2);
  result = render();
  assert.equal(result.paginatedItems[0], size + 1);
}
result = render(records, 'new search');
assert.equal(result.pagination.page, 1, 'Filters reset the page even when the result count stays the same');
result = render([], 'new search');
assert.equal(result.paginatedItems.length, 0);
assert.equal(result.pagination.page, 1);
assert.equal(result.pagination.totalPages, 1);
let html = renderToStaticMarkup(React.createElement(Pagination, result.pagination));
assert(html.includes('Mostrando 0–0 de 0 registros'));
assert.equal((html.match(/disabled=""/g) || []).length, 2);
for (const size of [5, 10, 20]) assert(html.includes(`value="${size}"`));
result = render();
result.pagination.onPageChange(999);
result = render();
assert.equal(result.pagination.page, result.pagination.totalPages);
html = renderToStaticMarkup(React.createElement(Pagination, result.pagination));
assert(html.includes('Mostrando 21–23 de 23 registros'));
assert.equal((html.match(/disabled=""/g) || []).length, 1);
console.log('PASS: page sizes, navigation, filter resets, deletions, empty results, ranges and disabled controls.');
