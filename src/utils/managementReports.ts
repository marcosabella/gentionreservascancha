import type {
  Booking,
  Court,
  CourtUnavailability,
  RecurringBooking,
  Sale,
} from "../types";
import {
  getSaleShares,
  saleNetTotal,
  saleParticipantAmounts,
} from "./saleDistribution";
import { bookingCostBreakdown } from "./bookingComplimentary";

export interface ReportPlayer {
  id: string;
  name: string;
  createdAt: string;
  lastBooking?: string;
}
export interface ReportData {
  today: string;
  nowTime?: string;
  courts: Court[];
  players: ReportPlayer[];
  bookings: Booking[];
  sales: Sale[];
  blocks: CourtUnavailability[];
  recurring: RecurringBooking[];
}
export type ReportScope = "all" | "completed" | "future";
export const reportScopeLabels: Record<ReportScope, string> = {
  completed: "Turnos finalizados",
  future: "Reservas futuras",
  all: "Todos los estados",
};
function scheduledDate(data: ReportData, booking: Booking) {
  const court = data.courts.find((c) => c.id === booking.courtId);
  return court && booking.startTime.slice(0, 5) < court.startTime.slice(0, 5)
    ? shiftDate(booking.date, 1)
    : booking.date;
}
function matchesScope(data: ReportData, booking: Booking, scope: ReportScope) {
  if (scope === "completed") return booking.status === "completed";
  if (scope === "all") return true;
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    return false;
  }
  const date = scheduledDate(data, booking);
  return date > data.today ||
    date === data.today &&
      booking.startTime.slice(0, 5) >= (data.nowTime || "00:00");
}
export const weekdays = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
export const money = (amount: number) =>
  amount.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  });
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
const inPeriod = (date: string, from: string, to: string) =>
  date >= from && date <= to;
const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const clock = (value: number) =>
  `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${
    String(value % 60).padStart(2, "0")
  }`;
function interval(start: string, end: string, opening: number) {
  let s = minutes(start), e = minutes(end);
  if (e < s) e += 1440;
  if (s < opening) {
    s += 1440;
    e += 1440;
  }
  return [s, e];
}
function overlaps(
  start: number,
  end: number,
  a: string,
  b: string,
  opening: number,
) {
  const [s, e] = interval(a, b, opening);
  // A block can itself cross midnight and start before this court opens.
  return [0, -1440, 1440].some((offset) =>
    s + offset < end && e + offset > start
  );
}

