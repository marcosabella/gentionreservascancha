// Each deployment supplies its own branding; existing Padel deployments retain
// their current name when no override is configured.
export const complexName = import.meta.env.VITE_COMPLEX_NAME?.trim() || 'PADEL CENTER';

const logos: Record<string, string> = {
  'PADEL CENTER': 'logo-padel-center-transparente.png',
  'PURA VIDA': 'logo-pura-vida-transparente.png',
};
const logo = logos[complexName.toUpperCase()];
export const complexLogo = logo ? import.meta.env.BASE_URL + logo : undefined;
