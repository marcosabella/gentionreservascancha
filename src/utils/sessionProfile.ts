import type { AuthUser } from '../types';
import { normalizePermissions } from '../config/permissions';

interface SessionProfile {
  id: string;
  username: string;
  role: string;
  player_id: string | null;
  is_active: boolean;
  permissions?: unknown;
}

export class InvalidProfileSession extends Error {}

export function authUserFromProfile(sessionUserId: string, profile: SessionProfile | null): AuthUser {
  if (!profile || profile.id !== sessionUserId) {
    throw new InvalidProfileSession('Tu sesión pertenece a un acceso anterior. Ingresá nuevamente para cargar tus datos.');
  }
  if (!profile.is_active || !['admin', 'player', 'employee'].includes(profile.role)) {
    throw new InvalidProfileSession('El usuario está inactivo o no tiene un rol válido.');
  }
  return {
    id: profile.id,
    username: profile.username,
    role: profile.role as AuthUser['role'],
    permissions: profile.role === 'employee' ? normalizePermissions(profile.permissions) : [],
    playerId: profile.player_id ?? undefined,
  };
}