export interface OccupancyRow {
  day: number;
  time: string;
  offered: number;
  occupied: number;
  free: number;
}
export interface FreeSlot {
  date: string;
  court: string;
  start: string;
  end: string;
}
export function occupancy(
  data: ReportData,
  from: string,
  to: string,
  courtId = "",
  scope: ReportScope = "all",
) {
  const rows = new Map<string, OccupancyRow>();
  const freeSlots: FreeSlot[] = [];
  const courts = data.courts.filter((c) => !courtId || c.id === courtId);
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const court of courts) {
      const opening = minutes(court.startTime);
      let closing = minutes(court.endTime);
      if (closing < opening) closing += 1440;
      const bookings = data.bookings.filter((b) =>
        b.date === date && b.courtId === court.id && b.status !== "cancelled" &&
        matchesScope(data, b, scope)
      );
      const blocks = data.blocks.filter((b) =>
        b.courtId === court.id && b.isActive &&
        (b.isRecurring ? b.dayOfWeek === day : b.date === date)
      );
      const recurring = scope !== "completed" && date >= data.today
        ? data.recurring.filter((b) =>
          b.courtId === court.id && b.isActive && b.dayOfWeek === day &&
          !(b.skipDates || []).includes(date)
        )
        : [];
      for (let start = opening; start + 90 <= closing; start += 90) {
        const end = start + 90;
        const slotDate = shiftDate(date, Math.floor(start / 1440));
        const endDate = shiftDate(date, Math.floor(end / 1440));
        const now = data.nowTime || "00:00";
        const finalized = scope === "completed" &&
          bookings.some((b) =>
            overlaps(start, end, b.startTime, b.endTime, opening)
          );
        if (
          scope === "completed" && !finalized &&
          (endDate > data.today || endDate === data.today && clock(end) > now)
        ) continue;
        if (
          scope === "future" &&
          (slotDate < data.today ||
            slotDate === data.today && clock(start) < now)
        ) continue;
        if (
          blocks.some((b) =>
            overlaps(start, end, b.startTime, b.endTime, opening)
          )
        ) continue;
        const booked = bookings.some((b) =>
          overlaps(start, end, b.startTime, b.endTime, opening)
        ) || recurring.some((b) =>
          overlaps(start, end, b.startTime, b.endTime, opening)
        );
        const time = clock(start), key = `${day}:${time}`;
        const row = rows.get(key) ||
          { day, time, offered: 0, occupied: 0, free: 0 };
        row.offered++;
        if (booked) {
          row.occupied++;
        } else {
          row.free++;
          freeSlots.push({
            date,
            court: court.name,
            start: time,
            end: clock(end),
          });
        }
        rows.set(key, row);
      }
    }
  }
  const all = [...rows.values()].sort((a, b) =>
    a.time.localeCompare(b.time) || a.day - b.day
  );
  const offered = all.reduce((sum, r) => sum + r.offered, 0),
    occupied = all.reduce((sum, r) => sum + r.occupied, 0);
  return {
    rows: all,
    offered,
    occupied,
    free: offered - occupied,
    percent: offered ? occupied / offered * 100 : 0,
    freeSlots,
  };
}

export function bookingNet(booking: Booking) {
  const gross = booking.finalTotal ??
    booking.totalPrice +
      booking.consumptions.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const waived = booking.players.reduce(
    (sum, p) =>
      sum +
      (p.paymentSplits || []).reduce(
        (s, part) => s + (part.method === "complimentary" ? part.amount : 0),
        0,
      ),
    0,
  );
  return Math.max(0, gross - waived);
}
const bookingCourtGross = (b: Booking) =>
  b.totalPrice > 0 ? b.totalPrice : Math.max(
    0,
    (b.finalTotal || 0) -
      b.consumptions.reduce((sum, c) => sum + c.price * c.quantity, 0),
  );
export function summarizePeriod(
  data: ReportData,
  from: string,
  to: string,
  courtId = "",
  scope: ReportScope = "all",
) {
  const bookings = data.bookings.filter((b) =>
    inPeriod(b.date, from, to) && (!courtId || b.courtId === courtId) &&
    matchesScope(data, b, scope)
  );
  const active = bookings.filter((b) => b.status !== "cancelled");
  const completed = active.filter((b) => b.status === "completed");
  const sales = courtId || scope === "future"
    ? []
    : data.sales.filter((s) =>
      s.type === "direct" && inPeriod(s.date, from, to)
    );
  const courtGross = completed.reduce(
    (sum, b) => sum + bookingCourtGross(b),
    0,
  );
  const productGross = completed.reduce(
    (sum, b) =>
      sum + b.consumptions.reduce((s, c) => s + c.price * c.quantity, 0),
    0,
  ) + sales.reduce((sum, s) =>
    sum + s.items.reduce((v, i) =>
      v + i.subtotal, 0), 0);
  const net = completed.reduce((sum, b) => sum + bookingNet(b), 0) +
    sales.reduce((sum, s) => sum + saleNetTotal(s), 0);
  return {
    bookings,
    active,
    completed,
    sales,
    courtGross,
    productGross,
    net,
    cancellations: bookings.length - active.length,
    occupancy: occupancy(data, from, to, courtId, scope),
  };
}

