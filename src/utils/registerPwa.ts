export function registerPwa() {
  // The XAMPP updater serves local versions directly; it must not be controlled
  // by a service worker installed from a previous local version.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || window.location.protocol !== 'https:') return;
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;
  const register = () => {
    const base = new URL(import.meta.env.BASE_URL, document.baseURI);
    void navigator.serviceWorker.register(new URL('sw.js', base).href, { scope: base.pathname, updateViaCache: 'none' })
      .catch(() => { /* Installation support must never block access to the system. */ });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
