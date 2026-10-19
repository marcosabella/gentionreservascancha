// Each deployment supplies its own branding; existing Padel deployments retain
// their current name when no override is configured.
export const complexName = import.meta.env.VITE_COMPLEX_NAME?.trim() || 'PADEL CENTER';