export function buildManagementReport(
  data: ReportData,
  from: string,
  to: string,
  courtId = "",
  scope: ReportScope = "all",
) {
  const current = summarizePeriod(data, from, to, courtId, scope);
  const previousTo = shiftDate(from, -1),
    previousFrom = shiftDate(from, -dayCount(from, to));
  const previous = summarizePeriod(
    data,
    previousFrom,
    previousTo,
    courtId,
    scope,
  );
  const players = data.players.map((player) => {
    const bookings = current.bookings.filter((b) =>
      b.players.some((p) => p.id === player.id)
    );
    const active = bookings.filter((b) => b.status !== "cancelled");
    return {
      ...player,
      reservations: active.length,
      organized: active.filter((b) =>
        b.players.some((p) =>
          p.id === player.id && p.isOrganizer
        )
      ).length,
      completed: active.filter((b) => b.status === "completed").length,
      cancelled: bookings.length - active.length,
      lastInPeriod: active.map((b) => b.date).sort().reverse()[0],
    };
  }).sort((a, b) =>
    b.reservations - a.reservations || a.name.localeCompare(b.name)
  );
  const products = new Map<
    string,
    {
      name: string;
      quantity: number;
      amount: number;
      direct: number;
      booking: number;
    }
  >();
  const productMonths = new Map<
    string,
    {
      product: string;
      name: string;
      month: string;
      quantity: number;
      amount: number;
    }
  >();
  const add = (
    id: string | undefined,
    name: string,
    quantity: number,
    amount: number,
    source: "direct" | "booking",
    date: string,
  ) => {
    const key = id || `legacy:${name.trim().toLowerCase()}`;
    const row = products.get(key) ||
      { name, quantity: 0, amount: 0, direct: 0, booking: 0 };
    row.quantity += quantity;
    row.amount += amount;
    row[source] += quantity;
    products.set(key, row);
    const month = date.slice(0, 7), monthKey = `${key}:${month}`;
    const monthly = productMonths.get(monthKey) ||
      { product: key, name, month, quantity: 0, amount: 0 };
    monthly.quantity += quantity;
    monthly.amount += amount;
    productMonths.set(monthKey, monthly);
  };
  current.completed.forEach((b) =>
    b.consumptions.forEach((c) =>
      add(
        c.consumableId,
        c.name,
        c.quantity,
        c.quantity * c.price,
        "booking",
        b.date,
      )
    )
  );
  current.sales.forEach((s) =>
    s.items.forEach((i) =>
      add(i.consumableId, i.name, i.quantity, i.subtotal, "direct", s.date)
    )
  );
  const times = new Map<string, number>();
  current.active.forEach((b) => {
    const time = b.startTime.slice(0, 5);
    times.set(time, (times.get(time) || 0) + 1);
  });
  const courts = data.courts.filter((c) => !courtId || c.id === courtId).map(
    (c) => {
      const slots = occupancy(data, from, to, c.id, scope);
      return {
        name: c.name,
        reservations: current.active.filter((b) => b.courtId === c.id).length,
        ...slots,
      };
    },
  );
  const inactiveBefore = shiftDate(to < data.today ? to : data.today, -30);
  const inactive = players.filter((p) =>
    p.createdAt.slice(0, 10) <= inactiveBefore &&
    !!p.lastBooking && p.lastBooking < inactiveBefore
  );
  const months = new Map<
    string,
    { month: string; reservations: number; net: number }
  >();
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const month = date.slice(0, 7);
    if (!months.has(month)) {
      months.set(month, { month, reservations: 0, net: 0 });
    }
  }
  current.active.forEach((b) => {
    months.get(b.date.slice(0, 7))!.reservations++;
  });
  current.completed.forEach((b) => {
    months.get(b.date.slice(0, 7))!.net += bookingNet(b);
  });
  current.sales.forEach((s) => {
    months.get(s.date.slice(0, 7))!.net += saleNetTotal(s);
  });
  const groupCancellations = (key: (b: Booking) => string) => {
    const counts = new Map<
      string,
      { name: string; total: number; cancelled: number }
    >();
    current.bookings.forEach((b) => {
      const name = key(b);
      const row = counts.get(name) || { name, total: 0, cancelled: 0 };
      row.total++;
      if (b.status === "cancelled") row.cancelled++;
      counts.set(name, row);
    });
    return [...counts.values()].filter((r) => r.cancelled).sort((a, b) =>
      b.cancelled - a.cancelled
    );
  };
  return {
    current,
    previous,
    previousFrom,
    previousTo,
    players: players.filter((p) => p.reservations > 0 || p.cancelled > 0),
    inactive,
    productMonths: [...productMonths.values()].sort((a, b) =>
      a.month.localeCompare(b.month) || a.name.localeCompare(b.name)
    ),
    cancelByCourt: groupCancellations((b) => b.courtName),
    cancelByDay: groupCancellations((b) =>
      weekdays[new Date(`${b.date}T12:00:00Z`).getUTCDay()]
    ),
    cancelByTime: groupCancellations((b) => b.startTime.slice(0, 5)),
    products: [...products.values()].sort((a, b) =>
      b.quantity - a.quantity || a.name.localeCompare(b.name)
    ),
    times: [...times].map(([time, reservations]) => ({ time, reservations }))
      .sort((a, b) => b.reservations - a.reservations),
    courts,
    months: [...months.values()],
    nextFree:
      occupancy(data, data.today, shiftDate(data.today, 6), courtId).freeSlots,
  };
}

