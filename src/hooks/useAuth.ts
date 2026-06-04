import { useEffect, useState } from 'react';
import { AppUser, AuthUser } from '../types';
import { supabase } from '../lib/supabase';

const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const invokeEdgeFunction = async (functionName: string, payload?: Record<string, unknown>, method = 'POST') => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || !supabase) {
      throw new Error('Supabase no esta configurado');
    }

    const sessionToken = (await supabase.auth.getSession()).data.session?.access_token;
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken || anonKey}`,
        'apikey': anonKey,
      },
      body: method === 'GET' ? undefined : JSON.stringify(payload ?? {}),
    });

    const responseText = await response.text();
    const responseData = responseText
      ? (() => {
          try {
            return JSON.parse(responseText);
          } catch {
            return { error: responseText };
          }
        })()
      : {};

    if (!response.ok) {
      throw new Error(
        typeof responseData?.error === 'string'
          ? responseData.error
          : `Error ejecutando ${functionName} (${response.status})`
      );
    }

    return responseData;
  };

  const getSessionFallbackUser = (sessionUser: any): AuthUser => ({
    id: sessionUser.user_metadata?.profile_id || sessionUser.id,
    username:
      sessionUser.user_metadata?.username ||
      sessionUser.email?.split('@')[0] ||
      'usuario',
    role: sessionUser.user_metadata?.role || 'player',
    playerId: sessionUser.user_metadata?.player_id || sessionUser.user_metadata?.playerId,
  });

  const loadUserFromSession = async (session: any, fallbackUser?: AuthUser) => {
    if (!session?.user || !supabase) {
      setUser(null);
      return null;
    }

    const sessionFallbackUser = fallbackUser || getSessionFallbackUser(session.user);

    try {
      const { data: profileById, error: profileByIdError } = await supabase
        .from('user_profiles')
        .select('id, username, role, player_id, is_active')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileByIdError) {
        throw profileByIdError;
      }

      let profile = profileById;

      if (!profile) {
        const username = sessionFallbackUser.username;
        const { data: profileByUsername, error: profileByUsernameError } = await supabase
          .from('user_profiles')
          .select('id, username, role, player_id, is_active')
          .eq('username', username)
          .maybeSingle();

        if (profileByUsernameError) {
          throw profileByUsernameError;
        }

        profile = profileByUsername;
      }

      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        setUser(null);
        return null;
      }

      const authUser: AuthUser = {
        id: profile?.id || sessionFallbackUser.id,
        username: profile?.username || sessionFallbackUser.username,
        role: profile?.role || sessionFallbackUser.role || 'player',
        playerId: profile?.player_id ?? sessionFallbackUser.playerId,
      };

      setUser(authUser);
      return authUser;
    } catch (err) {
      console.error('Error loading profile from Supabase:', err);
      setUser(sessionFallbackUser);
      return sessionFallbackUser;
    }
  };

  useEffect(() => {
    setLoading(true);

    if (!supabase) {
      setError('Supabase no esta configurado');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        await loadUserFromSession(session);
      } catch (err) {
        console.error('Error initializing auth:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      (async () => {
        await loadUserFromSession(session);
        setLoading(false);
      })();
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (username: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      if (!supabase) {
        throw new Error('Supabase no esta configurado');
      }

      const trimmedUsername = username.trim();
      const normalizedUsername = normalizeUsername(username);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !anonKey) {
        throw new Error('Supabase no esta configurado');
      }

      const loginResponse = await fetch(`${supabaseUrl}/functions/v1/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ username: trimmedUsername || normalizedUsername, password }),
      });

      const loginResponseText = await loginResponse.text();
      const loginData = loginResponseText
        ? (() => {
            try {
              return JSON.parse(loginResponseText);
            } catch {
              return { error: loginResponseText };
            }
          })()
        : {};

      if (!loginResponse.ok) {
        const errorMessage =
          typeof loginData?.error === 'string'
            ? loginData.error
            : 'Usuario o contrasena incorrectos';
        setError(errorMessage);
        setLoading(false);
        return { success: false, error: errorMessage };
      }

      const { user: loginUser } = loginData;

      if (!loginUser?.email) {
        const errorMessage = 'El usuario no tiene email de autenticacion asociado';
        setError(errorMessage);
        setLoading(false);
        return { success: false, error: errorMessage };
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginUser.email,
        password,
      });

      if (signInError || !signInData.user) {
        const errorMessage = signInError?.message || 'Error al autenticar con Supabase';
        setError(errorMessage);
        setLoading(false);
        return { success: false, error: errorMessage };
      }

      const authUser: AuthUser = {
        id: loginUser.id || signInData.user.user_metadata?.profile_id || signInData.user.id,
        username: loginUser.username,
        role: loginUser.role || 'player',
        playerId: loginUser.playerId,
      };

      const loadedUser = await loadUserFromSession(signInData.session, authUser);
      if (!loadedUser) {
        setError('No se pudo cargar el perfil del usuario');
        setLoading(false);
        return { success: false, error: 'No se pudo cargar el perfil del usuario' };
      }
      setLoading(false);
      return { success: true };
    } catch (err) {
      console.error('Sign in error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error al iniciar sesion';
      setError(errorMessage);
      setLoading(false);
      return { success: false, error: errorMessage };
    }
  };

  const signOut = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
      setUser(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const createUserAccount = async (
    username: string,
    password: string,
    role: 'admin' | 'player',
    playerId?: string
  ) => {
    try {
      if (role === 'player' && !playerId) {
        return { success: false, error: 'Debe seleccionar un jugador para el rol de jugador' };
      }

      await invokeEdgeFunction('create-user', {
        username,
        password,
        playerId: playerId || null,
        role,
      });

      return { success: true };
    } catch (err) {
      console.error('Error creando usuario:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Error creando usuario' };
    }
  };

  const updateUserRole = async (
    userId: string,
    role: 'admin' | 'player',
    playerId?: string
  ) => {
    try {
      if (role === 'player' && !playerId) {
        return { success: false, error: 'Debe seleccionar un jugador para el rol de jugador' };
      }

      await invokeEdgeFunction('update-user-role', {
        userId,
        role,
        playerId: role === 'player' ? playerId : null,
      });

      if (user?.id === userId) {
        setUser((prev) => prev ? {
          ...prev,
          role,
          playerId: role === 'player' ? playerId : undefined,
        } : prev);
      }

      return { success: true };
    } catch (err) {
      console.error('Error updating user role:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Error al actualizar el rol',
      };
    }
  };

  const updatePassword = async (newPassword: string) => {
    if (!user || !supabase) {
      return { success: false, error: 'No hay usuario autenticado' };
    }

    try {
      await invokeEdgeFunction('reset-user-password', { userId: user.id, newPassword });
      return { success: true };
    } catch (err) {
      console.error('Error updating password:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Error updating password' };
    }
  };

  const getAllUsers = async (): Promise<AppUser[]> => {
    try {
      const response = await invokeEdgeFunction('get-all-users', undefined, 'GET');
      return response.users || [];
    } catch (err) {
      console.error('Error in getAllUsers:', err);
      throw err;
    }
  };

  const toggleUserStatus = async (userId: string, isActive: boolean) => {
    await invokeEdgeFunction('toggle-user-status', { userId, isActive });

    if (user?.id === userId && !isActive) {
      await signOut();
    }
  };

  const deleteUser = async (userId: string) => {
    await invokeEdgeFunction('delete-user', { userId });

    if (user?.id === userId) {
      await signOut();
    }
  };

  const resetUserPassword = async (userId: string, newPassword: string) => {
    try {
      await invokeEdgeFunction('reset-user-password', { userId, newPassword });
      return { success: true };
    } catch (err) {
      console.error('Error resetting user password:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Error al cambiar la contrasena',
      };
    }
  };

  const isAdmin = () => user?.role === 'admin';
  const isPlayer = () => user?.role === 'player';
  const isAuthenticated = () => !!user;

  return {
    user,
    loading,
    error,
    signIn,
    signOut,
    createUserAccount,
    updateUserRole,
    updatePassword,
    getAllUsers,
    toggleUserStatus,
    deleteUser,
    resetUserPassword,
    isAdmin,
    isPlayer,
    isAuthenticated,
  };
};
