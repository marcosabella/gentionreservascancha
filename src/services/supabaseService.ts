import { supabase } from '../lib/supabase';
import { isSupabaseConfigured } from '../lib/supabase';
import { 
  Court, 
  PlayerProfile, 
  ConsumableCategory, 
  ConsumableItem, 
  Booking, 
  RecurringBooking, 
  CourtUnavailability,
  Sale, 
  CurrentAccountEntry,
  Tournament
} from '../types';

// Courts
export const courtsService = {
  async create(court: Omit<Court, 'id'>) {
    try {
      if (!isSupabaseConfigured || !supabase) {
        console.error('❌ Supabase not configured');
        return null;
      }
      
      console.log('🏗️ Creating court in Supabase:', court);
      
      const { data, error } = await supabase
        .from('courts')
        .insert({
          name: court.name,
          description: court.description,
          price_per_turn: court.pricePerTurn,
          features: court.features,
          start_time: court.startTime || '08:00',
          end_time: court.endTime || '22:00'
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating court in Supabase:', error);
        return null;
      }
      
      console.log('✅ Court created in Supabase:', data);
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        pricePerTurn: data.price_per_turn,
        features: data.features || [],
        startTime: data.start_time || '08:00',
        endTime: data.end_time || '22:00'
      } as Court;
    } catch (error: any) {
      console.error('❌ Caught error in create court:', error);
      return null;
    }
  },

  async update(id: string, court: Partial<Court>) {
    try {
      if (!isSupabaseConfigured || !supabase) {
        console.error('❌ Supabase not configured');
        return null;
      }
      
      console.log('🔄 Updating court in Supabase:', id, court);
      
      const { data, error } = await supabase
        .from('courts')
        .update({
          name: court.name,
          description: court.description,
          price_per_turn: court.pricePerTurn,
          features: court.features,
          start_time: court.startTime,
          end_time: court.endTime
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating court in Supabase:', error);
        return null;
      }
      
      console.log('✅ Court updated in Supabase:', data);
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        pricePerTurn: data.price_per_turn,
        features: data.features || [],
        startTime: data.start_time || '08:00',
        endTime: data.end_time || '22:00'
      } as Court;
    } catch (error: any) {
      console.error('❌ Caught error in update court:', error);
      return null;
    }
  },

  async delete(id: string) {
    try {
      if (!isSupabaseConfigured || !supabase) {
        console.error('❌ Supabase not configured');
        return;
      }
      
      console.log('🗑️ Deleting court from Supabase:', id);
      const { error } = await supabase
        .from('courts')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Error deleting court from Supabase:', error);
        throw error;
      }
      console.log('✅ Court deleted successfully from Supabase');
    } catch (error) {
      console.error('❌ Caught error in delete court:', error);
      throw error;
    }
  }
};

// Players
export const playersService = {
  async create(player: Omit<PlayerProfile, 'id' | 'createdAt' | 'totalBookings' | 'lastBooking'>) {
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase not configured');
      }

      const { data, error } = await supabase
        .from('players')
        .insert({
          name: player.name,
          email: player.email,
          phone: player.phone,
          gender: player.gender || null,
          category: player.category || null
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating player in Supabase:', error);
        throw error;
      }

      return {
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        gender: data.gender,
        category: data.category,
        totalBookings: data.total_bookings,
        lastBooking: data.last_booking,
        createdAt: data.created_at
      } as PlayerProfile;
    } catch (error: any) {
      console.error('❌ Caught error in create player:', error);
      throw error;
    }
  },

  async update(id: string, player: Partial<PlayerProfile>) {
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase not configured');
      }

      const { data, error } = await supabase
        .from('players')
        .update({
          name: player.name,
          email: player.email,
          phone: player.phone,
          gender: player.gender || null,
          category: player.category || null,
          total_bookings: player.totalBookings,
          last_booking: player.lastBooking
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating player in Supabase:', error);
        throw error;
      }

      return {
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        gender: data.gender,
        category: data.category,
        totalBookings: data.total_bookings,
        lastBooking: data.last_booking,
        createdAt: data.created_at
      } as PlayerProfile;
    } catch (error: any) {
      console.error('❌ Caught error in update player:', error);
      throw error;
    }
  },

  async delete(id: string) {
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase not configured');
      }
      
      const { error } = await supabase
        .from('players')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Error deleting player from Supabase:', error);
        throw error;
      }
    } catch (error) {
      console.error('❌ Caught error in delete player:', error);
      throw error;
    }
  }
};

