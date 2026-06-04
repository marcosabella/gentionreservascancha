import { supabase } from '../lib/supabase';
import { UserProfile } from '../types';

export const authService = {
  async getUserProfiles() {
    // Check if Supabase is configured
    if (!supabase) {
      return [];
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(profile => ({
      id: profile.id,
      username: profile.username || 'Sin email',
      playerId: profile.player_id,
      role: profile.role as 'admin' | 'player',
      isActive: profile.is_active,
      createdBy: profile.created_by,
      createdAt: profile.created_at
    })) as UserProfile[];
  },

  async createUserProfile(
    userId: string,
    email: string,
    role: 'admin' | 'player',
    playerId?: string,
    createdBy?: string
  ) {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        player_id: playerId,
        role,
        is_active: true,
        created_by: createdBy
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateUserProfile(userId: string, updates: Partial<UserProfile>) {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        player_id: updates.playerId,
        role: updates.role,
        is_active: updates.isActive
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteUserProfile(userId: string) {
    // Delete user from Supabase Auth (this will cascade to user_profiles)
    const { error } = await supabase.auth.admin.deleteUser(userId);
    
    if (error) throw error;
  },

  async resetUserPassword(userId: string, newPassword: string) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });
      
    if (error) throw error;
  }
};