import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import BookingCalendar from './components/BookingCalendar';
import BookingForm from './components/BookingForm';
import BookingList from './components/BookingList';
import BookingEditForm from './components/BookingEditForm';
import TurnCloseForm from './components/TurnCloseForm';
import CourtList from './components/CourtList';
import CourtEditForm from './components/CourtEditForm';
import ConsumableList from './components/ConsumableList';
import ConsumableEditForm from './components/ConsumableEditForm';
import PlayerList from './components/PlayerList';
import PlayerEditForm from './components/PlayerEditForm';
import SalesList from './components/SalesList';
import SaleForm from './components/SaleForm';
import SaleDetailModal from './components/SaleDetailModal';
import CurrentAccountList from './components/CurrentAccountList';
import CurrentAccountDetail from './components/CurrentAccountDetail';
import PaymentForm from './components/PaymentForm';
import RecurringBookingList from './components/RecurringBookingList';
import RecurringBookingForm from './components/RecurringBookingForm';
import SkipDatesManager from './components/SkipDatesManager';
import CourtUnavailabilityManager from './components/CourtUnavailabilityManager';
import Dashboard from './components/Dashboard';
import PlayerDashboard from './components/PlayerDashboard';
import LoginForm from './components/LoginForm';
import UserManagement from './components/UserManagement';
import ChangePasswordForm from './components/ChangePasswordForm';
import TournamentManager from './components/TournamentManager';

import {
  Court,
  Booking,
  ConsumableItem,
  ConsumableCategory,
  PlayerProfile,
  Sale,
  CurrentAccountEntry,
  RecurringBooking,
  CourtUnavailability,
  Tournament,
  AppUser
} from './types';

import { generateRecurringBookings } from './utils/recurringBookings';
import { getPlayerCurrentAccount } from './utils/currentAccounts';
import { useSupabaseData } from './hooks/useSupabaseData';
import { useAuth } from './hooks/useAuth';
import { isSupabaseConfigured } from './lib/supabase';
import { 
  courtsService, 
  playersService, 
  categoriesService, 
  consumablesService, 
  bookingsService, 
  recurringBookingsService, 
  courtUnavailabilitiesService,
  tournamentsService,
  salesService, 
  currentAccountService 
} from './services/supabaseService';
import { calculatePlayerCost } from './utils/timeSlots';

