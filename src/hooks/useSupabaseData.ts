import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
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

const isBrowserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const defaultScheduleSettings = { startTime: '08:00', endTime: '22:00' };

export const useSupabaseData = (enabled = true) => {
  const [courts, setCourts] = useState<Court[]>([]);
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [categories, setCategories] = useState<ConsumableCategory[]>([]);
  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [recurringBookings, setRecurringBookings] = useState<RecurringBooking[]>([]);
  const [courtUnavailabilities, setCourtUnavailabilities] = useState<CourtUnavailability[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [currentAccountEntries, setCurrentAccountEntries] = useState<CurrentAccountEntry[]>([]);
  const [scheduleSettings, setScheduleSettings] = useState(defaultScheduleSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetData = useCallback(() => {
    setCourts([]);
    setPlayers([]);
    setCategories([]);
    setConsumables([]);
    setBookings([]);
    setRecurringBookings([]);
    setCourtUnavailabilities([]);
    setTournaments([]);
    setSales([]);
    setCurrentAccountEntries([]);
    setScheduleSettings(defaultScheduleSettings);
  }, []);

  const loadData = useCallback(async () => {
    if (!enabled || !isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    if (isBrowserOffline()) {
      setError('Sin conexion a internet. No se pudo cargar Supabase.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: courtsData, error: courtsError } = await supabase
        .from('courts')
        .select('*')
        .order('name');

      if (courtsError) throw courtsError;

      setCourts((courtsData || []).map(court => ({
        id: court.id,
        name: court.name,
        description: court.description,
        pricePerTurn: court.price_per_turn,
        features: court.features || [],
        startTime: court.start_time || '08:00',
        endTime: court.end_time || '22:00'
      })));

      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .order('name');

      if (playersError) throw playersError;

      setPlayers((playersData || []).map(player => ({
        id: player.id,
        name: player.name,
        email: player.email,
        phone: player.phone,
        gender: player.gender,
        category: player.category,
        totalBookings: player.total_bookings,
        lastBooking: player.last_booking,
        createdAt: player.created_at
      })));

      const { data: categoriesData, error: categoriesError } = await supabase
        .from('consumable_categories')
        .select('*')
        .order('name');

      if (categoriesError) throw categoriesError;

      setCategories((categoriesData || []).map(category => ({
        id: category.id,
        name: category.name,
        label: category.label,
        color: category.color,
        defaultIcon: category.default_icon,
        createdAt: category.created_at
      })));

      const { data: consumablesData, error: consumablesError } = await supabase
        .from('consumables')
        .select('*')
        .order('name');

      if (consumablesError) throw consumablesError;

      setConsumables((consumablesData || []).map(consumable => ({
        id: consumable.id,
        name: consumable.name,
        description: consumable.description,
        price: consumable.price,
        category: consumable.category,
        available: consumable.available,
        icon: consumable.icon
      })));

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          booking_players(*),
          booking_consumptions(*)
        `)
        .order('date', { ascending: false });

      if (bookingsError) throw bookingsError;

      setBookings((bookingsData || []).map(booking => ({
        id: booking.id,
        courtId: booking.court_id,
        courtName: booking.court_name,
        date: booking.date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        totalPrice: booking.total_price,
        finalTotal: booking.final_total,
        status: booking.status as any,
        isRecurring: booking.is_recurring,
        recurringBookingId: booking.recurring_booking_id,
        closedAt: booking.closed_at,
        createdAt: booking.created_at,
        players: (booking.booking_players || []).map((bp: any) => ({
          id: bp.player_id,
          name: bp.player_name,
          email: bp.player_email,
          phone: bp.player_phone,
          isOrganizer: bp.is_organizer,
          paymentMethod: bp.payment_method,
          paymentSplits: bp.payment_splits || undefined
        })),
        consumptions: (booking.booking_consumptions || []).map((bc: any) => ({
          id: bc.id,
          consumableId: bc.consumable_id,
          name: bc.name,
          price: bc.price,
          quantity: bc.quantity,
          category: bc.category,
          splitBetweenPlayers: bc.split_between_players,
          assignedToPlayers: bc.assigned_to_players
        }))
      })));

      const { data: recurringData, error: recurringError } = await supabase
        .from('recurring_bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (recurringError) throw recurringError;

      setRecurringBookings((recurringData || []).map(recurring => ({
        id: recurring.id,
        playerId: recurring.player_id,
        playerName: recurring.player_name,
        courtId: recurring.court_id,
        courtName: recurring.court_name,
        dayOfWeek: recurring.day_of_week,
        startTime: recurring.start_time,
        endTime: recurring.end_time,
        isActive: recurring.is_active,
        skipDates: recurring.skip_dates,
        createdAt: recurring.created_at
      })));

      const { data: unavailabilityData, error: unavailabilityError } = await supabase
        .from('court_unavailabilities')
        .select('*')
        .order('created_at', { ascending: false });

      if (unavailabilityError) throw unavailabilityError;

      setCourtUnavailabilities((unavailabilityData || []).map(item => ({
        id: item.id,
        courtId: item.court_id,
        courtName: item.court_name,
        title: item.title,
        reason: item.reason,
        date: item.date || undefined,
        dayOfWeek: item.day_of_week ?? undefined,
        startTime: item.start_time,
        endTime: item.end_time,
        isRecurring: item.is_recurring,
        isActive: item.is_active,
        notes: item.notes || undefined,
        createdAt: item.created_at
      })));

      const { data: tournamentsData, error: tournamentsError } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });

      if (tournamentsError) throw tournamentsError;

      setTournaments((tournamentsData || []).map(tournament => ({
        id: tournament.id,
        name: tournament.name,
        isActive: tournament.is_active,
        pairs: tournament.pairs || [],
        zones: tournament.zones || [],
        playoffRounds: tournament.playoff_rounds || [],
        matches: tournament.matches || [],
        createdAt: tournament.created_at
      })));

      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          *,
          sale_items(*)
        `)
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;

      setSales((salesData || []).map(sale => ({
        id: sale.id,
        type: sale.type as any,
        date: sale.date,
        time: sale.time,
        customerType: sale.customer_type as any,
        customer: {
          id: sale.customer_id,
          name: sale.customer_name,
          email: sale.customer_email,
          phone: sale.customer_phone
        },
        items: (sale.sale_items || []).map((item: any) => ({
          id: item.id,
          consumableId: item.consumable_id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal
        })),
        totalAmount: sale.total_amount,
        paymentMethod: sale.payment_method as any,
        notes: sale.notes,
        bookingId: sale.booking_id,
        courtName: sale.court_name,
        createdAt: sale.created_at
      })));

      const { data: entriesData, error: entriesError } = await supabase
        .from('current_account_entries')
        .select('*')
        .order('created_at', { ascending: false });

      if (entriesError) throw entriesError;

      setCurrentAccountEntries((entriesData || []).map(entry => ({
        id: entry.id,
        playerId: entry.player_id,
        type: entry.type as any,
        amount: entry.amount,
        description: entry.description,
        date: entry.date,
        time: entry.time,
        relatedBookingId: entry.related_booking_id,
        relatedSaleId: entry.related_sale_id,
        paymentMethod: entry.payment_method as any,
        createdAt: entry.created_at
      })));

      const { data: scheduleData, error: scheduleError } = await supabase
        .from('schedule_settings')
        .select('*')
        .limit(1);

      if (scheduleError) throw scheduleError;

      if (scheduleData && scheduleData.length > 0) {
        setScheduleSettings({
          startTime: scheduleData[0].start_time,
          endTime: scheduleData[0].end_time
        });
      }
    } catch (err) {
      console.error('Error loading data from Supabase:', err);
      setError(err instanceof Error ? err.message : 'Error cargando datos de Supabase');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled && isSupabaseConfigured) {
      loadData();
    } else {
      resetData();
      setError(null);
      setLoading(false);
    }
  }, [enabled, loadData, resetData]);

  return {
    courts,
    players,
    categories,
    consumables,
    bookings,
    recurringBookings,
    courtUnavailabilities,
    tournaments,
    sales,
    currentAccountEntries,
    scheduleSettings,
    loading,
    error,
    refetch: loadData,
    setCourts,
    setPlayers,
    setCategories,
    setConsumables,
    setBookings,
    setRecurringBookings,
    setCourtUnavailabilities,
    setTournaments,
    setSales,
    setCurrentAccountEntries,
    setScheduleSettings
  };
};
