import plugin from 'tailwindcss/plugin.js';
import colors from 'tailwindcss/colors.js';

const rgb = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16));
const mixed = (base, accent, amount) => rgb(base).map((value, i) => Math.round(value * (1 - amount) + rgb(accent)[i] * amount));
const background = values => ({ backgroundColor: `rgb(${values.join(' ')} / var(--tw-bg-opacity, 1))` });

// Adapt the shared utility palette so all existing forms, calendars, tables and
// dialogs use the same theme. Colored solid buttons retain their white labels.
export default plugin(({ addBase }) => {
  const rules = {
    'html.dark': { colorScheme: 'dark', backgroundColor: '#0b1220' },
    '.dark body, .dark dialog': { backgroundColor: '#0b1220', color: '#e2e8f0' },
    '.dark input, .dark select, .dark textarea': { backgroundColor: '#111c2f', color: '#e2e8f0', borderColor: '#334155', colorScheme: 'dark' },
    '.dark input::placeholder, .dark textarea::placeholder': { color: '#94a3b8' },
    '.dark input[type="checkbox"], .dark input[type="radio"]': { accentColor: '#22c55e' },
    '.dark .login-screen': { backgroundImage: 'linear-gradient(135deg, #0b1d18, #111b2f)' },
    '.dark img[src*="logo-"]': { filter: 'brightness(0) invert(1)' },
    '.dark [class*="ring-offset"]': { '--tw-ring-offset-color': '#111c2f' },
  };
  const utility = (name, style) => {
    rules[`.dark .${name}`] = style;
    rules[`.dark .hover\\:${name}:hover`] = style;
    rules[`.dark .group:hover .group-hover\\:${name}`] = style;
  };
  utility('bg-white', background(rgb('#111c2f')));
  for (const [shade, hex] of Object.entries({ 50: '#0b1220', 100: '#19263a', 200: '#27374d', 300: '#40516b' })) {
    utility(`bg-gray-${shade}`, background(rgb(hex)));
    utility(`bg-slate-${shade}`, background(rgb(hex)));
  }
  for (const [shade, hex] of Object.entries({ 100: '#243247', 200: '#334155', 300: '#4b5c74', 400: '#64748b' })) {
    utility(`border-gray-${shade}`, { borderColor: hex });
    rules[`.dark .divide-gray-${shade} > :not([hidden]) ~ :not([hidden])`] = { borderColor: hex };
  }
  for (const [shade, hex] of Object.entries({ 300: '#64748b', 400: '#94a3b8', 500: '#a2afc2', 600: '#b7c2d4', 700: '#cbd5e1', 800: '#e2e8f0', 900: '#f1f5f9' })) {
    utility(`text-gray-${shade}`, { color: hex });
  }
  for (const family of ['green','blue','red','yellow','amber','orange','purple','indigo','teal']) {
    for (const [shade, amount] of [[50, 0.10], [100, 0.18], [200, 0.26]]) {
      utility(`bg-${family}-${shade}`, background(mixed('#0f172a', colors[family][500], amount)));
    }
    for (const [shade, amount] of [[100, 0.25], [200, 0.45], [300, 0.65], [400, 0.80]]) {
      const borderColor = `rgb(${mixed('#334155', colors[family][500], amount).join(' ')})`;
      utility(`border-${family}-${shade}`, { borderColor });
      rules[`.dark .divide-${family}-${shade} > :not([hidden]) ~ :not([hidden])`] = { borderColor };
    }
    for (const [shade, darkShade] of [[500, 400], [600, 300], [700, 300], [800, 200], [900, 100]]) {
      utility(`text-${family}-${shade}`, { color: colors[family][darkShade] });
    }
  }
  // Keep browser printouts and receipts in the original light palette.
  addBase({ '@media screen': rules, '@media print': { 'html.dark': { colorScheme: 'light' } } });
});