// Categories
export const categoriesService = {
  async create(category: Omit<ConsumableCategory, 'id' | 'createdAt'>) {
    const { data, error } = await supabase
      .from('consumable_categories')
      .insert({
        name: category.name,
        label: category.label,
        color: category.color,
        default_icon: category.defaultIcon
      })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      label: data.label,
      color: data.color,
      defaultIcon: data.default_icon,
      createdAt: data.created_at
    } as ConsumableCategory;
  },

  async update(id: string, category: Partial<ConsumableCategory>) {
    const { data, error } = await supabase
      .from('consumable_categories')
      .update({
        name: category.name,
        label: category.label,
        color: category.color,
        default_icon: category.defaultIcon
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      label: data.label,
      color: data.color,
      defaultIcon: data.default_icon,
      createdAt: data.created_at
    } as ConsumableCategory;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('consumable_categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// Consumables
export const consumablesService = {
  async create(consumable: Omit<ConsumableItem, 'id'>) {
    const { data, error } = await supabase
      .from('consumables')
      .insert({
        name: consumable.name,
        description: consumable.description,
        price: consumable.price,
        category: consumable.category,
        available: consumable.available,
        icon: consumable.icon
      })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      price: data.price,
      category: data.category,
      available: data.available,
      icon: data.icon
    } as ConsumableItem;
  },

  async update(id: string, consumable: Partial<ConsumableItem>) {
    const { data, error } = await supabase
      .from('consumables')
      .update({
        name: consumable.name,
        description: consumable.description,
        price: consumable.price,
        category: consumable.category,
        available: consumable.available,
        icon: consumable.icon
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      price: data.price,
      category: data.category,
      available: data.available,
      icon: data.icon
    } as ConsumableItem;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('consumables')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// Bookings
export const bookingsService = {
  async create(booking: Omit<Booking, 'id' | 'createdAt'>) {
    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        court_id: booking.courtId,
        court_name: booking.courtName,
        date: booking.date,
        start_time: booking.startTime,
        end_time: booking.endTime,
        total_price: booking.totalPrice,
        final_total: booking.finalTotal,
        status: booking.status,
        is_recurring: booking.isRecurring,
        recurring_booking_id: booking.recurringBookingId,
        closed_at: booking.closedAt
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    // Insert players
    if (booking.players.length > 0) {
      const { error: playersError } = await supabase
        .from('booking_players')
        .insert(
          booking.players.map(player => ({
            booking_id: bookingData.id,
            player_id: player.id,
            player_name: player.name,
            player_email: player.email,
            player_phone: player.phone,
            is_organizer: player.isOrganizer,
            payment_method: player.paymentMethod,
            payment_splits: player.paymentSplits || null
          }))
        );

      if (playersError) throw playersError;
    }

    // Insert consumptions
    if (booking.consumptions.length > 0) {
      const { error: consumptionsError } = await supabase
        .from('booking_consumptions')
        .insert(
          booking.consumptions.map(consumption => ({
            booking_id: bookingData.id,
            consumable_id: consumption.consumableId || consumption.id,
            name: consumption.name,
            price: consumption.price,
            quantity: consumption.quantity,
            category: consumption.category,
            split_between_players: consumption.splitBetweenPlayers,
            assigned_to_players: consumption.assignedToPlayers || []
          }))
        );

      if (consumptionsError) throw consumptionsError;
    }

    return bookingData.id;
  },

  async update(id: string, booking: Partial<Booking>) {
    const { error: bookingError } = await supabase
      .from('bookings')
      .update({
        court_id: booking.courtId,
        court_name: booking.courtName,
        date: booking.date,
        start_time: booking.startTime,
        end_time: booking.endTime,
        total_price: booking.totalPrice,
        final_total: booking.finalTotal,
        status: booking.status,
        is_recurring: booking.isRecurring,
        recurring_booking_id: booking.recurringBookingId,
        closed_at: booking.closedAt
      })
      .eq('id', id);

    if (bookingError) throw bookingError;

    // Update players if provided
    if (booking.players) {
      // Delete existing players
      await supabase
        .from('booking_players')
        .delete()
        .eq('booking_id', id);

      // Insert new players
      if (booking.players.length > 0) {
        const { error: playersError } = await supabase
          .from('booking_players')
          .insert(
            booking.players.map(player => ({
              booking_id: id,
              player_id: player.id,
              player_name: player.name,
              player_email: player.email,
              player_phone: player.phone,
              is_organizer: player.isOrganizer,
              payment_method: player.paymentMethod,
              payment_splits: player.paymentSplits || null
            }))
          );

        if (playersError) throw playersError;
      }
    }

    // Update consumptions if provided
    if (booking.consumptions) {
      // Delete existing consumptions
      await supabase
        .from('booking_consumptions')
        .delete()
        .eq('booking_id', id);

      // Insert new consumptions
      if (booking.consumptions.length > 0) {
        const { error: consumptionsError } = await supabase
          .from('booking_consumptions')
          .insert(
            booking.consumptions.map(consumption => ({
              booking_id: id,
              consumable_id: consumption.consumableId || consumption.id,
              name: consumption.name,
              price: consumption.price,
              quantity: consumption.quantity,
              category: consumption.category,
              split_between_players: consumption.splitBetweenPlayers,
              assigned_to_players: consumption.assignedToPlayers || []
            }))
          );

        if (consumptionsError) throw consumptionsError;
      }
    }
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// Recurring Bookings
export const recurringBookingsService = {
  async create(recurring: Omit<RecurringBooking, 'id' | 'createdAt'>) {
    const { data, error } = await supabase
      .from('recurring_bookings')
      .insert({
        player_id: recurring.playerId,
        player_name: recurring.playerName,
        court_id: recurring.courtId,
        court_name: recurring.courtName,
        day_of_week: recurring.dayOfWeek,
        start_time: recurring.startTime,
        end_time: recurring.endTime,
        is_active: recurring.isActive,
        skip_dates: recurring.skipDates
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  },

  async update(id: string, recurring: Partial<RecurringBooking>) {
    const { error } = await supabase
      .from('recurring_bookings')
      .update({
        player_id: recurring.playerId,
        player_name: recurring.playerName,
        court_id: recurring.courtId,
        court_name: recurring.courtName,
        day_of_week: recurring.dayOfWeek,
        start_time: recurring.startTime,
        end_time: recurring.endTime,
        is_active: recurring.isActive,
        skip_dates: recurring.skipDates
      })
      .eq('id', id);

    if (error) throw error;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('recurring_bookings')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// Court Unavailabilities
type CourtUnavailabilityRow = {
  id: string;
  court_id: string;
  court_name: string;
  title: string;
  reason: CourtUnavailability['reason'];
  date: string | null;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

const mapCourtUnavailability = (data: CourtUnavailabilityRow): CourtUnavailability => ({
  id: data.id,
  courtId: data.court_id,
  courtName: data.court_name,
  title: data.title,
  reason: data.reason,
  date: data.date || undefined,
  dayOfWeek: data.day_of_week ?? undefined,
  startTime: data.start_time,
  endTime: data.end_time,
  isRecurring: data.is_recurring,
  isActive: data.is_active,
  notes: data.notes || undefined,
  createdAt: data.created_at
});

export const courtUnavailabilitiesService = {
  async create(unavailability: Omit<CourtUnavailability, 'id' | 'createdAt'>) {
    const { data, error } = await supabase
      .from('court_unavailabilities')
      .insert({
        court_id: unavailability.courtId,
        court_name: unavailability.courtName,
        title: unavailability.title,
        reason: unavailability.reason,
        date: unavailability.isRecurring ? null : unavailability.date,
        day_of_week: unavailability.isRecurring ? unavailability.dayOfWeek : null,
        start_time: unavailability.startTime,
        end_time: unavailability.endTime,
        is_recurring: unavailability.isRecurring,
        is_active: unavailability.isActive,
        notes: unavailability.notes
      })
      .select()
      .single();

    if (error) throw error;
    return mapCourtUnavailability(data);
  },

  async update(id: string, unavailability: Partial<CourtUnavailability>) {
    const { data, error } = await supabase
      .from('court_unavailabilities')
      .update({
        court_id: unavailability.courtId,
        court_name: unavailability.courtName,
        title: unavailability.title,
        reason: unavailability.reason,
        date: unavailability.isRecurring ? null : unavailability.date,
        day_of_week: unavailability.isRecurring ? unavailability.dayOfWeek : null,
        start_time: unavailability.startTime,
        end_time: unavailability.endTime,
        is_recurring: unavailability.isRecurring,
        is_active: unavailability.isActive,
        notes: unavailability.notes
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapCourtUnavailability(data);
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('court_unavailabilities')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// Tournaments
const mapTournament = (data: any): Tournament => ({
  id: data.id,
  name: data.name,
  isActive: data.is_active,
  pairs: data.pairs || [],
  zones: data.zones || [],
  playoffRounds: data.playoff_rounds || [],
  matches: data.matches || [],
  createdAt: data.created_at
});

export const tournamentsService = {
  async create(tournament: Omit<Tournament, 'id' | 'createdAt'>) {
    if (tournament.isActive) {
      await supabase
        .from('tournaments')
        .update({ is_active: false })
        .eq('is_active', true);
    }

    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        name: tournament.name,
        is_active: tournament.isActive,
        pairs: tournament.pairs,
        zones: tournament.zones,
        playoff_rounds: tournament.playoffRounds,
        matches: tournament.matches
      })
      .select()
      .single();

    if (error) throw error;
    return mapTournament(data);
  },

  async update(id: string, tournament: Partial<Tournament>) {
    if (tournament.isActive) {
      await supabase
        .from('tournaments')
        .update({ is_active: false })
        .neq('id', id);
    }

    const { data, error } = await supabase
      .from('tournaments')
      .update({
        name: tournament.name,
        is_active: tournament.isActive,
        pairs: tournament.pairs,
        zones: tournament.zones,
        playoff_rounds: tournament.playoffRounds,
        matches: tournament.matches
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapTournament(data);
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// Sales
export const salesService = {
  async create(sale: Omit<Sale, 'id' | 'createdAt'>) {
    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert({
        type: sale.type,
        date: sale.date,
        time: sale.time,
        customer_type: sale.customerType,
        customer_id: sale.customer.id,
        customer_name: sale.customer.name,
        customer_email: sale.customer.email,
        customer_phone: sale.customer.phone,
        total_amount: sale.totalAmount,
        payment_method: sale.paymentMethod,
        notes: sale.notes,
        booking_id: sale.bookingId,
        court_name: sale.courtName
      })
      .select()
      .single();

    if (saleError) throw saleError;

    // Insert sale items
    if (sale.items.length > 0) {
      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(
          sale.items.map(item => ({
            sale_id: saleData.id,
            consumable_id: item.consumableId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            subtotal: item.subtotal
          }))
        );

      if (itemsError) throw itemsError;
    }

    return saleData.id;
  },

  async update(id: string, sale: Partial<Sale>) {
    const { error: saleError } = await supabase
      .from('sales')
      .update({
        type: sale.type,
        date: sale.date,
        time: sale.time,
        customer_type: sale.customerType,
        customer_id: sale.customer?.id,
        customer_name: sale.customer?.name,
        customer_email: sale.customer?.email,
        customer_phone: sale.customer?.phone,
        total_amount: sale.totalAmount,
        payment_method: sale.paymentMethod,
        notes: sale.notes,
        booking_id: sale.bookingId,
        court_name: sale.courtName
      })
      .eq('id', id);

    if (saleError) throw saleError;

    // Update items if provided
    if (sale.items) {
      // Delete existing items
      await supabase
        .from('sale_items')
        .delete()
        .eq('sale_id', id);

      // Insert new items
      if (sale.items.length > 0) {
        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(
            sale.items.map(item => ({
              sale_id: id,
              consumable_id: item.consumableId,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              subtotal: item.subtotal
            }))
          );

        if (itemsError) throw itemsError;
      }
    }
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// Current Account Entries
export const currentAccountService = {
  async create(entry: Omit<CurrentAccountEntry, 'id' | 'createdAt'>) {
    const { data, error } = await supabase
      .from('current_account_entries')
      .insert({
        player_id: entry.playerId,
        type: entry.type,
        amount: entry.amount,
        description: entry.description,
        date: entry.date,
        time: entry.time,
        related_booking_id: entry.relatedBookingId,
        related_sale_id: entry.relatedSaleId,
        payment_method: entry.paymentMethod
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  },

  async update(id: string, entry: Partial<CurrentAccountEntry>) {
    const { error } = await supabase
      .from('current_account_entries')
      .update({
        player_id: entry.playerId,
        type: entry.type,
        amount: entry.amount,
        description: entry.description,
        date: entry.date,
        time: entry.time,
        related_booking_id: entry.relatedBookingId,
        related_sale_id: entry.relatedSaleId,
        payment_method: entry.paymentMethod
      })
      .eq('id', id);

    if (error) throw error;
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('current_account_entries')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// Notifications
export const notificationsService = {
  async sendEmail(email: string, subject: string, message: string, bookingDetails?: { court?: string; date?: string; time?: string }) {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !anonKey) {
        throw new Error('Supabase configuration missing');
      }

      const functionUrl = `${supabaseUrl}/functions/v1/send-notification`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          email,
          subject,
          message,
          bookingDetails,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send notification');
      }

      const result = await response.json();
      console.log('✅ Notification sent:', result);
      return result;
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      throw error;
    }
  }
};