export function playerReport(
  data: ReportData,
  playerId: string,
  from: string,
  to: string,
  courtId = "",
  scope: ReportScope = "all",
) {
  const bookings = data.bookings.filter((b) =>
    inPeriod(b.date, from, to) && (!courtId || b.courtId === courtId) &&
    b.players.some((p) => p.id === playerId) && matchesScope(data, b, scope)
  );
  let court = 0, products = 0, net = 0;
  bookings.filter((b) => b.status === "completed").forEach((b) => {
    const amounts = bookingCostBreakdown(b)[playerId];
    court += amounts?.court || 0;
    const gross = amounts?.total || 0;
    products += amounts?.consumptions || 0;
    const player = b.players.find((p) => p.id === playerId)!;
    net += gross -
      (player.paymentSplits || []).filter((p) => p.method === "complimentary")
        .reduce((sum, p) => sum + p.amount, 0);
  });
  if (!courtId && scope !== "future") {
    data.sales.filter((s) => s.type === "direct" && inPeriod(s.date, from, to))
      .forEach((s) => {
        if (s.distribution) {
          const person = s.distribution.participants.find((p) =>
            p.registered && p.id === playerId
          );
          if (person) {
            const gross = getSaleShares(s.items, s.distribution)[playerId] || 0;
            products += gross;
            net += saleParticipantAmounts(person, gross).net;
          }
        } else if (s.customer.id === playerId) {
          products += s.totalAmount;
          net += saleNetTotal(s);
        }
      });
  }
  const preferred = new Map<string, number>();
  bookings.filter((b) => b.status !== "cancelled").forEach((b) => {
    const time = b.startTime.slice(0, 5);
    preferred.set(time, (preferred.get(time) || 0) + 1);
  });
  return {
    perWeek: bookings.filter((b) => b.status === "completed").length /
      dayCount(from, to) * 7,
    preferred: [...preferred].sort((a, b) => b[1] - a[1]).slice(0, 3),
    bookings: [...bookings].sort((a, b) =>
      b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)
    ),
    court,
    products,
    net,
  };
}

export function csvContent(rows: (string | number)[][]) {
  return "\uFEFF" + rows.map((row) =>
    row.map((value) => {
      let text = String(value);
      if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) {
        text = `'${text}`;
      }
      return `"${text.replace(/"/g, '""')}"`;
    }).join(";")
  ).join("\r\n");
}
