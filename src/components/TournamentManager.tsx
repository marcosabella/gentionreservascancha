import React, { useMemo, useState } from 'react';
import { Check, Plus, Save, Search, Trash2, Trophy, User, Users, X } from 'lucide-react';
import {
  PlayerProfile,
  Tournament,
  TournamentMatch,
  TournamentPair,
  TournamentPlayoffRound,
  TournamentSetScore,
  TournamentZone
} from '../types';
import { formatDate } from '../utils/timeSlots';

interface TournamentManagerProps {
  tournaments: Tournament[];
  players: PlayerProfile[];
  isAdmin: boolean;
  onSave: (tournament: Omit<Tournament, 'id' | 'createdAt'> & { id?: string }) => void;
  onDelete: (tournamentId: string) => void;
}

const emptySet = (): TournamentSetScore => ({ pair1Games: 0, pair2Games: 0 });

const createEmptyTournament = (): Omit<Tournament, 'id' | 'createdAt'> => ({
  name: 'Nuevo torneo',
  isActive: false,
  pairs: [],
  zones: [],
  playoffRounds: [],
  matches: []
});

const getWinnerPairId = (match: TournamentMatch) => {
  if (!match.pair1Id || !match.pair2Id) return undefined;

  const pair1Sets = match.sets.filter(set => set.pair1Games > set.pair2Games).length;
  const pair2Sets = match.sets.filter(set => set.pair2Games > set.pair1Games).length;

  if (pair1Sets >= 2) return match.pair1Id;
  if (pair2Sets >= 2) return match.pair2Id;
  return undefined;
};

type PairSearchTarget = 'player1' | 'player2' | 'complete';

