export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}
export interface InstallState {
  installed: boolean;
  canPrompt: boolean;
  prompting: boolean;
  accepted: boolean;
}
const serverState: InstallState = { installed: false, canPrompt: false, prompting: false, accepted: false };

export function createInstallController(target: Window | null) {
  const subscribers = new Set<() => void>();
  const standalone = () => {
    try {
      return !!target && (target.matchMedia('(display-mode: standalone)').matches || (target.navigator as Navigator & { standalone?: boolean }).standalone === true);
    } catch { return false; }
  };
  let state: InstallState = { ...serverState, installed: standalone() };
  let deferred: InstallPromptEvent | null = null;
  let started = false;
  let media: MediaQueryList | null = null;
  const update = (value: Partial<InstallState>) => { state = { ...state, ...value }; subscribers.forEach(callback => callback()); };
  const beforeInstall = (event: Event) => {
    if (state.installed) return;
    const prompt = event as InstallPromptEvent;
    if (typeof prompt.prompt !== 'function' || !prompt.userChoice) return;
    event.preventDefault(); deferred = prompt;
    update({ canPrompt: true, accepted: false });
  };
  const installed = () => { deferred = null; update({ installed: true, canPrompt: false, prompting: false, accepted: false }); };
  const displayChanged = () => {
    if (standalone()) installed();
    else update({ installed: false });
  };
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => serverState,
    subscribe: (callback: () => void) => { subscribers.add(callback); return () => { subscribers.delete(callback); }; },
    start() {
      if (!target || started) return;
      started = true;
      target.addEventListener('beforeinstallprompt', beforeInstall);
      target.addEventListener('appinstalled', installed);
      media = typeof target.matchMedia === 'function' ? target.matchMedia('(display-mode: standalone)') : null;
      if (media?.addEventListener) media.addEventListener('change', displayChanged);
      else media?.addListener(displayChanged);
      if (standalone()) installed();
    },
    stop() {
      if (!target || !started) return;
      target.removeEventListener('beforeinstallprompt', beforeInstall);
      target.removeEventListener('appinstalled', installed);
      if (media?.removeEventListener) media.removeEventListener('change', displayChanged);
      else media?.removeListener(displayChanged);
      deferred = null; started = false;
    },
    async install(): Promise<'accepted' | 'dismissed' | 'unavailable' | 'error'> {
      if (!deferred || state.prompting) return 'unavailable';
      const prompt = deferred; deferred = null;
      update({ canPrompt: false, prompting: true });
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        update({ prompting: false, accepted: !state.installed && choice.outcome === 'accepted' });
        return choice.outcome;
      } catch { update({ prompting: false }); return 'error'; }
    },
  };
}

export function isAppleMobile(navigatorInfo: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  return /iPad|iPhone|iPod/i.test(navigatorInfo.userAgent)
    || navigatorInfo.platform === 'MacIntel' && navigatorInfo.maxTouchPoints > 1;
}

export const pwaInstall = createInstallController(typeof window === 'undefined' ? null : window);
if (import.meta.hot) import.meta.hot.dispose(() => pwaInstall.stop());
