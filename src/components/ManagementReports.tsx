import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { BarChart3, Download, Printer, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import { complexName } from "../config/complex";
import { getArgentinaDateString, getArgentinaTimeString } from "../utils/date";
import {
  buildManagementReport,
  csvContent,
  dayCount,
  money,
  playerReport,
  reportScopeLabels,
  shiftDate,
  weekdays,
} from "../utils/managementReports";
import type { ReportData, ReportScope } from "../utils/managementReports";

const panels = [
  ["summary", "Resumen"],
  ["players", "Jugadores"],
  ["products", "Consumibles"],
  ["occupancy", "Horarios y canchas"],
  ["free", "Turnos libres"],
  ["cancellations", "Cancelaciones"],
] as const;
type Panel = typeof panels[number][0];
const statusNames: Record<string, string> = {
  completed: "Finalizado",
  cancelled: "Cancelado",
  confirmed: "Confirmado",
  pending: "Pendiente",
  "in-progress": "En curso",
};
const dateLabel = (value: string) => value.split("-").reverse().join("/");
const monthLabel = (value: string) => value.split("-").reverse().join("-");
function Table(
  { headers, rows, empty = "No hay datos para los filtros seleccionados." }: {
    headers: string[];
    rows: ReactNode[][];
    empty?: string;
  },
) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                scope="col"
                className="whitespace-nowrap px-4 py-3 font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3">{cell}</td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td
                colSpan={headers.length}
                className="p-8 text-center text-gray-500"
              >
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function Card(
  { label, value, previous }: {
    label: string;
    value: string | number;
    previous?: string | number;
  },
) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {previous !== undefined && (
        <p className="mt-2 text-xs text-gray-500">
          Período anterior: {previous}
        </p>
      )}
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}
export default function ManagementReports() {
  const today = getArgentinaDateString();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [period, setPeriod] = useState({ from, to });
  const [court, setCourt] = useState("");
  const [scope, setScope] = useState<ReportScope>("completed");
  const reservationLabel = scope === "completed"
    ? "Turnos finalizados"
    : scope === "future"
    ? "Reservas futuras"
    : "Reservas vigentes";
  const freeLabel = scope === "completed" ? "Sin finalizar" : "Libres";
  const occupiedLabel = scope === "completed" ? "Finalizados" : "Ocupados";
  const [playerId, setPlayerId] = useState("");
  const [panel, setPanel] = useState<Panel>("summary");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [productOrder, setProductOrder] = useState("quantity");
  const [playerSearch, setPlayerSearch] = useState("");
  const invalid = !from || !to || from > to || dayCount(from, to) > 366;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    supabase.rpc("management_report_data", {
      date_from: period.from,
      date_to: period.to,
    }).then(
      (
        { data: result, error: failure }: {
          data: ReportData | null;
          error: { message: string } | null;
        },
      ) => {
        if (!active) return;
        if (failure) setError(failure.message);
        else setData({ ...result!, nowTime: getArgentinaTimeString() });
        setLoading(false);
      },
      (failure: unknown) => {
        if (active) {
          setError(
            failure instanceof Error
              ? failure.message
              : "No se pudieron cargar los reportes.",
          );
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [period.from, period.to, revision]);
  const report = useMemo(
    () =>
      data
        ? buildManagementReport(data, period.from, period.to, court, scope)
        : null,
    [data, period, court, scope],
  );
  const detail = useMemo(
    () =>
      data && playerId
        ? playerReport(data, playerId, period.from, period.to, court, scope)
        : null,
    [data, playerId, period, court, scope],
  );
  useEffect(() => {
    if (playerId && report && !report.players.some((p) => p.id === playerId)) {
      setPlayerId("");
    }
  }, [playerId, report]);
  const products = report
    ? [...report.products].sort((a, b) =>
      productOrder === "amount" ? b.amount - a.amount : b.quantity - a.quantity
    )
    : [];
  const exportCsv = () => {
    if (!report || !data) return;
    const { current: c } = report;
    const rows: (string | number)[][] = [
      [complexName, "Reportes y estadísticas"],
      ["Desde", period.from, "Hasta", period.to],
      ["Estado de las reservas", reportScopeLabels[scope]],
      [
        "Cancha",
        data.courts.find((c) => c.id === court)?.name || "Todas",
      ],
      ["Resumen"],
      [reservationLabel, c.active.length],
      ["Finalizados", c.completed.length],
      ["Cancelaciones", c.cancellations],
      ["Importe neto de operaciones", c.net],
      ["Valor bruto canchas", c.courtGross],
      ["Valor bruto consumibles", c.productGross],
      ["Ocupación %", c.occupancy.percent],
      [],
      ["Jugadores"],
      [
        "Jugador",
        "Reservas",
        "Como organizador",
        "Finalizadas",
        "Canceladas",
        "Última del período",
      ],
      ...report.players.map(
        (p) => [
          p.name,
          p.reservations,
          p.organized,
          p.completed,
          p.cancelled,
          p.lastInPeriod || "",
        ],
      ),
      [],
      ["Consumibles (importe bruto antes de bonificaciones)"],
      [
        "Producto",
        "Unidades",
        "Importe",
        "Unidades venta directa",
        "Unidades en turnos",
      ],
      ...products.map(
        (p) => [p.name, p.quantity, p.amount, p.direct, p.booking],
      ),
      [],
      ["Evolución mensual de consumibles"],
      ["Mes", "Producto", "Unidades", "Importe bruto"],
      ...report.productMonths.map(
        (p) => [monthLabel(p.month), p.name, p.quantity, p.amount],
      ),
      [],
      ["Ocupación (grilla de 90 minutos, configuración actual)"],
      ["Día", "Hora", "Ofertados", occupiedLabel, freeLabel, "Ocupación %"],
      ...c.occupancy.rows.map(
        (r) => [
          weekdays[r.day],
          r.time,
          r.offered,
          r.occupied,
          r.free,
          r.occupied / r.offered * 100,
        ],
      ),
      [],
      ["Disponibilidad próximos 7 días"],
      ["Fecha", "Cancha", "Desde", "Hasta"],
      ...report.nextFree.map((s) => [s.date, s.court, s.start, s.end]),
      [],
      ["Evolución mensual"],
      ["Mes", "Reservas", "Importe neto"],
      ...report.months.map((m) => [monthLabel(m.month), m.reservations, m.net]),
      [],
      ["Sin actividad hace más de 30 días"],
      ["Jugador", "Última reserva registrada"],
      ...report.inactive.map((p) => [p.name, p.lastBooking || "Sin reservas"]),
      [],
      ["Cancelaciones"],
      ["Fecha", "Hora", "Cancha", "Jugadores"],
      ...c.bookings.filter((b) => b.status === "cancelled").map(
        (b) => [
          b.date,
          b.startTime.slice(0, 5),
          b.courtName,
          b.players.map((p) => p.name).join(", "),
        ],
      ),
    ];
    if (detail) {
      rows.push(
        [],
        [
          "Detalle jugador",
          data.players.find((p) => p.id === playerId)?.name || "",
        ],
        ["Cancha bruto", detail.court],
        ["Consumibles bruto", detail.products],
        ["Importe neto", detail.net],
        ["Fecha", "Hora", "Cancha", "Estado"],
        ...detail.bookings.map(
          (b) => [
            b.date,
            b.startTime.slice(0, 5),
            b.courtName,
            statusNames[b.status],
          ],
        ),
      );
    }
    const url = URL.createObjectURL(
      new Blob([csvContent(rows)], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `reportes-${period.from}-${period.to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div id="management-report" className="space-y-6">
      <style>
        {`@media print { body * { visibility: hidden; } #management-report, #management-report * { visibility: visible; } #management-report { position: absolute; left: 0; top: 0; width: 100%; color: #111; background: white; } #management-report .report-controls { display: none !important; } #management-report .overflow-x-auto { overflow: visible !important; } #management-report table { font-size: 10px; } #management-report tr { break-inside: avoid; } #management-report thead { display: table-header-group; } }`}
      </style>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <BarChart3 className="h-7 w-7 text-green-600" />Reportes y
            estadísticas
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {complexName} · {dateLabel(period.from)} al {dateLabel(period.to)} ·
            {" "}
            {data?.courts.find((c) => c.id === court)?.name ||
              "Todas las canchas"} · {reportScopeLabels[scope]}
          </p>
        </div>
        <div className="report-controls flex flex-wrap gap-2">
          <button
            disabled={!report || loading}
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            <Download className="h-4 w-4" />Excel / CSV
          </button>
          <button
            disabled={!report || loading}
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />Imprimir / PDF
          </button>
        </div>
      </div>
      <form
        className="report-controls flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) {
            setPeriod({ from, to });
            setRevision((r) => r + 1);
          }
        }}
      >
        <label className="text-sm text-gray-700">
          Desde<input
            aria-label="Desde"
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="text-sm text-gray-700">
          Hasta<input
            aria-label="Hasta"
            type="date"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="text-sm text-gray-700">
          Cancha<select
            aria-label="Cancha"
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            className="mt-1 block max-w-64 rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="">Todas las canchas</option>
            {data?.courts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          Estado de las reservas
          <select
            aria-label="Estado de las reservas"
            value={scope}
            onChange={(e) => {
              const value = e.target.value as ReportScope;
              setScope(value);
              if (value === "future") {
                const end = shiftDate(today, 6);
                setFrom(today);
                setTo(end);
                setPeriod({ from: today, to: end });
              } else if (value === "completed" && from > today) {
                const start = today.slice(0, 8) + "01";
                setFrom(start);
                setTo(today);
                setPeriod({ from: start, to: today });
              }
            }}
            className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
          >
            {Object.entries(reportScopeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button
          disabled={invalid || loading}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Cargando…" : "Consultar / actualizar"}
        </button>
        <div className="flex flex-wrap gap-2 text-xs">
          {[["Este mes", today.slice(0, 8) + "01", today], [
            "Últimos 30 días",
            shiftDate(today, -29),
            today,
          ], ["Próximos 7 días", today, shiftDate(today, 6)]].map((
            [label, start, end],
          ) => (
            <button
              key={label}
              type="button"
              className="rounded-full bg-gray-100 px-3 py-2"
              onClick={() => {
                setFrom(start);
                setTo(end);
                setPeriod({ from: start, to: end });
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {invalid && (
          <p role="alert" className="w-full text-sm text-red-700">
            Seleccioná un período válido de hasta 366 días.
          </p>
        )}
      </form>
      <nav
        aria-label="Secciones de reportes"
        className="report-controls flex flex-wrap gap-2"
      >
        {panels.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={panel === key}
            onClick={() => setPanel(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              panel === key
                ? "bg-green-600 text-white"
                : "border border-gray-200 bg-white text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      {loading && (
        <p
          role="status"
          className="rounded-xl bg-white p-8 text-center text-gray-500"
        >
          Consultando el período completo…
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
        >
          No se pudieron cargar los reportes: {error}
          <button
            onClick={() => setRevision((r) => r + 1)}
            className="ml-3 underline"
          >
            Reintentar
          </button>
        </div>
      )}
      {report && data && (
        <>
          <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
            {scope === "completed"
              ? "Análisis de actividad realizada: solo reservas finalizadas. La ocupación excluye horarios que todavía no transcurrieron y no proyecta turnos fijos. "
              : scope === "future"
              ? "Planificación: solo reservas pendientes o confirmadas cuyo inicio aún no llegó. No se suman importes ni consumibles como ventas realizadas. "
              : "Vista general de todos los estados dentro del período. "}
            Las operaciones incluyen turnos finalizados y ventas directas,
            descontando bonificaciones. Incluyen cuenta corriente y no equivalen
            a dinero cobrado. Los importes por cancha y producto se muestran en
            bruto. {court &&
              "Con una cancha seleccionada se excluyen las ventas directas, que no tienen cancha asignada."}
          </p>
          {panel === "summary" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card
                  label={reservationLabel}
                  value={report.current.active.length}
                  previous={scope === "future"
                    ? undefined
                    : report.previous.active.length}
                />
                <Card
                  label="Turnos finalizados"
                  value={report.current.completed.length}
                  previous={scope === "future"
                    ? undefined
                    : report.previous.completed.length}
                />
                <Card
                  label="Importe neto de operaciones"
                  value={money(report.current.net)}
                  previous={scope === "future"
                    ? undefined
                    : money(report.previous.net)}
                />
                <Card
                  label="Ocupación de turnos"
                  value={`${report.current.occupancy.percent.toFixed(1)}%`}
                  previous={scope === "future"
                    ? undefined
                    : `${report.previous.occupancy.percent.toFixed(1)}%`}
                />
              </div>
              <p className="text-xs text-gray-500">
                {scope === "future"
                  ? "La vista futura muestra planificación a partir de la fecha y hora de consulta; no se compara con períodos pasados."
                  : `Comparación con ${dateLabel(report.previousFrom)} al ${
                    dateLabel(report.previousTo)
                  }, de igual duración y con el mismo filtro de estado.`}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card
                  label="Valor bruto de canchas finalizadas"
                  value={money(report.current.courtGross)}
                />
                <Card
                  label="Valor bruto de consumibles vendidos"
                  value={money(report.current.productGross)}
                />
                <Card
                  label="Cancelaciones"
                  value={`${report.current.cancellations} (${
                    report.current.bookings.length
                      ? (report.current.cancellations /
                        report.current.bookings.length * 100).toFixed(1)
                      : "0"
                  }%)`}
                />
              </div>
              <Section title="Evolución mensual">
                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
                  {report.months.map((m) => (
                    <div key={m.month}>
                      <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
                        <span>
                          {monthLabel(m.month)} · {m.reservations} reservas
                        </span>
                        <strong>{money(m.net)}</strong>
                      </div>
                      <div className="h-3 rounded-full bg-gray-100">
                        <div
                          className="h-3 rounded-full bg-green-500"
                          style={{
                            width: `${
                              Math.max(0, m.net) /
                              Math.max(
                                1,
                                ...report.months.map((r) => r.net),
                              ) * 100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
              <div className="grid gap-6 lg:grid-cols-2">
                <Section title="Jugadores con más reservas">
                  <Table
                    headers={["Jugador", "Reservas"]}
                    rows={report.players.filter((p) => p.reservations).slice(
                      0,
                      5,
                    ).map((p) => [p.name, p.reservations])}
                  />
                </Section>
                <Section title="Consumibles más vendidos">
                  <Table
                    headers={["Producto", "Unidades"]}
                    rows={products.slice(0, 5).map((p) => [p.name, p.quantity])}
                  />
                </Section>
              </div>
            </>
          )}
          {panel === "players" && (
            <>
              <Section title="Ranking de jugadores">
                <input
                  aria-label="Buscar jugador en ranking"
                  placeholder="Buscar jugador…"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  className="report-controls w-full rounded-lg border border-gray-300 p-3"
                />
                <p className="text-xs text-gray-500">
                  Cada reserva se cuenta una vez por participante. El
                  organizador también cuenta como participante. Solo se muestran
                  jugadores con reservas o cancelaciones en el período
                  seleccionado.
                </p>
                <Table
                  headers={[
                    "Jugador",
                    "Reservas",
                    "Organizador",
                    "Finalizadas",
                    "Canceladas",
                    "Última del período",
                    "Detalle",
                  ]}
                  rows={report.players.filter((p) =>
                    p.name.toLowerCase().includes(playerSearch.toLowerCase())
                  ).map(
                    (p) => [
                      p.name,
                      p.reservations,
                      p.organized,
                      p.completed,
                      p.cancelled,
                      p.lastInPeriod ? dateLabel(p.lastInPeriod) : "—",
                      <button
                        className="report-controls font-medium text-green-700 underline"
                        onClick={() => setPlayerId(p.id)}
                      >
                        Ver jugador
                      </button>,
                    ],
                  )}
                />
              </Section>
              <Section title="Informe individual">
                <select
                  aria-label="Jugador para informe individual"
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                  className="report-controls w-full rounded-lg border border-gray-300 p-3"
                >
                  <option value="">Seleccioná un jugador</option>
                  {report.players.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {detail
                  ? (
                    <>
                      <h4 className="font-semibold">
                        {data.players.find((p) => p.id === playerId)?.name}
                      </h4>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Card
                          label="Su parte de cancha (bruto)"
                          value={money(detail.court)}
                        />
                        <Card
                          label="Su consumo en turnos y ventas (bruto)"
                          value={money(detail.products)}
                        />
                        <Card
                          label="Importe neto de sus operaciones"
                          value={money(detail.net)}
                        />
                      </div>
                      <p className="text-sm text-gray-600">
                        Frecuencia: {detail.perWeek.toFixed(1)}{" "}
                        turnos finalizados por semana en el período. Horarios
                        más elegidos: {detail.preferred.map(([time, count]) =>
                          `${time} (${count})`
                        ).join(", ") || "Sin reservas vigentes"}.
                      </p>
                      <p className="text-xs text-gray-500">
                        Importes de turnos finalizados, según reparto y consumos
                        asignados. Las reservas abiertas aparecen en el
                        historial sin sumar importes.
                      </p>
                      <Table
                        headers={[
                          "Fecha",
                          "Horario",
                          "Cancha",
                          "Estado",
                          "Organizador",
                        ]}
                        rows={detail.bookings.map(
                          (b) => [
                            dateLabel(b.date),
                            b.startTime.slice(0, 5),
                            b.courtName,
                            statusNames[b.status],
                            b.players.find((p) =>
                                p.id === playerId
                              )
                                ?.isOrganizer
                              ? "Sí"
                              : "No",
                          ],
                        )}
                      />
                    </>
                  )
                  : (
                    <p className="text-sm text-gray-500">
                      Seleccioná un jugador para consultar su historial e
                      importes.
                    </p>
                  )}
              </Section>
              <Section title="Jugadores sin actividad hace más de 30 días">
                <p className="text-xs text-gray-500">
                  Actividad general hasta{" "}
                  {dateLabel(period.to < data.today ? period.to : data.today)},
                  sin restringir por cancha. Solo incluye jugadores con reservas
                  históricas registradas.
                </p>
                <Table
                  headers={["Jugador", "Última reserva registrada"]}
                  rows={report.inactive.map(
                    (p) => [
                      p.name,
                      p.lastBooking ? dateLabel(p.lastBooking) : "Sin reservas",
                    ],
                  )}
                />
              </Section>
            </>
          )}
          {panel === "products" && (
            <Section title="Ranking de consumibles vendidos">
              <label className="report-controls flex items-center gap-2 text-sm">
                Ordenar por<select
                  aria-label="Orden de consumibles"
                  value={productOrder}
                  onChange={(e) => setProductOrder(e.target.value)}
                  className="rounded-lg border p-2"
                >
                  <option value="quantity">Unidades</option>
                  <option value="amount">Importe</option>
                </select>
              </label>
              <p className="text-xs text-gray-500">
                Ventas directas y consumos de turnos finalizados. Los turnos se
                contabilizan una sola vez. Importes brutos antes de
                bonificaciones.
              </p>
              <Table
                headers={[
                  "Producto",
                  "Unidades",
                  "Importe bruto",
                  "Venta directa (un.)",
                  "En turnos (un.)",
                ]}
                rows={products.map(
                  (p) => [
                    p.name,
                    p.quantity,
                    money(p.amount),
                    p.direct,
                    p.booking,
                  ],
                )}
              />
              <Section title="Evolución mensual de consumibles">
                <Table
                  headers={["Mes", "Producto", "Unidades", "Importe bruto"]}
                  rows={report.productMonths.map(
                    (
                      p,
                    ) => [
                      monthLabel(p.month),
                      p.name,
                      p.quantity,
                      money(p.amount),
                    ],
                  )}
                />
              </Section>
            </Section>
          )}
          {panel === "occupancy" && (
            <>
              <Section title="Mapa de ocupación por día y horario">
                <p className="text-xs text-gray-500">
                  {scope === "completed"
                    ? "Turnos finalizados sobre la capacidad ya transcurrida; sin finalizar no significa disponible para reservar. "
                    : scope === "future"
                    ? "Reservas futuras y turnos fijos activos sobre la capacidad futura. "
                    : "Porcentaje de turnos ocupados sobre ofertados. "}{" "}
                  Grilla de 90 minutos según horarios y bloqueos actuales; no
                  reconstruye cambios históricos de configuración. Un
                  solapamiento ocupa el turno completo.
                </p>
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-center text-sm">
                    <thead>
                      <tr>
                        <th scope="col" className="p-3">Horario</th>
                        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                          <th scope="col" key={d} className="p-3">
                            {weekdays[d]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...new Set(
                          report.current.occupancy.rows.map((r) => r.time),
                        ),
                      ].map((time) => (
                        <tr key={time}>
                          <th scope="row" className="p-3">{time}</th>
                          {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                            const r = report.current.occupancy.rows.find((r) =>
                              r.time === time && r.day === day
                            );
                            const percent = r
                              ? r.occupied / r.offered * 100
                              : null;
                            return (
                              <td
                                key={day}
                                className="border border-white p-3"
                                style={{
                                  background: percent === null
                                    ? "#f3f4f6"
                                    : `rgba(22,163,74,${0.08 + percent / 145})`,
                                  color: "#111827",
                                }}
                                title={r
                                  ? `${r.occupied} ${occupiedLabel.toLowerCase()} de ${r.offered}`
                                  : "Sin turnos ofertados"}
                              >
                                {r
                                  ? (
                                    <>
                                      <strong>{percent!.toFixed(0)}%</strong>
                                      <span className="block text-xs">
                                        {r.occupied}/{r.offered}
                                      </span>
                                    </>
                                  )
                                  : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!report.current.occupancy.rows.length && (
                    <p className="p-6 text-gray-500">
                      No hay turnos ofertados con estos filtros.
                    </p>
                  )}
                </div>
              </Section>
              <Section title="Horarios con más reservas">
                <Table
                  headers={["Hora de inicio", reservationLabel]}
                  rows={report.times.map((r) => [r.time, r.reservations])}
                />
              </Section>
              <Section title="Utilización por cancha">
                <Table
                  headers={[
                    "Cancha",
                    "Reservas",
                    "Ofertados",
                    occupiedLabel,
                    freeLabel,
                    "Ocupación",
                  ]}
                  rows={report.courts.map(
                    (c) => [
                      c.name,
                      c.reservations,
                      c.offered,
                      c.occupied,
                      c.free,
                      `${c.percent.toFixed(1)}%`,
                    ],
                  )}
                />
              </Section>
            </>
          )}
          {panel === "free" && (
            <>
              <Section title="Franjas con mayor disponibilidad">
                <p className="text-xs text-gray-500">
                  {scope === "completed" &&
                    "En esta vista, “Sin finalizar” indica capacidad transcurrida sin un turno finalizado registrado; no es disponibilidad futura. "}
                  Período seleccionado. Ordenadas por menor ocupación y luego
                  por cantidad de turnos libres; excluye franjas sin capacidad
                  ofertada. Se descuentan clases, cierres y mantenimiento con la
                  configuración actual.
                </p>
                <Table
                  headers={["Día", "Hora", freeLabel, "Ofertados", "Ocupación"]}
                  rows={[...report.current.occupancy.rows].sort((a, b) =>
                    a.occupied / a.offered - b.occupied / b.offered ||
                    b.free - a.free
                  ).map(
                    (r) => [
                      weekdays[r.day],
                      r.time,
                      r.free,
                      r.offered,
                      `${(r.occupied / r.offered * 100).toFixed(1)}%`,
                    ],
                  )}
                />
              </Section>
              <Section title="Próximos espacios libres · 7 días">
                <p className="text-xs text-gray-500">
                  Desde{" "}
                  {dateLabel(data.today)}, independientemente del período
                  seleccionado y del filtro de estado: esta lista siempre
                  muestra disponibilidad real. Incluye el día de hoy; verificá
                  la hora antes de ofrecer un turno.
                </p>
                <Table
                  headers={["Fecha", "Cancha", "Desde", "Hasta"]}
                  rows={report.nextFree.map(
                    (s) => [dateLabel(s.date), s.court, s.start, s.end],
                  )}
                />
              </Section>
            </>
          )}
          {panel === "cancellations" && (
            <>
              {scope !== "all" && (
                <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                  Para analizar cancelaciones, seleccioná “Todos los estados”.
                  Las reservas canceladas quedan fuera de los filtros de
                  finalizados y futuras.
                </p>
              )}
              <Section title="Cancelaciones por cancha, día y horario">
                <div className="grid gap-4 xl:grid-cols-3">
                  {[["Cancha", report.cancelByCourt], [
                    "Día",
                    report.cancelByDay,
                  ], ["Horario", report.cancelByTime]].map(([label, rows]) => (
                    <Table
                      key={label as string}
                      headers={[label as string, "Canceladas", "% del grupo"]}
                      rows={(rows as typeof report.cancelByCourt).map(
                        (r) => [
                          r.name,
                          r.cancelled,
                          `${(r.cancelled / r.total * 100).toFixed(1)}%`,
                        ],
                      )}
                    />
                  ))}
                </div>
              </Section>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card
                  label="Cancelaciones del período"
                  value={report.current.cancellations}
                  previous={scope === "future"
                    ? undefined
                    : report.previous.cancellations}
                />
                <Card
                  label="Porcentaje sobre todas las reservas"
                  value={`${
                    report.current.bookings.length
                      ? (report.current.cancellations /
                        report.current.bookings.length * 100).toFixed(1)
                      : "0"
                  }%`}
                />
              </div>
              <Section title="Cancelaciones por jugador">
                <p className="text-xs text-gray-500">
                  Se atribuye la cancelación a los participantes del turno; no
                  indica quién realizó la acción.
                </p>
                <Table
                  headers={[
                    "Jugador",
                    "Turnos cancelados",
                    "% de sus reservas",
                  ]}
                  rows={report.players.filter((p) => p.cancelled).sort((a, b) =>
                    b.cancelled - a.cancelled
                  ).map(
                    (p) => [
                      p.name,
                      p.cancelled,
                      `${
                        (p.cancelled / (p.reservations + p.cancelled) * 100)
                          .toFixed(1)
                      }%`,
                    ],
                  )}
                />
              </Section>
              <Section title="Detalle de reservas canceladas">
                <Table
                  headers={["Fecha", "Hora", "Cancha", "Jugadores"]}
                  rows={report.current.bookings.filter((b) =>
                    b.status === "cancelled"
                  ).sort((a, b) => b.date.localeCompare(a.date)).map(
                    (b) => [
                      dateLabel(b.date),
                      b.startTime.slice(0, 5),
                      b.courtName,
                      b.players.map((p) => p.name).join(", "),
                    ],
                  )}
                />
              </Section>
            </>
          )}
          <p className="text-xs text-gray-500">
            Excel / CSV exporta todas las secciones y el jugador seleccionado.
            Imprimir / PDF exporta la sección visible. Datos actualizados al
            consultar.
          </p>
        </>
      )}
    </div>
  );
}
