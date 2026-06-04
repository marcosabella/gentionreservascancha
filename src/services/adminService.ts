import { supabase } from '../lib/supabase';

export interface AdminConfig {
  adminInitialized: boolean;
  systemName: string;
  version: string;
}

export const getAdminConfig = async (): Promise<AdminConfig | null> => {
  try {
    const { data: configData, error } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['admin_initialized', 'system_name', 'version']);

    if (error) {
      console.error('Error fetching admin config:', error);
      return null;
    }

    const config: AdminConfig = {
      adminInitialized: false,
      systemName: 'Tennis Court Management',
      version: '1.0.0'
    };

    configData.forEach(item => {
      if (item.key === 'admin_initialized') {
        config.adminInitialized = item.value === 'true';
      } else if (item.key === 'system_name') {
        config.systemName = item.value;
      } else if (item.key === 'version') {
        config.version = item.value;
      }
    });

    return config;
  } catch (error) {
    console.error('Error getting admin config:', error);
    return null;
  }
};

export const isAdminInitialized = async (): Promise<boolean> => {
  try {
    const config = await getAdminConfig();
    return config?.adminInitialized || false;
  } catch (error) {
    console.error('Error checking admin initialization:', error);
    return false;
  }
};

export const promoteFirstUserToAdmin = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const { data, error } = await supabase
      .rpc('make_first_user_admin');

    if (error) {
      console.error('Error promoting first user to admin:', error);
      return { success: false, message: error.message };
    }

    return {
      success: data?.[0]?.success || false,
      message: data?.[0]?.message || 'Operation completed'
    };
  } catch (error) {
    console.error('Error in promoteFirstUserToAdmin:', error);
    return { success: false, message: 'Failed to promote user to admin' };
  }
};

export const getFirstAdmin = async (): Promise<any | null> => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('role', 'admin')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .maybeSingle();

    if (error) {
      console.error('Error fetching first admin:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error getting first admin:', error);
    return null;
  }
};

export const updateSystemConfig = async (key: string, value: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('system_config')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key);

    if (error) {
      console.error('Error updating system config:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateSystemConfig:', error);
    return false;
  }
};
