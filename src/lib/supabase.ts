import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const isBrowserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

console.log('🔍 Environment variables check:');
console.log('VITE_SUPABASE_URL:', supabaseUrl);
console.log('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Present' : 'Missing');

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

export let supabase
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables. Please check .env file')
  // Create a null client to prevent crashes
  supabase = null as any
} else {
  console.log('✅ Supabase configured with URL:', supabaseUrl)
  console.log('✅ Supabase anon key configured:', supabaseAnonKey ? 'Yes' : 'No')
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  })
  
  // Test database connection
  if (!isBrowserOffline()) {
    supabase.from('courts').select('count').then(({ error }) => {
    if (error) {
      console.error('❌ Database connection test failed:', error);
    } else {
      console.log('✅ Database connection test successful');
    }
    });
  }
}

export type Database = {
  public: {
    Tables: {
      players: {
        Row: {
          id: string
          name: string
          email: string
          phone: string
          gender: 'masculino' | 'femenino' | null
          category: number | null
          total_bookings: number
          last_booking: string | null
          created_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          id?: string
          name: string
          email: string
          phone: string
          gender?: 'masculino' | 'femenino' | null
          category?: number | null
          total_bookings?: number
          last_booking?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          email?: string
          phone?: string
          gender?: 'masculino' | 'femenino' | null
          category?: number | null
          total_bookings?: number
          last_booking?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string | null
        }
      }
      consumable_categories: {
        Row: {
          id: string
          name: string
          label: string
          color: string
          default_icon: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          label: string
          color?: string
          default_icon?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          label?: string
          color?: string
          default_icon?: string
          created_at?: string
          updated_at?: string
        }
      }
      consumables: {
        Row: {
          id: string
          name: string
          description: string
          price: number
          category: string
          start_time: string
          end_time: string
          available: boolean
          icon: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description: string
          price: number
          category?: string
          start_time?: string
          end_time?: string
          available?: boolean
          icon?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string
          price?: number
          category?: string
          start_time?: string
          end_time?: string
          available?: boolean
          icon?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      bookings: {
        Row: {
          id: string
          court_id: string | null
          court_name: string
          date: string
          start_time: string
          end_time: string
          total_price: number
          final_total: number | null
          status: string
          is_recurring: boolean
          recurring_booking_id: string | null
          closed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          court_id?: string | null
          court_name: string
          date: string
          start_time: string
          end_time: string
          total_price?: number
          final_total?: number | null
          status?: string
          is_recurring?: boolean
          recurring_booking_id?: string | null
          closed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          court_id?: string | null
          court_name?: string
          date?: string
          start_time?: string
          end_time?: string
          total_price?: number
          final_total?: number | null
          status?: string
          is_recurring?: boolean
          recurring_booking_id?: string | null
          closed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      booking_players: {
        Row: {
          id: string
          booking_id: string
          player_id: string
          player_name: string
          player_email: string
          player_phone: string
          is_organizer: boolean
          payment_method: string | null
          payment_splits: any[] | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          player_id: string
          player_name: string
          player_email: string
          player_phone: string
          is_organizer?: boolean
          payment_method?: string | null
          payment_splits?: any[] | null
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string
          player_id?: string
          player_name?: string
          player_email?: string
          player_phone?: string
          is_organizer?: boolean
          payment_method?: string | null
          payment_splits?: any[] | null
          created_at?: string
        }
      }
      booking_consumptions: {
        Row: {
          id: string
          booking_id: string
          consumable_id: string
          name: string
          price: number
          quantity: number
          category: string
          split_between_players: boolean
          assigned_to_players: string[]
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          consumable_id: string
          name: string
          price: number
          quantity?: number
          category?: string
          split_between_players?: boolean
          assigned_to_players?: string[]
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string
          consumable_id?: string
          name?: string
          price?: number
          quantity?: number
          category?: string
          split_between_players?: boolean
          assigned_to_players?: string[]
          created_at?: string
        }
      }
      recurring_bookings: {
        Row: {
          id: string
          player_id: string
          player_name: string
          court_id: string
          court_name: string
          day_of_week: number
          start_time: string
          end_time: string
          is_active: boolean
          skip_dates: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          player_id: string
          player_name: string
          court_id: string
          court_name: string
          day_of_week: number
          start_time: string
          end_time: string
          is_active?: boolean
          skip_dates?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          player_name?: string
          court_id?: string
          court_name?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          is_active?: boolean
          skip_dates?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          type: string
          date: string
          time: string
          customer_type: string
          customer_id: string | null
          customer_name: string
          customer_email: string | null
          customer_phone: string | null
          total_amount: number
          payment_method: string
          notes: string | null
          booking_id: string | null
          court_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          type?: string
          date: string
          time: string
          customer_type: string
          customer_id?: string | null
          customer_name: string
          customer_email?: string | null
          customer_phone?: string | null
          total_amount?: number
          payment_method: string
          notes?: string | null
          booking_id?: string | null
          court_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          type?: string
          date?: string
          time?: string
          customer_type?: string
          customer_id?: string | null
          customer_name?: string
          customer_email?: string | null
          customer_phone?: string | null
          total_amount?: number
          payment_method?: string
          notes?: string | null
          booking_id?: string | null
          court_name?: string | null
          created_at?: string
        }
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          consumable_id: string
          name: string
          price: number
          quantity: number
          subtotal: number
          created_at: string
        }
        Insert: {
          id?: string
          sale_id: string
          consumable_id: string
          name: string
          price: number
          quantity?: number
          subtotal?: number
          created_at?: string
        }
        Update: {
          id?: string
          sale_id?: string
          consumable_id?: string
          name?: string
          price?: number
          quantity?: number
          subtotal?: number
          created_at?: string
        }
      }
      current_account_entries: {
        Row: {
          id: string
          player_id: string
          type: string
          amount: number
          description: string
          date: string
          time: string
          related_booking_id: string | null
          related_sale_id: string | null
          payment_method: string | null
          created_at: string
        }
        Insert: {
          id?: string
          player_id: string
          type: string
          amount?: number
          description: string
          date: string
          time: string
          related_booking_id?: string | null
          related_sale_id?: string | null
          payment_method?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          type?: string
          amount?: number
          description?: string
          date?: string
          time?: string
          related_booking_id?: string | null
          related_sale_id?: string | null
          payment_method?: string | null
          created_at?: string
        }
      }
      schedule_settings: {
        Row: {
          id: string
          start_time: string
          end_time: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          start_time?: string
          end_time?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          start_time?: string
          end_time?: string
          created_at?: string
          updated_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          username: string
          player_id: string | null
          role: string
          is_active: boolean
          last_login: string | null
          password_hash: string | null
          password_updated_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          username: string
          player_id?: string | null
          role?: string
          is_active?: boolean
          last_login?: string | null
          password_hash?: string | null
          password_updated_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          player_id?: string | null
          role?: string
          is_active?: boolean
          last_login?: string | null
          password_hash?: string | null
          password_updated_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
