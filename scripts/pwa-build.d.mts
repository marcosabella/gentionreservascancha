import type { Plugin } from 'vite';
export function pwaManifest(brand: string): {
  id: string; name: string; short_name: string; description: string; lang: string;
  start_url: string; scope: string; display: string; background_color: string;
  theme_color: string; prefer_related_applications: boolean;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
};
export function pwaWorker(brand: string): string;
export default function pwaBuild(brand: string): Plugin;
