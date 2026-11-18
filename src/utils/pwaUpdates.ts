let available = false;
const listeners = new Set<() => void>();

export const pwaUpdates = {
  getSnapshot: () => available,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  notify: () => {
    if (available) return;
    available = true;
    listeners.forEach(listener => listener());
  }
};

export function watchPwaUpdates(registration: ServiceWorkerRegistration) {
  let hadController = !!navigator.serviceWorker.controller;
  let checking = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) pwaUpdates.notify();
    hadController = true;
  });

  const check = async () => {
    if (checking || document.visibilityState !== 'visible' || !navigator.onLine) return;
    checking = true;
    try { await registration.update(); }
    catch { /* Retry when connectivity returns; keep the current app usable. */ }
    finally { checking = false; }
  };
  window.addEventListener('focus', () => { void check(); });
  window.addEventListener('online', () => { void check(); });
  document.addEventListener('visibilitychange', () => { void check(); });
  window.setInterval(() => { void check(); }, 60000);
  void check();
}