const TournamentManager: React.FC<TournamentManagerProps> = ({
  tournaments,
  players,
  isAdmin,
  onSave,
  onDelete
}) => {
  const activeTournament = tournaments.find(tournament => tournament.isActive);
  const [selectedId, setSelectedId] = useState(activeTournament?.id || tournaments[0]?.id || 'new');
  const selectedTournament = tournaments.find(tournament => tournament.id === selectedId);
  const [draft, setDraft] = useState<Omit<Tournament, 'id' | 'createdAt'> & { id?: string }>(
    selectedTournament || createEmptyTournament()
  );
  const [pairPlayer1, setPairPlayer1] = useState('');
  const [pairPlayer2, setPairPlayer2] = useState('');
  const [pairSearchTarget, setPairSearchTarget] = useState<PairSearchTarget | null>(null);
  const [pairSearchTerm, setPairSearchTerm] = useState('');
  const [pairSearchSubmittedTerm, setPairSearchSubmittedTerm] = useState('');
  const [completingPairId, setCompletingPairId] = useState<string | null>(null);
  const [zoneCount, setZoneCount] = useState(Math.max(draft.zones.length, 1));
  const [roundName, setRoundName] = useState('8vos de final');
  const [roundMatchCount, setRoundMatchCount] = useState(8);
  const [activeView, setActiveView] = useState<'pairs' | 'zones' | 'schedule' | 'playoff'>('pairs');
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const readOnlyTournament = isAdmin ? draft : activeTournament;
  const pairNameById = useMemo(() => {
    const map = new Map<string, string>();
    readOnlyTournament?.pairs.forEach(pair => {
      map.set(pair.id, `${pair.player1Name} / ${pair.player2Name || 'Pendiente'}`);
    });
    return map;
  }, [readOnlyTournament]);

  const getPairDisplayName = (pair: TournamentPair) => `${pair.player1Name} / ${pair.player2Name || 'Pendiente'}`;

  const getSelectedPlayerName = (playerId: string) => {
    return players.find(player => player.id === playerId)?.name || 'Sin seleccionar';
  };

  const selectTournament = (id: string) => {
    setSelectedId(id);
    const tournament = tournaments.find(item => item.id === id);
    setDraft(tournament || createEmptyTournament());
    setZoneCount(Math.max(tournament?.zones.length || 1, 1));
  };

  const updateDraft = (changes: Partial<typeof draft>) => {
    setDraft(current => ({ ...current, ...changes }));
  };

  const isPlayerAlreadyInTournament = (playerId: string, ignoredPairId?: string) => {
    return draft.pairs.some(pair =>
      pair.id !== ignoredPairId &&
      (pair.player1Id === playerId || pair.player2Id === playerId)
    );
  };

  const addPair = () => {
    const player1 = players.find(player => player.id === pairPlayer1);
    const player2 = pairPlayer2 ? players.find(player => player.id === pairPlayer2) : undefined;

    if (!player1) {
      alert('Selecciona al menos el jugador principal.');
      return;
    }

    if (player2 && player1.id === player2.id) {
      alert('Selecciona dos jugadores distintos.');
      return;
    }

    const alreadyAdded = isPlayerAlreadyInTournament(player1.id) || (player2 ? isPlayerAlreadyInTournament(player2.id) : false);

    if (alreadyAdded) {
      alert('Uno de los jugadores ya integra una pareja del torneo.');
      return;
    }

    const pair: TournamentPair = {
      id: crypto.randomUUID(),
      player1Id: player1.id,
      player1Name: player1.name,
      player2Id: player2?.id,
      player2Name: player2?.name
    };

    updateDraft({ pairs: [...draft.pairs, pair] });
    setPairPlayer1('');
    setPairPlayer2('');
  };

  const openPairSearch = (target: PairSearchTarget, pairId?: string) => {
    setPairSearchTarget(target);
    setCompletingPairId(pairId || null);
    setPairSearchTerm('');
    setPairSearchSubmittedTerm('');
  };

  const closePairSearch = () => {
    setPairSearchTarget(null);
    setCompletingPairId(null);
    setPairSearchTerm('');
    setPairSearchSubmittedTerm('');
  };

  const selectPairSearchPlayer = (player: PlayerProfile) => {
    if (pairSearchTarget === 'complete' && completingPairId) {
      const pair = draft.pairs.find(item => item.id === completingPairId);

      if (!pair) return;

      if (pair.player1Id === player.id) {
        alert('Selecciona un jugador distinto al principal.');
        return;
      }

      if (isPlayerAlreadyInTournament(player.id, completingPairId)) {
        alert('Este jugador ya integra una pareja del torneo.');
        return;
      }

      updateDraft({
        pairs: draft.pairs.map(item =>
          item.id === completingPairId
            ? { ...item, player2Id: player.id, player2Name: player.name }
            : item
        )
      });
      closePairSearch();
      return;
    }

    if (pairSearchTarget === 'player1') {
      if (player.id === pairPlayer2) {
        alert('Selecciona un jugador distinto al compañero.');
        return;
      }
      setPairPlayer1(player.id);
    }

    if (pairSearchTarget === 'player2') {
      if (player.id === pairPlayer1) {
        alert('Selecciona un jugador distinto al principal.');
        return;
      }
      setPairPlayer2(player.id);
    }

    closePairSearch();
  };

  const getPairSearchResults = () => {
    const nameFilter = pairSearchSubmittedTerm.trim().toLowerCase();
    if (!nameFilter) return [];

    return players.filter(player => {
      const matchesName = player.name.toLowerCase().includes(nameFilter);
      if (!matchesName) return false;

      if (pairSearchTarget === 'player1') {
        return player.id !== pairPlayer2 && !isPlayerAlreadyInTournament(player.id);
      }

      if (pairSearchTarget === 'player2') {
        return player.id !== pairPlayer1 && !isPlayerAlreadyInTournament(player.id);
      }

      return player.id !== draft.pairs.find(pair => pair.id === completingPairId)?.player1Id &&
        !isPlayerAlreadyInTournament(player.id, completingPairId || undefined);
    });
  };

  const removePair = (pairId: string) => {
    updateDraft({
      pairs: draft.pairs.filter(pair => pair.id !== pairId),
      zones: draft.zones.map(zone => ({ ...zone, pairIds: zone.pairIds.filter(id => id !== pairId) })),
      matches: draft.matches.map(match => ({
        ...match,
        pair1Id: match.pair1Id === pairId ? undefined : match.pair1Id,
        pair2Id: match.pair2Id === pairId ? undefined : match.pair2Id,
        winnerPairId: match.winnerPairId === pairId ? undefined : match.winnerPairId
      }))
    });
  };

  const configureZones = () => {
    const nextZones: TournamentZone[] = Array.from({ length: zoneCount }, (_, index) => {
      const existing = draft.zones[index];
      return existing || { id: crypto.randomUUID(), name: `Zona ${index + 1}`, pairIds: [] };
    });

    updateDraft({ zones: nextZones });
    if (selectedZoneId && !nextZones.some(zone => zone.id === selectedZoneId)) {
      setSelectedZoneId(null);
    }
  };

  const assignPairToZone = (pairId: string, zoneId: string) => {
    updateDraft({
      zones: draft.zones.map(zone => ({
        ...zone,
        pairIds: zone.id === zoneId
          ? Array.from(new Set([...zone.pairIds, pairId]))
          : zone.pairIds.filter(id => id !== pairId)
      }))
    });
  };

  const removePairFromZone = (pairId: string, zoneId: string) => {
    updateDraft({
      zones: draft.zones.map(zone =>
        zone.id === zoneId
          ? { ...zone, pairIds: zone.pairIds.filter(id => id !== pairId) }
          : zone
      ),
      matches: draft.matches.map(match => {
        if (match.stage !== 'zone' || match.zoneId !== zoneId) return match;

        const updated = {
          ...match,
          pair1Id: match.pair1Id === pairId ? undefined : match.pair1Id,
          pair2Id: match.pair2Id === pairId ? undefined : match.pair2Id,
          winnerPairId: match.winnerPairId === pairId ? undefined : match.winnerPairId
        };

        return { ...updated, winnerPairId: getWinnerPairId(updated) };
      })
    });
  };

  const addRound = () => {
    const round: TournamentPlayoffRound = {
      id: crypto.randomUUID(),
      name: roundName.trim() || 'Play off',
      matchCount: Math.max(roundMatchCount, 1),
      order: draft.playoffRounds.length + 1
    };

    const roundMatches: TournamentMatch[] = Array.from({ length: round.matchCount }, () => ({
      id: crypto.randomUUID(),
      stage: 'playoff',
      roundId: round.id,
      sets: [emptySet(), emptySet(), emptySet()]
    }));

    updateDraft({
      playoffRounds: [...draft.playoffRounds, round],
      matches: [...draft.matches, ...roundMatches]
    });
  };

  const removeRound = (roundId: string) => {
    const round = draft.playoffRounds.find(item => item.id === roundId);
    const roundMatches = draft.matches.filter(match => match.stage === 'playoff' && match.roundId === roundId);

    if (!round) return;

    if (!confirm(`Seguro que quieres eliminar la ronda "${round.name}"?\n\nTambien se eliminaran sus ${roundMatches.length} partidos, horarios y resultados.`)) {
      return;
    }

    const playoffRounds = draft.playoffRounds
      .filter(item => item.id !== roundId)
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({ ...item, order: index + 1 }));

    updateDraft({
      playoffRounds,
      matches: draft.matches.filter(match => !(match.stage === 'playoff' && match.roundId === roundId))
    });
  };

  const addZoneMatch = (zoneId: string) => {
    updateDraft({
      matches: [
        ...draft.matches,
        {
          id: crypto.randomUUID(),
          stage: 'zone',
          zoneId,
          sets: [emptySet(), emptySet(), emptySet()]
        }
      ]
    });
  };

  const addScheduledZoneMatch = (zoneId: string) => {
    addZoneMatch(zoneId);
    setActiveView('schedule');
  };

  const updateMatch = (matchId: string, changes: Partial<TournamentMatch>) => {
    updateDraft({
      matches: draft.matches.map(match => {
        if (match.id !== matchId) return match;
        const updated = { ...match, ...changes };
        return { ...updated, winnerPairId: getWinnerPairId(updated) };
      })
    });
  };

  const updateSet = (match: TournamentMatch, setIndex: number, field: keyof TournamentSetScore, value: number) => {
    const sets = match.sets.map((set, index) =>
      index === setIndex ? { ...set, [field]: Math.max(value, 0) } : set
    );
    updateMatch(match.id, { sets });
  };

  const renderMatch = (match: TournamentMatch, allowedPairIds: string[]) => (
    <div key={match.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pareja</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Set 1</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Set 2</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Set 3</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-3 py-2">
                <select
                  value={match.pair1Id || ''}
                  onChange={(event) => updateMatch(match.id, { pair1Id: event.target.value || undefined })}
                  disabled={!isAdmin}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Pareja 1</option>
                  {allowedPairIds.map(pairId => (
                    <option key={pairId} value={pairId}>{pairNameById.get(pairId)}</option>
                  ))}
                </select>
              </td>
              {match.sets.map((set, index) => (
                <td key={index} className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    value={set.pair1Games}
                    onChange={(event) => updateSet(match, index, 'pair1Games', Number(event.target.value))}
                    disabled={!isAdmin}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-center"
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-3 py-2">
                <select
                  value={match.pair2Id || ''}
                  onChange={(event) => updateMatch(match.id, { pair2Id: event.target.value || undefined })}
                  disabled={!isAdmin}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Pareja 2</option>
                  {allowedPairIds.map(pairId => (
                    <option key={pairId} value={pairId}>{pairNameById.get(pairId)}</option>
                  ))}
                </select>
              </td>
              {match.sets.map((set, index) => (
                <td key={index} className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    value={set.pair2Games}
                    onChange={(event) => updateSet(match, index, 'pair2Games', Number(event.target.value))}
                    disabled={!isAdmin}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-center"
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">
          {match.scheduledDate && match.scheduledTime
            ? `${match.scheduledDate} ${match.scheduledTime}`
            : 'Sin horario'} · Ganador: {match.winnerPairId ? pairNameById.get(match.winnerPairId) : 'Sin definir'}
        </span>
        {isAdmin && (
          <button
            onClick={() => updateDraft({ matches: draft.matches.filter(item => item.id !== match.id) })}
            className="text-red-600 hover:text-red-700"
          >
            Eliminar partido
          </button>
        )}
      </div>
    </div>
  );

  const renderScoreCard = (match: TournamentMatch, allowedPairIds: string[]) => (
    <div key={match.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select
          value={match.pair1Id || ''}
          onChange={(event) => updateMatch(match.id, { pair1Id: event.target.value || undefined })}
          disabled={!isAdmin}
          className="border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">Pareja 1</option>
          {allowedPairIds.map(pairId => (
            <option key={pairId} value={pairId}>{pairNameById.get(pairId)}</option>
          ))}
        </select>
        <select
          value={match.pair2Id || ''}
          onChange={(event) => updateMatch(match.id, { pair2Id: event.target.value || undefined })}
          disabled={!isAdmin}
          className="border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">Pareja 2</option>
          {allowedPairIds.map(pairId => (
            <option key={pairId} value={pairId}>{pairNameById.get(pairId)}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {match.sets.map((set, index) => (
          <div key={index} className="bg-gray-50 rounded-lg p-2">
            <p className="text-xs font-medium text-gray-500 mb-2">Set {index + 1}</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={set.pair1Games}
                onChange={(event) => updateSet(match, index, 'pair1Games', Number(event.target.value))}
                disabled={!isAdmin}
                className="w-full border border-gray-300 rounded px-2 py-1 text-center"
              />
              <span className="text-gray-400">-</span>
              <input
                type="number"
                min="0"
                value={set.pair2Games}
                onChange={(event) => updateSet(match, index, 'pair2Games', Number(event.target.value))}
                disabled={!isAdmin}
                className="w-full border border-gray-300 rounded px-2 py-1 text-center"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">
          {match.scheduledDate && match.scheduledTime
            ? `${match.scheduledDate} ${match.scheduledTime}`
            : 'Sin horario'} · Ganador: {match.winnerPairId ? pairNameById.get(match.winnerPairId) : 'Sin definir'}
        </span>
        {isAdmin && (
          <button
            onClick={() => updateDraft({ matches: draft.matches.filter(item => item.id !== match.id) })}
            className="text-red-600 hover:text-red-700"
          >
            Eliminar partido
          </button>
        )}
      </div>
    </div>
  );

  const renderZoneCard = (zone: TournamentZone) => {
    const zoneMatches = tournament.matches.filter(match => match.stage === 'zone' && match.zoneId === zone.id);
    const completedMatches = zoneMatches.filter(match => match.winnerPairId).length;

    return (
      <button
        key={zone.id}
        onClick={() => setSelectedZoneId(zone.id)}
        className="p-4 rounded-lg border-2 border-green-200 bg-green-50 hover:bg-green-100 text-left transition-all"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <h4 className="font-bold text-lg text-gray-900">{zone.name}</h4>
          <span className="text-xs text-green-700 bg-green-100 border border-green-200 rounded-full px-2 py-1">
            {zone.pairIds.length} parejas
          </span>
        </div>

        <div className="space-y-2 mb-4">
          {zone.pairIds.length === 0 ? (
            <p className="text-sm text-gray-500">Sin parejas asignadas</p>
          ) : (
            zone.pairIds.map(pairId => (
              <div key={pairId} className="text-sm text-gray-700 bg-white border border-green-100 rounded px-3 py-2">
                {pairNameById.get(pairId)}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">{zoneMatches.length} partidos</span>
          <span className="text-green-700 font-medium">{completedMatches} con resultado</span>
        </div>
      </button>
    );
  };

  const renderScheduleMatch = (match: TournamentMatch, allowedPairIds: string[]) => (
    <div key={match.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_150px_130px] gap-3">
        <select
          value={match.pair1Id || ''}
          onChange={(event) => updateMatch(match.id, { pair1Id: event.target.value || undefined })}
          disabled={!isAdmin}
          className="border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">Pareja 1</option>
          {allowedPairIds.map(pairId => (
            <option key={pairId} value={pairId}>{pairNameById.get(pairId)}</option>
          ))}
        </select>
        <select
          value={match.pair2Id || ''}
          onChange={(event) => updateMatch(match.id, { pair2Id: event.target.value || undefined })}
          disabled={!isAdmin}
          className="border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">Pareja 2</option>
          {allowedPairIds.map(pairId => (
            <option key={pairId} value={pairId}>{pairNameById.get(pairId)}</option>
          ))}
        </select>
        <input
          type="date"
          value={match.scheduledDate || ''}
          onChange={(event) => updateMatch(match.id, { scheduledDate: event.target.value })}
          disabled={!isAdmin}
          className="border border-gray-300 rounded-lg px-3 py-2"
        />
        <input
          type="time"
          value={match.scheduledTime || ''}
          onChange={(event) => updateMatch(match.id, { scheduledTime: event.target.value })}
          disabled={!isAdmin}
          className="border border-gray-300 rounded-lg px-3 py-2"
        />
      </div>
      <div className="text-sm text-gray-600">
        Resultado: {match.sets.map(set => `${set.pair1Games}-${set.pair2Games}`).join(' / ')}
      </div>
    </div>
  );

  if (!isAdmin && !activeTournament) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900">No hay torneo activo</h2>
        <p className="text-gray-600 mt-2">Cuando haya un torneo activo vas a poder verlo aca.</p>
      </div>
    );
  }

  const tournament = readOnlyTournament;
  if (!tournament) return null;

  const unassignedZonePairs = tournament.pairs.filter(pair =>
    !tournament.zones.some(zone => zone.pairIds.includes(pair.id))
  );
  const getMatchZoneName = (match: TournamentMatch) => {
    if (match.stage === 'zone') {
      return tournament.zones.find(zone => zone.id === match.zoneId)?.name || 'Zona';
    }

    const roundName = tournament.playoffRounds.find(round => round.id === match.roundId)?.name;
    return roundName ? `Play off - ${roundName}` : 'Play off';
  };
  const getMatchPairsName = (match: TournamentMatch) => {
    const pair1Name = match.pair1Id ? pairNameById.get(match.pair1Id) : 'Pareja 1 pendiente';
    const pair2Name = match.pair2Id ? pairNameById.get(match.pair2Id) : 'Pareja 2 pendiente';
    return `${pair1Name || 'Pareja 1 pendiente'} vs ${pair2Name || 'Pareja 2 pendiente'}`;
  };
  const scheduledMatches = tournament.matches
    .slice()
    .sort((a, b) => {
      const dateA = a.scheduledDate || '9999-12-31';
      const dateB = b.scheduledDate || '9999-12-31';
      const dateComparison = dateA.localeCompare(dateB);

      if (dateComparison !== 0) return dateComparison;

      const timeA = a.scheduledTime || '99:99';
      const timeB = b.scheduledTime || '99:99';
      return timeA.localeCompare(timeB);
    });

  const tabs = [
    { id: 'pairs' as const, label: 'Parejas', count: tournament.pairs.length },
    { id: 'zones' as const, label: 'Zonas y resultados', count: tournament.zones.length },
    { id: 'schedule' as const, label: 'Horarios', count: tournament.matches.filter(match => match.scheduledDate || match.scheduledTime).length },
    { id: 'playoff' as const, label: 'Play off', count: tournament.playoffRounds.length }
  ];
  const pairSearchResults = getPairSearchResults();

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Torneos</h2>
          <p className="text-gray-600">
            {isAdmin ? 'Gestion de parejas, zonas, play off y resultados' : 'Datos del torneo activo'}
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedId}
              onChange={(event) => selectTournament(event.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="new">Nuevo torneo</option>
              {tournaments.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <button
              onClick={() => onSave(draft)}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              <Save className="w-4 h-4" />
              Guardar
            </button>
            {draft.id && (
              <button
                onClick={() => onDelete(draft.id!)}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              value={tournament.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              disabled={!isAdmin}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <label className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mt-6">
            <input
              type="checkbox"
              checked={tournament.isActive}
              onChange={(event) => updateDraft({ isActive: event.target.checked })}
              disabled={!isAdmin}
              className="w-4 h-4"
            />
            <span className="font-medium text-gray-800">Torneo activo</span>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-2">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center justify-between px-4 py-3 rounded-lg font-medium transition-colors ${
                activeView === tab.id
                  ? 'bg-green-100 text-green-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-xs rounded-full px-2 py-1 ${
                activeView === tab.id ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeView === 'pairs' && (
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Parejas</h3>
            <span className="text-sm text-gray-500">{tournament.pairs.length} parejas</span>
          </div>

          {isAdmin && (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700 flex-1 truncate">{pairPlayer1 ? getSelectedPlayerName(pairPlayer1) : 'Jugador principal'}</span>
                <button
                  type="button"
                  onClick={() => openPairSearch('player1')}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Search className="w-4 h-4" />
                  Buscar
                </button>
              </div>
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700 flex-1 truncate">{pairPlayer2 ? getSelectedPlayerName(pairPlayer2) : 'Companero pendiente'}</span>
                {pairPlayer2 && (
                  <button
                    type="button"
                    onClick={() => setPairPlayer2('')}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Quitar companero"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openPairSearch('player2')}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Search className="w-4 h-4" />
                  Buscar
                </button>
              </div>
              <button onClick={addPair} className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                <Plus className="w-4 h-4" />
                Agregar
              </button>
            </div>
          )}

          <div className="space-y-2">
            {tournament.pairs.map(pair => (
              <div key={pair.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">{getPairDisplayName(pair)}</span>
                  {!pair.player2Id && (
                    <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full px-2 py-1">
                      Cupo reservado
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    {!pair.player2Id && (
                      <button
                        onClick={() => openPairSearch('complete', pair.id)}
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <Search className="w-4 h-4" />
                        Completar
                      </button>
                    )}
                    <button onClick={() => removePair(pair.id)} className="text-red-600 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {activeView === 'zones' && (
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedZoneId ? tournament.zones.find(zone => zone.id === selectedZoneId)?.name || 'Zona' : 'Zonas y resultados'}
              </h3>
              <p className="text-sm text-gray-500">
                {selectedZoneId ? 'Resultados de la zona seleccionada' : 'Selecciona una zona para ver y cargar sus resultados'}
              </p>
            </div>
            <span className="text-sm text-gray-500">{tournament.zones.length} zonas</span>
          </div>

          {isAdmin && !selectedZoneId && (
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                min="1"
                value={zoneCount}
                onChange={(event) => setZoneCount(Number(event.target.value))}
                className="w-32 border border-gray-300 rounded-lg px-3 py-2"
              />
              <button onClick={configureZones} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                Configurar zonas
              </button>
            </div>
          )}

          {!selectedZoneId ? (
            tournament.zones.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                Todavia no hay zonas configuradas.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tournament.zones.map(zone => renderZoneCard(zone))}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedZoneId(null)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Volver a zonas
              </button>

              {tournament.zones
                .filter(zone => zone.id === selectedZoneId)
                .map(zone => (
                  <div key={zone.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <input
                      value={zone.name}
                      onChange={(event) => updateDraft({
                        zones: draft.zones.map(item => item.id === zone.id ? { ...item, name: event.target.value } : item)
                      })}
                      disabled={!isAdmin}
                      className="font-medium border border-gray-300 rounded-lg px-3 py-2 w-full"
                    />

                    {isAdmin && (
                      <select
                        value=""
                        onChange={(event) => event.target.value && assignPairToZone(event.target.value, zone.id)}
                        className="border border-gray-300 rounded-lg px-3 py-2 w-full"
                      >
                        <option value="">Agregar pareja a esta zona</option>
                        {unassignedZonePairs.length === 0 && (
                          <option value="" disabled>No quedan parejas sin zona</option>
                        )}
                        {unassignedZonePairs.map(pair => (
                          <option key={pair.id} value={pair.id}>{pairNameById.get(pair.id)}</option>
                        ))}
                      </select>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {zone.pairIds.map(pairId => (
                        <span key={pairId} className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1 text-sm">
                          {pairNameById.get(pairId)}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => removePairFromZone(pairId, zone.id)}
                              className="text-green-700 hover:text-red-600"
                              aria-label="Quitar pareja de la zona"
                              title="Quitar pareja de la zona"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    {isAdmin && (
                      <button onClick={() => addScheduledZoneMatch(zone.id)} className="text-sm text-blue-600 hover:text-blue-700">
                        Agregar partido de zona
                      </button>
                    )}

                    {tournament.matches.filter(match => match.stage === 'zone' && match.zoneId === zone.id).length === 0 ? (
                      <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                        No hay partidos cargados para esta zona.
                      </div>
                    ) : (
                      tournament.matches
                        .filter(match => match.stage === 'zone' && match.zoneId === zone.id)
                        .map(match => renderMatch(match, zone.pairIds))
                    )}
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {activeView === 'schedule' && (
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Horarios de partidos</h3>
            <span className="text-sm text-gray-500">{tournament.matches.length} partidos</span>
          </div>

          {!isAdmin ? (
            scheduledMatches.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                No hay partidos cargados para este torneo.
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full min-w-[720px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Zona</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Parejas</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {scheduledMatches.map(match => (
                      <tr key={match.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{getMatchZoneName(match)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{getMatchPairsName(match)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {match.scheduledDate ? formatDate(match.scheduledDate) : 'Sin fecha'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{match.scheduledTime || 'Sin hora'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="space-y-5">
            <div className="border border-gray-200 rounded-lg p-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-gray-800">Partidos de zona</h4>
                  <p className="text-sm text-gray-500">Selecciona la zona, las parejas de esa zona y el dia y horario.</p>
                </div>
              </div>

              {tournament.zones.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                  Configura las zonas antes de programar partidos de zona.
                </div>
              ) : (
                <div className="space-y-4">
                  {tournament.zones.map(zone => (
                    <div key={zone.id} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="font-medium text-gray-800">{zone.name}</h5>
                        {isAdmin && (
                          <button
                            onClick={() => addZoneMatch(zone.id)}
                            className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700"
                          >
                            Agregar partido
                          </button>
                        )}
                      </div>

                      {tournament.matches.filter(match => match.stage === 'zone' && match.zoneId === zone.id).length === 0 ? (
                        <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">No hay partidos programados en esta zona.</div>
                      ) : (
                        tournament.matches
                          .filter(match => match.stage === 'zone' && match.zoneId === zone.id)
                          .map(match => renderScheduleMatch(match, zone.pairIds))
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-gray-200 rounded-lg p-4 space-y-4">
              <div>
                <h4 className="font-semibold text-gray-800">Instancias de play off</h4>
                <p className="text-sm text-gray-500">Puedes dejar parejas vacias y cargar solo fecha y hora hasta conocer los clasificados.</p>
              </div>

              {tournament.playoffRounds.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                  Configura las instancias de play off antes de programar sus horarios.
                </div>
              ) : (
                <div className="space-y-5">
                  {tournament.playoffRounds
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map(round => (
                      <div key={round.id} className="space-y-3">
                        <h5 className="font-medium text-gray-800">{round.name}</h5>
                        <div className="space-y-3">
                          {tournament.matches
                            .filter(match => match.stage === 'playoff' && match.roundId === round.id)
                            .map(match => renderScheduleMatch(match, tournament.pairs.map(pair => pair.id)))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
          )}
        </section>
      )}

      {activeView === 'playoff' && (
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Play off</h3>
          <span className="text-sm text-gray-500">{tournament.playoffRounds.length} rondas</span>
        </div>

        {isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-2">
            <input value={roundName} onChange={(event) => setRoundName(event.target.value)} className="border border-gray-300 rounded-lg px-3 py-2" />
            <input type="number" min="1" value={roundMatchCount} onChange={(event) => setRoundMatchCount(Number(event.target.value))} className="border border-gray-300 rounded-lg px-3 py-2" />
            <button onClick={addRound} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Agregar ronda</button>
          </div>
        )}

        <div className="space-y-5">
          {tournament.playoffRounds
            .slice()
            .sort((a, b) => a.order - b.order)
            .map(round => (
              <div key={round.id} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-gray-800">{round.name} ({round.matchCount} partidos)</h4>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => removeRound(round.id)}
                      className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 font-medium"
                      title="Eliminar ronda"
                    >
                      <Trash2 className="w-4 h-4" />
                      Eliminar ronda
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {tournament.matches
                    .filter(match => match.stage === 'playoff' && match.roundId === round.id)
                    .map(match => renderScoreCard(match, tournament.pairs.map(pair => pair.id)))}
                </div>
              </div>
            ))}
        </div>
      </section>
      )}

      {pairSearchTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Buscar jugador</h3>
                  <p className="text-sm text-gray-600">Filtra por nombre y selecciona el jugador para la pareja.</p>
                </div>
                <button onClick={closePairSearch} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Nombre del jugador"
                    value={pairSearchTerm}
                    onChange={(event) => setPairSearchTerm(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        setPairSearchSubmittedTerm(pairSearchTerm);
                      }
                    }}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setPairSearchSubmittedTerm(pairSearchTerm)}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 font-medium"
                >
                  <Search className="w-4 h-4" />
                  Buscar
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {pairSearchSubmittedTerm.trim() === '' ? (
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                    Ingresa un nombre y presiona Buscar.
                  </div>
                ) : pairSearchResults.length === 0 ? (
                  <div className="text-center py-8">
                    <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-900 mb-2">No se encontraron jugadores disponibles</h4>
                    <p className="text-gray-600">Revisa el nombre o verifica si el jugador ya integra otra pareja.</p>
                  </div>
                ) : (
                  pairSearchResults.map(player => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => selectPairSearchPlayer(player)}
                      className="w-full p-4 border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-all text-left"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{player.name}</p>
                            <p className="text-sm text-gray-600 truncate">{player.email || 'Sin email'}</p>
                            <p className="text-sm text-gray-500 truncate">{player.phone || 'Sin telefono'}</p>
                          </div>
                        </div>
                        <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="flex justify-end pt-4 border-t">
                <button
                  onClick={closePairSearch}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentManager;