function App() {
  const { user, loading: authLoading, error: authError, signIn, signOut, createUserAccount, updateUserRole, updatePassword, getAllUsers, toggleUserStatus, deleteUser, resetUserPassword, isAdmin, isPlayer, isAuthenticated } = useAuth();
  
  const {
    courts: dbCourts,
    players: dbPlayers,
    categories: dbCategories,
    consumables: dbConsumables,
    bookings: dbBookings,
    recurringBookings: dbRecurringBookings,
    courtUnavailabilities: dbCourtUnavailabilities,
    tournaments: dbTournaments,
    sales: dbSales,
    currentAccountEntries: dbCurrentAccountEntries,
    loading: dataLoading,
    error: dataError,
    refetch: refetchData,
    setCourts: setDbCourts,
    setPlayers: setDbPlayers,
    setCategories: setDbCategories,
    setConsumables: setDbConsumables,
    setBookings: setDbBookings,
    setRecurringBookings: setDbRecurringBookings,
    setCourtUnavailabilities: setDbCourtUnavailabilities,
    setTournaments: setDbTournaments,
    setSales: setDbSales,
    setCurrentAccountEntries: setDbCurrentAccountEntries
  } = useSupabaseData(!!user);

  const [users, setUsers] = useState<AppUser[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showCourtForm, setShowCourtForm] = useState(false);
  const [showConsumableForm, setShowConsumableForm] = useState(false);
  const [showPlayerForm, setShowPlayerForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showSaleDetail, setShowSaleDetail] = useState(false);
  const [showCurrentAccountDetail, setShowCurrentAccountDetail] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [showSkipDatesManager, setShowSkipDatesManager] = useState(false);
  const [showBookingEdit, setShowBookingEdit] = useState(false);
  const [showTurnClose, setShowTurnClose] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [editingConsumable, setEditingConsumable] = useState<ConsumableItem | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<PlayerProfile | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [viewingAccount, setViewingAccount] = useState<string | null>(null);
  const [paymentPlayer, setPaymentPlayer] = useState<string | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringBooking | null>(null);
  const [managingSkipDates, setManagingSkipDates] = useState<RecurringBooking | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [closingBooking, setClosingBooking] = useState<Booking | null>(null);

  const [prefilledBookingData, setPrefilledBookingData] = useState<{
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null>(null);

  const isSupabaseDataReady = isSupabaseConfigured && !dataLoading;

  const currentCourts = dbCourts;
  const currentPlayers = dbPlayers;
  const currentCategories = dbCategories;
  const currentConsumables = dbConsumables;
  const currentSales = dbSales;
  const currentCurrentAccountEntries = dbCurrentAccountEntries;
  const currentRecurringBookings = dbRecurringBookings;
  const currentCourtUnavailabilities = dbCourtUnavailabilities;
  const currentTournaments = dbTournaments;

  const currentBookings = React.useMemo(() => {
    const getCreatedAtTime = (booking: Booking) => {
      const createdAtTime = new Date(booking.createdAt).getTime();
      return Number.isNaN(createdAtTime) ? 0 : createdAtTime;
    };

    const getRecurringStatusRank = (booking: Booking) => {
      if (booking.status === 'completed') return 3;
      if (booking.status === 'cancelled') return 1;
      return 2;
    };

    const isPreferredRecurringBooking = (candidate: Booking, current: Booking) => {
      const candidateRank = getRecurringStatusRank(candidate);
      const currentRank = getRecurringStatusRank(current);

      if (candidateRank !== currentRank) {
        return candidateRank > currentRank;
      }

      return getCreatedAtTime(candidate) > getCreatedAtTime(current);
    };

    const syncedBookings = dbBookings.map(booking => {
      if (
        !booking.isRecurring ||
        !booking.recurringBookingId ||
        booking.status === 'cancelled' ||
        booking.status === 'completed'
      ) {
        return booking;
      }

      const recurring = currentRecurringBookings.find(item => item.id === booking.recurringBookingId);
      if (!recurring) {
        return booking;
      }

      const playerProfile = currentPlayers.find(player => player.id === recurring.playerId);
      const recurringOrganizer = {
        id: recurring.playerId,
        name: recurring.playerName,
        email: playerProfile?.email || '',
        phone: playerProfile?.phone || '',
        isOrganizer: true
      };
      const currentOrganizer = booking.players.find(player => player.isOrganizer) || booking.players[0];
      const otherPlayers = booking.players.filter(player =>
        !player.isOrganizer && player.id !== recurringOrganizer.id
      );

      if (
        currentOrganizer?.id === recurringOrganizer.id &&
        currentOrganizer?.name === recurringOrganizer.name &&
        currentOrganizer?.email === recurringOrganizer.email &&
        currentOrganizer?.phone === recurringOrganizer.phone &&
        currentOrganizer?.isOrganizer === true
      ) {
        return booking;
      }

      return {
        ...booking,
        courtId: recurring.courtId,
        courtName: recurring.courtName,
        startTime: recurring.startTime,
        endTime: recurring.endTime,
        players: [recurringOrganizer, ...otherPlayers]
      };
    });

    const latestByRecurringSlot = new Map<string, Booking>();
    const regularBookings: Booking[] = [];

    syncedBookings.forEach(booking => {
      if (!booking.isRecurring) {
        regularBookings.push(booking);
        return;
      }

      const slotKey = [
        booking.courtId,
        booking.date,
        booking.startTime,
        booking.endTime
      ].join('|');
      const current = latestByRecurringSlot.get(slotKey);

      if (!current || isPreferredRecurringBooking(booking, current)) {
        latestByRecurringSlot.set(slotKey, booking);
      }
    });

    return [...regularBookings, ...latestByRecurringSlot.values()];
  }, [dbBookings, currentPlayers, currentRecurringBookings]);
  const localCourts = dbCourts;
  const setLocalCourts = setDbCourts;
  const localPlayers = dbPlayers;
  const setLocalPlayers = setDbPlayers;
  const localBookings = dbBookings;
  const setLocalBookings = setDbBookings;
  const localCategories = dbCategories;
  const setLocalCategories = setDbCategories;
  const localConsumables = dbConsumables;
  const setLocalConsumables = setDbConsumables;
  const localSales = dbSales;
  const setLocalSales = setDbSales;
  const localCurrentAccountEntries = dbCurrentAccountEntries;
  const setLocalCurrentAccountEntries = setDbCurrentAccountEntries;
  const localRecurringBookings = dbRecurringBookings;
  const setLocalRecurringBookings = setDbRecurringBookings;
  const setLocalCourtUnavailabilities = setDbCourtUnavailabilities;
  const localTournaments = dbTournaments;
  const setLocalTournaments = setDbTournaments;
  
  // Generate recurring bookings automatically
  const [generationState, setGenerationState] = useState({
    hasGenerated: false,
    lastRecurringCount: 0,
    lastBookingCount: 0
  });

  useEffect(() => {
    const recurringCount = currentRecurringBookings.length;
    const bookingCount = currentBookings.length;
    
    // Only generate if:
    // 1. We haven't generated yet, OR
    // 2. The number of recurring bookings changed
    const shouldGenerate = !generationState.hasGenerated || 
                          generationState.lastRecurringCount !== recurringCount;
    
    if (shouldGenerate && recurringCount > 0) {
      console.log('Generating recurring bookings...', {
        recurringCount,
        bookingCount,
        hasGenerated: generationState.hasGenerated
      });
      
      try {
        const newRecurringBookings = generateRecurringBookings(
          currentRecurringBookings,
          currentBookings,
          currentCourtUnavailabilities,
          4 // 4 weeks ahead
        );

        console.log('Generated bookings:', newRecurringBookings.length);

        if (newRecurringBookings.length > 0) {
          newRecurringBookings.forEach(async (newBooking) => {
            try {
              if (!isSupabaseDataReady) return;

              const bookingId = await bookingsService.create(newBooking);
              console.log('Created recurring booking in DB:', bookingId);
            } catch (error: any) {
              if (!error.message?.includes('duplicate') && !error.message?.includes('unique')) {
                console.error('Error creating recurring booking:', error);
              }
            }
          });

          if (isSupabaseDataReady) {
            setTimeout(() => refetchData(), 1000);
          }
        }

        setGenerationState({
          hasGenerated: true,
          lastRecurringCount: recurringCount,
          lastBookingCount: bookingCount
        });
      } catch (error) {
        console.error('Error generating recurring bookings:', error);
      }
    }
  }, [currentRecurringBookings.length, currentBookings.length, generationState.hasGenerated]);

  // Load users from app-level system
  useEffect(() => {
    if (isAuthenticated() && isAdmin()) {
      (async () => {
        const appUsers = await getAllUsers();
        setUsers(appUsers);
      })();
    }
  }, [user, isAuthenticated, isAdmin]);

  // Show loading screen during authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="max-w-md bg-white rounded-xl border border-red-200 p-6 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Supabase no configurado</h1>
          <p className="text-gray-600">
            La app requiere `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. No hay modo local habilitado.
          </p>
        </div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!isAuthenticated()) {
    return (
      <LoginForm 
        onLogin={signIn}
        loading={authLoading}
        error={authError}
      />
    );
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando datos desde Supabase...</p>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="max-w-md bg-white rounded-xl border border-red-200 p-6 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Error de sincronizacion</h1>
          <p className="text-gray-600">
            No se pudieron cargar los datos desde Supabase.
          </p>
          <p className="text-sm text-red-600 mt-3">{dataError}</p>
        </div>
      </div>
    );
  }

  const handleLogin = async (username: string, password: string) => {
    return await signIn(username, password);
  };

  const handleCreateUser = async (username: string, password: string, role: 'admin' | 'player', playerId?: string) => {
    const result = await createUserAccount(username, password, role, playerId);
    if (result.success) {
      const appUsers = await getAllUsers();
      setUsers(appUsers);
    }
    return result;
  };

  const handleToggleUserStatus = async (userId: string, isActive: boolean) => {
    toggleUserStatus(userId, isActive);
    const appUsers = await getAllUsers();
    setUsers(appUsers);
  };

  const handleUpdateUserRole = async (userId: string, role: 'admin' | 'player', playerId?: string) => {
    const result = await updateUserRole(userId, role, playerId);
    if (result.success) {
      const appUsers = await getAllUsers();
      setUsers(appUsers);
    }
    return result;
  };

  const handleDeleteUser = async (userId: string) => {
    deleteUser(userId);
    const appUsers = await getAllUsers();
    setUsers(appUsers);
  };

  const handleResetPassword = async (userId: string, newPassword: string) => {
    const result = await resetUserPassword(userId, newPassword);
    if (result.success) {
      const appUsers = await getAllUsers();
      setUsers(appUsers);
    }
    return result;
  };

  const handleChangePassword = async (newPassword: string) => {
    return await updatePassword(newPassword);
  };

  // Court management
  const handleCourtSave = async (courtData: Omit<Court, 'id'> & { id?: string }) => {
    try {
      if (isSupabaseDataReady) {
        if (courtData.id) {
          const updatedCourt = await courtsService.update(courtData.id, courtData);
          if (updatedCourt === null) {
            // Supabase failed, use local data
            setLocalCourts(prev => prev.map(court => court.id === courtData.id ? { ...courtData, id: courtData.id } : court));
          } else {
            setDbCourts(prev => prev.map(court => court.id === courtData.id ? updatedCourt : court));
          }
        } else {
          const newCourt = await courtsService.create(courtData);
          if (newCourt === null) {
            // Supabase failed, use local data
            const localCourt = { ...courtData, id: Date.now().toString() };
            setLocalCourts(prev => [...prev, localCourt]);
          } else {
            setDbCourts(prev => [...prev, newCourt]);
          }
        }
      } else {
        if (courtData.id) {
          setLocalCourts(prev => prev.map(court => court.id === courtData.id ? { ...courtData, id: courtData.id } : court));
        } else {
          const newCourt = { ...courtData, id: Date.now().toString() };
          setLocalCourts(prev => [...prev, newCourt]);
        }
      }
      setShowCourtForm(false);
      setEditingCourt(null);
    } catch (error) {
      console.error('Error saving court:', error);
      alert('Error al guardar la cancha');
    }
  };

  const handleCourtDelete = async (courtId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta cancha?')) return;
    
    try {
      if (isSupabaseDataReady) {
        await courtsService.delete(courtId);
        setDbCourts(prev => prev.filter(court => court.id !== courtId));
      } else {
        setLocalCourts(prev => prev.filter(court => court.id !== courtId));
      }
    } catch (error) {
      console.error('Error deleting court:', error);
      alert('Error al eliminar la cancha');
    }
  };

  // Player management
  const handlePlayerSave = async (playerData: Omit<PlayerProfile, 'id' | 'createdAt' | 'totalBookings' | 'lastBooking'> & { id?: string }) => {
    try {
      if (isSupabaseDataReady) {
        try {
          if (playerData.id) {
            const updatedPlayer = await playersService.update(playerData.id, playerData);
            setDbPlayers(prev => prev.map(player => player.id === playerData.id ? updatedPlayer : player));
          } else {
            const newPlayer = await playersService.create(playerData);
            setDbPlayers(prev => [...prev, newPlayer]);
          }
        } catch (supabaseError: any) {
          // If it's an RLS error, fall back to local data
          if (supabaseError.code === '42501') {
            console.log('RLS error detected, falling back to local data');
            if (playerData.id) {
              setLocalPlayers(prev => prev.map(player => 
                player.id === playerData.id 
                  ? { ...player, ...playerData, id: playerData.id }
                  : player
              ));
            } else {
              const newPlayer: PlayerProfile = {
                ...playerData,
                id: Date.now().toString(),
                createdAt: new Date().toISOString(),
                totalBookings: 0
              };
              setLocalPlayers(prev => [...prev, newPlayer]);
            }
          } else {
            throw supabaseError;
          }
        }
      } else {
        if (playerData.id) {
          setLocalPlayers(prev => prev.map(player => 
            player.id === playerData.id 
              ? { ...player, ...playerData, id: playerData.id }
              : player
          ));
        } else {
          const newPlayer: PlayerProfile = {
            ...playerData,
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            totalBookings: 0
          };
          setLocalPlayers(prev => [...prev, newPlayer]);
        }
      }
      setShowPlayerForm(false);
      setEditingPlayer(null);
    } catch (error) {
      // Only show error if it's not a successful fallback to local data
      if (!(error instanceof Error && error.message === 'SUPABASE_ERROR')) {
        console.error('Error saving player:', error);
        alert('Error al guardar el jugador');
      }
    }
  };

  const handlePlayerDelete = async (playerId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este jugador?')) return;
    
    try {
      if (isSupabaseDataReady) {
        await playersService.delete(playerId);
        setDbPlayers(prev => prev.filter(player => player.id !== playerId));
      } else {
        setLocalPlayers(prev => prev.filter(player => player.id !== playerId));
      }
    } catch (error) {
      console.error('Error deleting player:', error);
      alert('Error al eliminar el jugador');
    }
  };

  // Consumable management
  const handleConsumableSave = async (consumableData: Omit<ConsumableItem, 'id'> & { id?: string }) => {
    try {
      if (isSupabaseDataReady) {
        try {
          if (consumableData.id) {
            const updatedConsumable = await consumablesService.update(consumableData.id, consumableData);
            setDbConsumables(prev => prev.map(consumable => consumable.id === consumableData.id ? updatedConsumable : consumable));
          } else {
            const newConsumable = await consumablesService.create(consumableData);
            setDbConsumables(prev => [...prev, newConsumable]);
          }
        } catch (supabaseError: any) {
          // If it's an RLS error, fall back to local data
          if (supabaseError.code === '42501') {
            console.log('RLS error detected, falling back to local data');
            if (consumableData.id) {
              setLocalConsumables(prev => prev.map(consumable => 
                consumable.id === consumableData.id 
                  ? { ...consumableData, id: consumableData.id }
                  : consumable
              ));
            } else {
              const newConsumable = { ...consumableData, id: Date.now().toString() };
              setLocalConsumables(prev => [...prev, newConsumable]);
            }
          } else {
            throw supabaseError;
          }
        }
      } else {
        if (consumableData.id) {
          setLocalConsumables(prev => prev.map(consumable => 
            consumable.id === consumableData.id 
              ? { ...consumableData, id: consumableData.id }
              : consumable
          ));
        } else {
          const newConsumable = { ...consumableData, id: Date.now().toString() };
          setLocalConsumables(prev => [...prev, newConsumable]);
        }
      }
      setShowConsumableForm(false);
      setEditingConsumable(null);
    } catch (error) {
      console.error('Error saving consumable:', error);
      alert('Error al guardar el consumible');
    }
  };

  const handleConsumableDelete = async (consumableId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este consumible?')) return;
    
    try {
      if (isSupabaseDataReady) {
        await consumablesService.delete(consumableId);
        setDbConsumables(prev => prev.filter(consumable => consumable.id !== consumableId));
      } else {
        setLocalConsumables(prev => prev.filter(consumable => consumable.id !== consumableId));
      }
    } catch (error) {
      console.error('Error deleting consumable:', error);
      alert('Error al eliminar el consumible');
    }
  };

  const handleCategoriesUpdate = async (updatedCategories: ConsumableCategory[]) => {
    try {
      if (isSupabaseDataReady) {
        const previousCategoriesById = new Map(currentCategories.map(category => [category.id, category]));
        const updatedCategoriesById = new Map(updatedCategories.map(category => [category.id, category]));
        const syncedCategories: ConsumableCategory[] = [];
        const renamedCategories: Array<{ from: string; to: string }> = [];

        for (const category of updatedCategories) {
          const previousCategory = previousCategoriesById.get(category.id);

          if (!previousCategory) {
            const createdCategory = await categoriesService.create({
              name: category.name,
              label: category.label,
              color: category.color,
              defaultIcon: category.defaultIcon
            });
            syncedCategories.push(createdCategory);
            continue;
          }

          const hasChanges =
            previousCategory.name !== category.name ||
            previousCategory.label !== category.label ||
            previousCategory.color !== category.color ||
            previousCategory.defaultIcon !== category.defaultIcon;

          if (hasChanges) {
            const updatedCategory = await categoriesService.update(category.id, {
              name: category.name,
              label: category.label,
              color: category.color,
              defaultIcon: category.defaultIcon
            });
            syncedCategories.push(updatedCategory);

            if (previousCategory.name !== updatedCategory.name) {
              renamedCategories.push({ from: previousCategory.name, to: updatedCategory.name });
            }
          } else {
            syncedCategories.push(category);
          }
        }

        for (const category of currentCategories) {
          if (!updatedCategoriesById.has(category.id)) {
            await categoriesService.delete(category.id);
          }
        }

        let syncedConsumables = currentConsumables;
        for (const renamedCategory of renamedCategories) {
          const consumablesToUpdate = syncedConsumables.filter(
            consumable => consumable.category === renamedCategory.from
          );

          for (const consumable of consumablesToUpdate) {
            const updatedConsumable = await consumablesService.update(consumable.id, {
              ...consumable,
              category: renamedCategory.to
            });
            syncedConsumables = syncedConsumables.map(item =>
              item.id === updatedConsumable.id ? updatedConsumable : item
            );
          }
        }

        setDbCategories(syncedCategories);
        setDbConsumables(syncedConsumables);
      } else {
        setLocalCategories(updatedCategories);
      }
    } catch (error) {
      console.error('Error updating categories:', error);
      alert('Error al actualizar las categorías');
    }
  };

  // Booking management
  const handleBookingCreate = async (bookingData: Omit<Booking, 'id'>) => {
    try {
      if (isSupabaseDataReady) {
        const bookingId = await bookingsService.create(bookingData);
        console.log('Booking created with ID:', bookingId);
        refetchData(); // Refresh all data
      } else {
        const newBooking: Booking = {
          ...bookingData,
          id: Date.now().toString()
        };
        setLocalBookings(prev => [...prev, newBooking]);
        
        // Update player's booking count
        const organizerPlayer = bookingData.players.find(p => p.isOrganizer);
        if (organizerPlayer) {
          setLocalPlayers(prev => prev.map(player => 
            player.id === organizerPlayer.id 
              ? { 
                  ...player, 
                  totalBookings: player.totalBookings + 1,
                  lastBooking: bookingData.date
                }
              : player
          ));
        }
      }
      
      setShowBookingForm(false);
      setPrefilledBookingData(null);
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('Error al crear la reserva');
    }
  };

  const handleBookingCancel = async (bookingId: string) => {
    try {
      if (isSupabaseDataReady) {
        await bookingsService.update(bookingId, { status: 'cancelled' });
        setDbBookings(prev => prev.map(booking => 
          booking.id === bookingId ? { ...booking, status: 'cancelled' } : booking
        ));
      } else {
        setLocalBookings(prev => prev.map(booking => 
          booking.id === bookingId ? { ...booking, status: 'cancelled' } : booking
        ));
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Error al cancelar la reserva');
    }
  };

  const handleBookingEdit = (booking: Booking) => {
    setEditingBooking(booking);
    setShowBookingEdit(true);
  };

  const getPlayerCurrentAccountAmount = (booking: Booking, playerId: string, fallbackAmount: number) => {
    const player = booking.players.find(p => p.id === playerId);
    const currentAccountSplits = player?.paymentSplits?.filter(split => split.method === 'current_account') || [];

    if (currentAccountSplits.length > 0) {
      const currentAccountAmount = currentAccountSplits.reduce((total, split) => total + split.amount, 0);
      const allSplitsTotal = player?.paymentSplits?.reduce((total, split) => total + split.amount, 0) || 0;
      const unassignedDifference = Math.round((fallbackAmount - allSplitsTotal) * 100) / 100;

      return currentAccountAmount + Math.max(0, unassignedDifference);
    }

    return player?.paymentMethod === 'current_account' ? fallbackAmount : 0;
  };

  const syncCompletedBookingCurrentAccountEntries = async (booking: Booking, persistToSupabase: boolean) => {
    const relatedEntries = currentCurrentAccountEntries.filter(entry => entry.relatedBookingId === booking.id);

    if (persistToSupabase) {
      await Promise.all(relatedEntries.map(entry => currentAccountService.delete(entry.id)));
    }

    setDbCurrentAccountEntries(prev => prev.filter(entry => entry.relatedBookingId !== booking.id));

    const playerCosts = calculatePlayerCost(booking);
    const entriesToCreate = booking.players
      .map(player => {
        const playerCost = playerCosts[player.id] || 0;
        const currentAccountAmount = getPlayerCurrentAccountAmount(booking, player.id, playerCost);

        if (currentAccountAmount <= 0) {
          return null;
        }

        return {
          playerId: player.id,
          type: 'debit' as const,
          amount: Math.round(currentAccountAmount),
          description: `Turno en ${booking.courtName} - ${booking.date}`,
          date: booking.date,
          time: booking.startTime,
          relatedBookingId: booking.id
        };
      })
      .filter((entry): entry is Omit<CurrentAccountEntry, 'id' | 'createdAt'> => entry !== null);

    if (entriesToCreate.length === 0) {
      return;
    }

    if (persistToSupabase) {
      const createdEntries: CurrentAccountEntry[] = [];

      for (const entry of entriesToCreate) {
        const entryId = await currentAccountService.create(entry);
        createdEntries.push({
          ...entry,
          id: entryId,
          createdAt: new Date().toISOString()
        });
      }

      setDbCurrentAccountEntries(prev => [...prev, ...createdEntries]);
    } else {
      const createdEntries = entriesToCreate.map(entry => ({
        ...entry,
        id: (Date.now() + Math.random()).toString(),
        createdAt: new Date().toISOString()
      }));

      setLocalCurrentAccountEntries(prev => [...prev, ...createdEntries]);
    }
  };

  const handleBookingUpdate = async (updatedBooking: Booking) => {
    try {
      if (isSupabaseDataReady) {
        await bookingsService.update(updatedBooking.id, updatedBooking);
        setDbBookings(prev => prev.map(booking => 
          booking.id === updatedBooking.id ? updatedBooking : booking
        ));
        if (updatedBooking.status === 'completed') {
          await syncCompletedBookingCurrentAccountEntries(updatedBooking, true);
        }
      } else {
        setLocalBookings(prev => prev.map(booking => 
          booking.id === updatedBooking.id ? updatedBooking : booking
        ));
        if (updatedBooking.status === 'completed') {
          await syncCompletedBookingCurrentAccountEntries(updatedBooking, false);
        }
      }
      setShowBookingEdit(false);
      setEditingBooking(null);
    } catch (error) {
      console.error('Error updating booking:', error);
      alert('Error al actualizar la reserva');
    }
  };

  const handleBookingClose = (booking: Booking) => {
    setClosingBooking(booking);
    setShowTurnClose(true);
  };

  const handleTurnClose = async (updatedBooking: Booking) => {
    try {
      if (isSupabaseDataReady) {
        await bookingsService.update(updatedBooking.id, updatedBooking);
        setDbBookings(prev => prev.map(booking => 
          booking.id === updatedBooking.id ? updatedBooking : booking
        ));
        await syncCompletedBookingCurrentAccountEntries(updatedBooking, true);
      } else {
        setLocalBookings(prev => prev.map(booking => 
          booking.id === updatedBooking.id ? updatedBooking : booking
        ));
        await syncCompletedBookingCurrentAccountEntries(updatedBooking, false);
      }
      setShowTurnClose(false);
      setClosingBooking(null);
    } catch (error) {
      console.error('Error closing turn:', error);
      alert('Error al finalizar el turno');
    }
  };

  // Recurring booking management
  const handleRecurringSave = async (recurringData: Omit<RecurringBooking, 'id' | 'createdAt'>) => {
    try {
      const getBookingsWithUpdatedRecurringPlayer = () => {
        if (!editingRecurring) {
          return [];
        }

        const selectedPlayer = currentPlayers.find(player => player.id === recurringData.playerId);
        const recurringPlayer = {
          id: recurringData.playerId,
          name: recurringData.playerName,
          email: selectedPlayer?.email || '',
          phone: selectedPlayer?.phone || '',
          isOrganizer: true
        };

        return currentBookings
          .filter(booking =>
            booking.isRecurring &&
            booking.recurringBookingId === editingRecurring.id &&
            booking.status !== 'cancelled' &&
            booking.status !== 'completed'
          )
          .filter(booking => {
            const currentOrganizer = booking.players.find(player => player.isOrganizer) || booking.players[0];

            return (
              currentOrganizer?.id !== recurringPlayer.id ||
              currentOrganizer?.name !== recurringPlayer.name ||
              currentOrganizer?.email !== recurringPlayer.email ||
              currentOrganizer?.phone !== recurringPlayer.phone ||
              currentOrganizer?.isOrganizer !== true ||
              booking.courtId !== recurringData.courtId ||
              booking.courtName !== recurringData.courtName ||
              booking.startTime !== recurringData.startTime ||
              booking.endTime !== recurringData.endTime
            );
          })
          .map(booking => {
            const otherPlayers = booking.players.filter(player =>
              !player.isOrganizer && player.id !== recurringPlayer.id
            );

            return {
              ...booking,
              courtId: recurringData.courtId,
              courtName: recurringData.courtName,
              startTime: recurringData.startTime,
              endTime: recurringData.endTime,
              players: [recurringPlayer, ...otherPlayers]
            };
          });
      };

      const syncRecurringPlayerBookings = async (persistToSupabase: boolean) => {
        const updatedBookings = getBookingsWithUpdatedRecurringPlayer();
        if (updatedBookings.length === 0) return;

        if (persistToSupabase) {
          await Promise.all(updatedBookings.map(booking =>
            bookingsService.update(booking.id, booking)
          ));
        }

        const updatedBookingIds = new Set(updatedBookings.map(booking => booking.id));
        setDbBookings(prev => prev.map(booking =>
          updatedBookingIds.has(booking.id)
            ? updatedBookings.find(updatedBooking => updatedBooking.id === booking.id) || booking
            : booking
        ));
      };

      if (isSupabaseDataReady) {
        try {
          if (editingRecurring) {
            await recurringBookingsService.update(editingRecurring.id, recurringData);
            await syncRecurringPlayerBookings(true);
            setDbRecurringBookings(prev => prev.map(recurring => 
              recurring.id === editingRecurring.id 
                ? { ...recurring, ...recurringData }
                : recurring
            ));
          } else {
            const recurringId = await recurringBookingsService.create(recurringData);
            const newRecurring: RecurringBooking = {
              ...recurringData,
              id: recurringId,
              createdAt: new Date().toISOString()
            };
            setDbRecurringBookings(prev => [...prev, newRecurring]);
          }
        } catch (supabaseError: any) {
          // If it's an RLS error, fall back to local data
          if (supabaseError.code === '42501') {
            console.log('RLS error detected, falling back to local data');
            if (editingRecurring) {
              await syncRecurringPlayerBookings(false);
              setLocalRecurringBookings(prev => prev.map(recurring => 
                recurring.id === editingRecurring.id 
                  ? { ...recurring, ...recurringData }
                  : recurring
              ));
            } else {
              const newRecurring: RecurringBooking = {
                ...recurringData,
                id: Date.now().toString(),
                createdAt: new Date().toISOString()
              };
              setLocalRecurringBookings(prev => [...prev, newRecurring]);
            }
          } else {
            throw supabaseError;
          }
        }
      } else {
        if (editingRecurring) {
          await syncRecurringPlayerBookings(false);
          setLocalRecurringBookings(prev => prev.map(recurring => 
            recurring.id === editingRecurring.id 
              ? { ...recurring, ...recurringData }
              : recurring
          ));
        } else {
          const newRecurring: RecurringBooking = {
            ...recurringData,
            id: Date.now().toString(),
            createdAt: new Date().toISOString()
          };
          setLocalRecurringBookings(prev => [...prev, newRecurring]);
        }
      }
      setShowRecurringForm(false);
      setEditingRecurring(null);
    } catch (error) {
      console.error('Error saving recurring booking:', error);
      alert('Error al guardar el turno fijo');
    }
  };

  const handleRecurringDelete = async (recurringId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este turno fijo?')) return;
    
    try {
      if (isSupabaseDataReady) {
        await recurringBookingsService.delete(recurringId);
        setDbRecurringBookings(prev => prev.filter(recurring => recurring.id !== recurringId));
      } else {
        setLocalRecurringBookings(prev => prev.filter(recurring => recurring.id !== recurringId));
      }
    } catch (error) {
      console.error('Error deleting recurring booking:', error);
      alert('Error al eliminar el turno fijo');
    }
  };

  const handleRecurringToggle = async (recurringId: string) => {
    try {
      const recurring = currentRecurringBookings.find(r => r.id === recurringId);
      if (!recurring) return;

      const updatedRecurring = { ...recurring, isActive: !recurring.isActive };
      
      if (isSupabaseDataReady) {
        await recurringBookingsService.update(recurringId, updatedRecurring);
        setDbRecurringBookings(prev => prev.map(r => 
          r.id === recurringId ? updatedRecurring : r
        ));
      } else {
        setLocalRecurringBookings(prev => prev.map(r => 
          r.id === recurringId ? updatedRecurring : r
        ));
      }
    } catch (error) {
      console.error('Error toggling recurring booking:', error);
      alert('Error al cambiar el estado del turno fijo');
    }
  };

  const handleSkipDatesUpdate = async (recurringId: string, skipDates: string[]) => {
    try {
      const recurring = currentRecurringBookings.find(r => r.id === recurringId);
      const previousSkipDates = recurring?.skipDates || [];
      const addedSkipDates = skipDates.filter(date => !previousSkipDates.includes(date));
      const bookingsToRelease = currentBookings.filter(booking =>
        booking.isRecurring &&
        booking.recurringBookingId === recurringId &&
        addedSkipDates.includes(booking.date) &&
        (booking.status === 'confirmed' || booking.status === 'pending')
      );

      if (isSupabaseDataReady) {
        await recurringBookingsService.update(recurringId, { skipDates });
        await Promise.all(bookingsToRelease.map(booking => bookingsService.delete(booking.id)));

        setDbRecurringBookings(prev => prev.map(recurring => 
          recurring.id === recurringId ? { ...recurring, skipDates } : recurring
        ));
        if (bookingsToRelease.length > 0) {
          const releasedBookingIds = new Set(bookingsToRelease.map(booking => booking.id));
          setDbBookings(prev => prev.filter(booking => !releasedBookingIds.has(booking.id)));
        }
      } else {
        setLocalRecurringBookings(prev => prev.map(recurring => 
          recurring.id === recurringId ? { ...recurring, skipDates } : recurring
        ));
        if (bookingsToRelease.length > 0) {
          const releasedBookingIds = new Set(bookingsToRelease.map(booking => booking.id));
          setLocalBookings(prev => prev.filter(booking => !releasedBookingIds.has(booking.id)));
        }
      }

      setGenerationState(prev => ({ ...prev, hasGenerated: false }));
      setShowSkipDatesManager(false);
      setManagingSkipDates(null);
    } catch (error) {
      console.error('Error updating skip dates:', error);
      alert('Error al actualizar las fechas de excepción');
    }
  };

  const handleCourtUnavailabilitySave = async (
    unavailabilityData: Omit<CourtUnavailability, 'id' | 'createdAt'>,
    id?: string
  ) => {
    try {
      if (isSupabaseDataReady) {
        if (id) {
          const updated = await courtUnavailabilitiesService.update(id, unavailabilityData);
          setDbCourtUnavailabilities(prev => prev.map(item => item.id === id ? updated : item));
        } else {
          const created = await courtUnavailabilitiesService.create(unavailabilityData);
          setDbCourtUnavailabilities(prev => [...prev, created]);
        }
      } else {
        if (id) {
          setLocalCourtUnavailabilities(prev => prev.map(item =>
            item.id === id ? { ...item, ...unavailabilityData } : item
          ));
        } else {
          const created: CourtUnavailability = {
            ...unavailabilityData,
            id: Date.now().toString(),
            createdAt: new Date().toISOString()
          };
          setLocalCourtUnavailabilities(prev => [...prev, created]);
        }
      }
    } catch (error) {
      console.error('Error saving court unavailability:', error);
      alert('Error al guardar el bloqueo de disponibilidad');
    }
  };

  const handleCourtUnavailabilityDelete = async (id: string) => {
    if (!confirm('Estas seguro de que quieres eliminar este bloqueo?')) return;

    try {
      if (isSupabaseDataReady) {
        await courtUnavailabilitiesService.delete(id);
        setDbCourtUnavailabilities(prev => prev.filter(item => item.id !== id));
      } else {
        setLocalCourtUnavailabilities(prev => prev.filter(item => item.id !== id));
      }
    } catch (error) {
      console.error('Error deleting court unavailability:', error);
      alert('Error al eliminar el bloqueo');
    }
  };

  // Tournament management
  const handleTournamentSave = async (tournamentData: Omit<Tournament, 'id' | 'createdAt'> & { id?: string }) => {
    try {
      if (isSupabaseDataReady) {
        if (tournamentData.id) {
          const updatedTournament = await tournamentsService.update(tournamentData.id, tournamentData);
          setDbTournaments(prev => prev.map(tournament =>
            tournament.id === tournamentData.id ? updatedTournament : { ...tournament, isActive: tournamentData.isActive ? false : tournament.isActive }
          ));
        } else {
          const newTournament = await tournamentsService.create(tournamentData);
          setDbTournaments(prev => [
            ...prev.map(tournament => ({ ...tournament, isActive: tournamentData.isActive ? false : tournament.isActive })),
            newTournament
          ]);
        }
      } else {
        if (tournamentData.id) {
          setLocalTournaments(prev => prev.map(tournament =>
            tournament.id === tournamentData.id
              ? { ...tournament, ...tournamentData }
              : { ...tournament, isActive: tournamentData.isActive ? false : tournament.isActive }
          ));
        } else {
          const newTournament: Tournament = {
            ...tournamentData,
            id: Date.now().toString(),
            createdAt: new Date().toISOString()
          };
          setLocalTournaments(prev => [
            ...prev.map(tournament => ({ ...tournament, isActive: tournamentData.isActive ? false : tournament.isActive })),
            newTournament
          ]);
        }
      }
    } catch (error) {
      console.error('Error saving tournament:', error);
      alert('Error al guardar el torneo');
    }
  };

  const handleTournamentDelete = async (tournamentId: string) => {
    if (!confirm('Seguro que quieres eliminar este torneo?')) return;

    try {
      if (isSupabaseDataReady) {
        await tournamentsService.delete(tournamentId);
        setDbTournaments(prev => prev.filter(tournament => tournament.id !== tournamentId));
      } else {
        setLocalTournaments(prev => prev.filter(tournament => tournament.id !== tournamentId));
      }
    } catch (error) {
      console.error('Error deleting tournament:', error);
      alert('Error al eliminar el torneo');
    }
  };

  // Sale management
  const handleSaleSave = async (saleData: Omit<Sale, 'id' | 'createdAt'>) => {
    const buildSaleCurrentAccountEntry = (
      saleId: string
    ): Omit<CurrentAccountEntry, 'id' | 'createdAt'> | null => {
      if (saleData.paymentMethod !== 'current_account' || !saleData.customer.id) {
        return null;
      }

      return {
        playerId: saleData.customer.id,
        type: 'debit',
        amount: saleData.totalAmount,
        description: `Venta directa - ${saleData.items.map(item => item.name).join(', ')}`,
        date: saleData.date,
        time: saleData.time,
        relatedSaleId: saleId
      };
    };

    const syncSaleCurrentAccountEntry = async (saleId: string, persistToSupabase: boolean) => {
      const relatedEntry = currentCurrentAccountEntries.find(entry => entry.relatedSaleId === saleId);
      const entryData = buildSaleCurrentAccountEntry(saleId);

      if (entryData) {
        if (relatedEntry) {
          if (persistToSupabase) {
            await currentAccountService.update(relatedEntry.id, entryData);
          }

          setDbCurrentAccountEntries(prev => prev.map(entry =>
            entry.id === relatedEntry.id
              ? { ...entry, ...entryData }
              : entry
          ));
        } else {
          if (persistToSupabase) {
            const entryId = await currentAccountService.create(entryData);
            const newEntry: CurrentAccountEntry = {
              ...entryData,
              id: entryId,
              createdAt: new Date().toISOString()
            };
            setDbCurrentAccountEntries(prev => [...prev, newEntry]);
          } else {
            const newEntry: CurrentAccountEntry = {
              ...entryData,
              id: (Date.now() + 1).toString(),
              createdAt: new Date().toISOString()
            };
            setLocalCurrentAccountEntries(prev => [...prev, newEntry]);
          }
        }
      } else if (relatedEntry) {
        if (persistToSupabase) {
          await currentAccountService.delete(relatedEntry.id);
        }

        setDbCurrentAccountEntries(prev => prev.filter(entry => entry.id !== relatedEntry.id));
      }
    };

    try {
      if (isSupabaseDataReady) {
        if (editingSale) {
          await salesService.update(editingSale.id, { ...saleData, id: editingSale.id, createdAt: editingSale.createdAt });
          setDbSales(prev => prev.map(sale => 
            sale.id === editingSale.id 
              ? { ...saleData, id: editingSale.id, createdAt: editingSale.createdAt }
              : sale
          ));
          await syncSaleCurrentAccountEntry(editingSale.id, true);
        } else {
          const saleId = await salesService.create(saleData);
          const newSale: Sale = {
            ...saleData,
            id: saleId,
            createdAt: new Date().toISOString()
          };
          setDbSales(prev => [...prev, newSale]);
          await syncSaleCurrentAccountEntry(saleId, true);
        }
      } else {
        if (editingSale) {
          setLocalSales(prev => prev.map(sale => 
            sale.id === editingSale.id 
              ? { ...saleData, id: editingSale.id, createdAt: editingSale.createdAt }
              : sale
          ));
          await syncSaleCurrentAccountEntry(editingSale.id, false);
        } else {
          const newSale: Sale = {
            ...saleData,
            id: Date.now().toString(),
            createdAt: new Date().toISOString()
          };
          setLocalSales(prev => [...prev, newSale]);
          await syncSaleCurrentAccountEntry(newSale.id, false);
        }
      }
      setShowSaleForm(false);
      setEditingSale(null);
    } catch (error) {
      console.error('Error saving sale:', error);
      alert('Error al guardar la venta');
    }
  };

  const handleSaleDelete = async (saleId: string) => {
    // Don't allow deletion of booking-derived sales
    if (saleId.startsWith('booking-')) {
      alert('No se pueden eliminar ventas derivadas de turnos finalizados');
      return;
    }
    
    if (!confirm('¿Estás seguro de que quieres eliminar esta venta?')) return;
    
    // Find the sale to check if it has related current account entries
    const sale = currentSales.find(s => s.id === saleId);
    if (sale && sale.paymentMethod === 'current_account') {
      // Find and delete related current account entry
      const relatedEntry = currentCurrentAccountEntries.find(entry => 
        entry.relatedSaleId === saleId
      );
      
      if (relatedEntry) {
        console.log('🗑️ Deleting related current account entry:', relatedEntry.id);
        if (isSupabaseDataReady) {
          await currentAccountService.delete(relatedEntry.id);
          setDbCurrentAccountEntries(prev => prev.filter(entry => entry.id !== relatedEntry.id));
        } else {
          setLocalCurrentAccountEntries(prev => prev.filter(entry => entry.id !== relatedEntry.id));
        }
      }
    }

    try {
      if (isSupabaseDataReady) {
        await salesService.delete(saleId);
        setDbSales(prev => prev.filter(sale => sale.id !== saleId));
      } else {
        setLocalSales(prev => prev.filter(sale => sale.id !== saleId));
      }
    } catch (error) {
      console.error('Error deleting sale:', error);
      alert('Error al eliminar la venta');
    }
  };

  // Current account management
  const handlePaymentSave = async (paymentData: Omit<CurrentAccountEntry, 'id' | 'createdAt'>) => {
    try {
      if (isSupabaseDataReady) {
        const entryId = await currentAccountService.create(paymentData);
        const newEntry: CurrentAccountEntry = {
          ...paymentData,
          id: entryId,
          createdAt: new Date().toISOString()
        };
        setDbCurrentAccountEntries(prev => [...prev, newEntry]);
      } else {
        const newEntry: CurrentAccountEntry = {
          ...paymentData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString()
        };
        setLocalCurrentAccountEntries(prev => [...prev, newEntry]);
      }
      setShowPaymentForm(false);
      setPaymentPlayer(null);
    } catch (error) {
      console.error('Error saving payment:', error);
      alert('Error al registrar el pago');
    }
  };

  const handleCurrentAccountEntryDelete = async (entryId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este movimiento?')) return;
    
    // Find the entry to check if it has related sales
    const entryToDelete = currentCurrentAccountEntries.find(e => e.id === entryId);
    if (entryToDelete && entryToDelete.relatedSaleId) {
      // Find and delete related sale
      const relatedSale = currentSales.find(sale => sale.id === entryToDelete.relatedSaleId);
      
      if (relatedSale) {
        console.log('🗑️ Deleting related sale:', relatedSale.id);
        if (isSupabaseDataReady) {
          await salesService.delete(relatedSale.id);
          setDbSales(prev => prev.filter(sale => sale.id !== relatedSale.id));
        } else {
          setLocalSales(prev => prev.filter(sale => sale.id !== relatedSale.id));
        }
      }
    }

    try {
      if (isSupabaseDataReady) {
        await currentAccountService.delete(entryId);
        setDbCurrentAccountEntries(prev => prev.filter(entry => entry.id !== entryId));
      } else {
        setLocalCurrentAccountEntries(prev => prev.filter(entry => entry.id !== entryId));
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Error al eliminar el movimiento');
    }
  };

  // Navigation handlers
  const handleNewBooking = (prefilledData?: any) => {
    if (prefilledData) {
      setPrefilledBookingData(prefilledData);
    }
    setShowBookingForm(true);
  };

  const handleBookingClick = (booking: Booking) => {
    if (booking.status === 'confirmed') {
      handleBookingEdit(booking);
    }
  };

  // Get current user's player profile
  const currentPlayerProfile = user?.playerId
    ? currentPlayers.find(p => p.id === user.playerId)
    : undefined;

  // Filter data based on user role
  const getFilteredBookings = () => {
    if (isAdmin()) {
      return currentBookings;
    } else if (isPlayer() && currentPlayerProfile) {
      return currentBookings.filter(booking => 
        booking.players.some(p => p.id === currentPlayerProfile.id)
      );
    }
    return [];
  };

  const getFilteredSales = () => {
    if (isAdmin()) {
      return currentSales;
    } else if (isPlayer() && currentPlayerProfile) {
      return currentSales.filter(sale => sale.customer.id === currentPlayerProfile.id);
    }
    return [];
  };

  const getFilteredCurrentAccountEntries = () => {
    if (isAdmin()) {
      return currentCurrentAccountEntries;
    } else if (isPlayer() && currentPlayerProfile) {
      return currentCurrentAccountEntries.filter(entry => entry.playerId === currentPlayerProfile.id);
    }
    return [];
  };

  const filteredBookings = getFilteredBookings();
  const filteredSales = getFilteredSales();
  const filteredCurrentAccountEntries = getFilteredCurrentAccountEntries();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userRole={user?.role}
        userName={currentPlayerProfile?.name || user?.username}
        onSignOut={signOut}
        onChangePassword={() => setShowChangePassword(true)}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        <div className="p-6 pt-20 lg:pt-6">
          {/* Dashboard */}
          {activeTab === 'dashboard' && (
            <>
              {isAdmin() ? (
                <Dashboard
                  bookings={filteredBookings}
                  courts={currentCourts}
                  players={currentPlayers}
                  sales={filteredSales}
                />
              ) : (
                currentPlayerProfile && (
                  <PlayerDashboard
                    player={currentPlayerProfile}
                    bookings={filteredBookings}
                    sales={filteredSales}
                    currentAccountEntries={filteredCurrentAccountEntries}
                  />
                )
              )}
            </>
          )}

          {/* Booking Calendar */}
          {activeTab === 'reservas' && (
            <BookingCalendar
              courts={currentCourts}
              bookings={currentBookings}
              recurringBookings={currentRecurringBookings}
              courtUnavailabilities={currentCourtUnavailabilities}
              currentPlayerProfile={currentPlayerProfile}
              isPlayerRole={isPlayer()}
              onNewBooking={handleNewBooking}
              onBookingClick={handleBookingClick}
              onBookingEdit={handleBookingEdit}
              onBookingClose={handleBookingClose}
            />
          )}

          {/* Recurring Bookings (Admin only) */}
          {activeTab === 'turnos-fijos' && isAdmin() && (
            <RecurringBookingList
              recurringBookings={currentRecurringBookings}
              players={currentPlayers}
              courts={currentCourts}
              onAddRecurring={() => setShowRecurringForm(true)}
              onEditRecurring={(recurring) => {
                setEditingRecurring(recurring);
                setShowRecurringForm(true);
              }}
              onDeleteRecurring={handleRecurringDelete}
              onToggleActive={handleRecurringToggle}
              onManageSkipDates={(recurring) => {
                setManagingSkipDates(recurring);
                setShowSkipDatesManager(true);
              }}
            />
          )}

          {/* Court Unavailability (Admin only) */}
          {activeTab === 'disponibilidad' && isAdmin() && (
            <CourtUnavailabilityManager
              courts={currentCourts}
              unavailabilities={currentCourtUnavailabilities}
              onSave={handleCourtUnavailabilitySave}
              onDelete={handleCourtUnavailabilityDelete}
            />
          )}

          {/* Tournaments */}
          {activeTab === 'torneos' && (
            <TournamentManager
              tournaments={currentTournaments}
              players={currentPlayers}
              isAdmin={isAdmin()}
              onSave={handleTournamentSave}
              onDelete={handleTournamentDelete}
            />
          )}

          {/* Booking List */}
          {activeTab === 'mis-reservas' && (
            <BookingList
              bookings={filteredBookings}
              user={user}
              onBookingCancel={handleBookingCancel}
              onBookingClose={handleBookingClose}
              onBookingEdit={handleBookingEdit}
            />
          )}

          {/* Courts (Admin only) */}
          {activeTab === 'canchas' && isAdmin() && (
            <CourtList
              courts={currentCourts}
              onEditCourt={(court) => {
                setEditingCourt(court);
                setShowCourtForm(true);
              }}
              onDeleteCourt={handleCourtDelete}
              onAddCourt={() => setShowCourtForm(true)}
            />
          )}

          {/* Consumables (Admin only) */}
          {activeTab === 'consumibles' && isAdmin() && (
            <ConsumableList
              consumables={currentConsumables}
              categories={currentCategories}
              sales={currentSales}
              bookings={currentBookings}
              onEditConsumable={(consumable) => {
                setEditingConsumable(consumable);
                setShowConsumableForm(true);
              }}
              onDeleteConsumable={handleConsumableDelete}
              onAddConsumable={() => setShowConsumableForm(true)}
            />
          )}

          {/* Players (Admin only) */}
          {activeTab === 'jugadores' && isAdmin() && (
            <PlayerList
              players={currentPlayers}
              onEditPlayer={(player) => {
                setEditingPlayer(player);
                setShowPlayerForm(true);
              }}
              onDeletePlayer={handlePlayerDelete}
              onAddPlayer={() => setShowPlayerForm(true)}
            />
          )}

          {/* Sales */}
          {activeTab === 'ventas' && (
            <SalesList
              sales={filteredSales}
              bookings={filteredBookings}
              onAddSale={() => isAdmin() && setShowSaleForm(true)}
              onViewSale={(sale) => {
                setViewingSale(sale);
                setShowSaleDetail(true);
              }}
              onEditSale={(sale) => {
                if (isAdmin() && !sale.id.startsWith('booking-')) {
                  setEditingSale(sale);
                  setShowSaleForm(true);
                }
              }}
              onDeleteSale={isAdmin() ? handleSaleDelete : () => {}}
            />
          )}

          {/* Current Account */}
          {activeTab === 'cuenta-corriente' && (
            <>
              {isAdmin() ? (
                <CurrentAccountList
                  players={currentPlayers}
                  currentAccountEntries={filteredCurrentAccountEntries}
                  onAddPayment={(playerId) => {
                    setPaymentPlayer(playerId);
                    setShowPaymentForm(true);
                  }}
                  onViewAccount={(playerId) => {
                    setViewingAccount(playerId);
                    setShowCurrentAccountDetail(true);
                  }}
                  onDeleteEntry={handleCurrentAccountEntryDelete}
                />
              ) : (
                currentPlayerProfile && (
                  <CurrentAccountDetail
                    account={getPlayerCurrentAccount(
                      currentPlayerProfile.id,
                      currentPlayerProfile.name,
                      filteredCurrentAccountEntries
                    )}
                    onDeleteEntry={() => {}} // Players can't delete entries
                    onClose={() => {}}
                    isModal={false}
                  />
                )
              )}
            </>
          )}

          {/* User Management (Admin only) */}
          {activeTab === 'usuarios' && isAdmin() && (
            <UserManagement
              users={users}
              players={currentPlayers}
              currentUser={user!}
              onCreateUser={handleCreateUser}
              onUpdateUserRole={handleUpdateUserRole}
              onToggleUserStatus={handleToggleUserStatus}
              onDeleteUser={handleDeleteUser}
              onResetPassword={handleResetPassword}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showBookingForm && (
        <BookingForm
          courts={currentCourts}
          consumables={currentConsumables}
          players={currentPlayers}
          bookings={currentBookings}
          recurringBookings={currentRecurringBookings}
          courtUnavailabilities={currentCourtUnavailabilities}
          prefilledData={prefilledBookingData}
          currentPlayerProfile={currentPlayerProfile}
          isPlayerRole={isPlayer()}
          onBookingCreate={handleBookingCreate}
          onPlayerSave={handlePlayerSave}
          onCancel={() => {
            setShowBookingForm(false);
            setPrefilledBookingData(null);
          }}
        />
      )}

      {showCourtForm && (
        <CourtEditForm
          court={editingCourt}
          onSave={handleCourtSave}
          onCancel={() => {
            setShowCourtForm(false);
            setEditingCourt(null);
          }}
        />
      )}

      {showConsumableForm && (
        <ConsumableEditForm
          consumable={editingConsumable}
          categories={currentCategories}
          onSave={handleConsumableSave}
          onCategoriesUpdate={handleCategoriesUpdate}
          onCancel={() => {
            setShowConsumableForm(false);
            setEditingConsumable(null);
          }}
        />
      )}

      {showPlayerForm && (
        <PlayerEditForm
          player={editingPlayer}
          onSave={handlePlayerSave}
          onCancel={() => {
            setShowPlayerForm(false);
            setEditingPlayer(null);
          }}
        />
      )}

      {showSaleForm && (
        <SaleForm
          consumables={currentConsumables}
          categories={currentCategories}
          players={currentPlayers}
          sale={editingSale}
          onSave={handleSaleSave}
          onCancel={() => {
            setShowSaleForm(false);
            setEditingSale(null);
          }}
        />
      )}

      {showSaleDetail && viewingSale && (
        <SaleDetailModal
          sale={viewingSale}
          onClose={() => {
            setShowSaleDetail(false);
            setViewingSale(null);
          }}
        />
      )}

      {showCurrentAccountDetail && viewingAccount && (
        <CurrentAccountDetail
          account={getPlayerCurrentAccount(
            viewingAccount,
            currentPlayers.find(p => p.id === viewingAccount)?.name || '',
            filteredCurrentAccountEntries
          )}
          onDeleteEntry={handleCurrentAccountEntryDelete}
          onClose={() => {
            setShowCurrentAccountDetail(false);
            setViewingAccount(null);
          }}
          isModal={true}
        />
      )}

      {showPaymentForm && paymentPlayer && (
        <PaymentForm
          player={currentPlayers.find(p => p.id === paymentPlayer)!}
          currentBalance={getPlayerCurrentAccount(
            paymentPlayer,
            currentPlayers.find(p => p.id === paymentPlayer)?.name || '',
            filteredCurrentAccountEntries
          ).balance}
          onSave={handlePaymentSave}
          onCancel={() => {
            setShowPaymentForm(false);
            setPaymentPlayer(null);
          }}
        />
      )}

      {showRecurringForm && (
        <RecurringBookingForm
          courts={currentCourts}
          players={currentPlayers}
          recurringBooking={editingRecurring}
          onSave={handleRecurringSave}
          onCancel={() => {
            setShowRecurringForm(false);
            setEditingRecurring(null);
          }}
        />
      )}

      {showSkipDatesManager && managingSkipDates && (
        <SkipDatesManager
          recurringBooking={managingSkipDates}
          onSave={(skipDates) => handleSkipDatesUpdate(managingSkipDates.id, skipDates)}
          onCancel={() => {
            setShowSkipDatesManager(false);
            setManagingSkipDates(null);
          }}
        />
      )}

      {showBookingEdit && editingBooking && (
        <BookingEditForm
          booking={editingBooking}
          courts={currentCourts}
          consumables={currentConsumables}
          categories={currentCategories}
          players={currentPlayers}
          onSave={handleBookingUpdate}
          onPlayerSave={handlePlayerSave}
          onCancel={() => {
            setShowBookingEdit(false);
            setEditingBooking(null);
          }}
        />
      )}

      {showTurnClose && closingBooking && (
        <TurnCloseForm
          booking={closingBooking}
          courts={currentCourts}
          consumables={currentConsumables}
          categories={currentCategories}
          players={currentPlayers}
          onSave={handleTurnClose}
          onPlayerSave={handlePlayerSave}
          onCancel={() => {
            setShowTurnClose(false);
            setClosingBooking(null);
          }}
        />
      )}

      {showChangePassword && (
        <ChangePasswordForm
          onSave={handleChangePassword}
          onCancel={() => setShowChangePassword(false)}
        />
      )}
    </div>
  );
}

export default App;

