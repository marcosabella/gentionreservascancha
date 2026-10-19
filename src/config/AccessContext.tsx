import { createContext, useContext } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import type { AuthUser } from '../types';
import { hasPermission } from './permissions';

export const AccessContext = createContext<AuthUser | null>(null);

export function ActionButton({ permission, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { permission: string }) {
  const user = useContext(AccessContext);
  if (user?.role === 'employee' && !hasPermission(user, permission)) return null;
  return <button {...props} />;
}
