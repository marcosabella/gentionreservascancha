import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url), realReact = require("react");
let frame;
const react = {
  ...realReact,
  useState(initial) {
    const owner = frame, index = owner.index++;
    if (!(index in owner.slots)) {
      owner.slots[index] = typeof initial === "function" ? initial() : initial;
    }
    return [owner.slots[index], (value) => {
      owner.slots[index] = typeof value === "function"
        ? value(owner.slots[index])
        : value;
    }];
  },
  useEffect(callback, deps) {
    const owner = frame, index = owner.index++, previous = owner.slots[index];
    if (!previous || deps.some((dep, i) => dep !== previous[i])) {
      owner.slots[index] = deps;
      owner.effects.push(callback);
    }
  },
  useMemo(callback) {
    return callback();
  },
};
const compiled = await build({
  entryPoints: ["src/components/ManagementReports.tsx"],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "lucide-react"],
  plugins: [{
    name: "test-config",
    setup(builder) {
      builder.onResolve(
        { filter: /\/lib\/supabase$/ },
        () => ({ path: "db", namespace: "test" }),
      );
      builder.onResolve(
        { filter: /\/config\/complex$/ },
        () => ({ path: "brand", namespace: "test" }),
      );
      builder.onLoad(
        { filter: /.*/, namespace: "test" },
        (args) => ({
          contents: args.path === "db"
            ? "export const supabase=globalThis.db"
            : 'export const complexName="Complejo de prueba"',
        }),
      );
    },
  }],
});
const today = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Argentina/Buenos_Aires",
}).format(new Date());
const data = {
  today,
  players: [{
    id: "ana",
    name: "Ana Pérez",
    createdAt: "2020-01-01",
    lastBooking: today,
  }],
  courts: [{ id: "c", name: "Cancha 1", startTime: "10:00", endTime: "13:00" }],
  bookings: [{
    id: "b",
    courtId: "c",
    courtName: "Cancha 1",
    date: today,
    startTime: "10:00",
    endTime: "11:30",
    status: "completed",
    totalPrice: 100,
    finalTotal: 120,
    players: [{ id: "ana", name: "Ana Pérez", isOrganizer: true }],
    consumptions: [{
      id: "i",
      name: "Agua",
      quantity: 1,
      price: 20,
      splitBetweenPlayers: true,
    }],
  }],
  sales: [],
  blocks: [],
  recurring: [],
};
const module = { exports: {} }, calls = [], downloads = [];
let fail = false, printed = 0;
runInNewContext(compiled.outputFiles[0].text, {
  module,
  exports: module.exports,
  require: (name) => name === "react" ? react : require(name),
  db: {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return fail
        ? { data: null, error: { message: "Sin conexión" } }
        : { data, error: null };
    },
  },
  Blob,
  URL: {
    createObjectURL(blob) {
      downloads.push(blob);
      return "blob:test";
    },
    revokeObjectURL() {},
  },
  document: {
    createElement() {
      return { click() {} };
    },
  },
  window: {
    print() {
      printed++;
    },
  },
  setTimeout: (callback) => callback(),
});
const Component = module.exports.default;
const owner = { slots: [], effects: [], index: 0, tree: null };
const render = () => {
  frame = owner;
  owner.index = 0;
  owner.tree = Component();
  frame = null;
  return renderToStaticMarkup(owner.tree);
};
const flush = async () => {
  for (const effect of owner.effects.splice(0)) effect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return render();
};
const nodes = (tree) =>
  !tree || typeof tree !== "object"
    ? []
    : Array.isArray(tree)
    ? tree.flatMap(nodes)
    : [tree, ...nodes(tree.props?.children)];
const text = (node) =>
  node == null || typeof node === "boolean"
    ? ""
    : Array.isArray(node)
    ? node.map(text).join("")
    : typeof node === "object"
    ? text(node.props?.children)
    : String(node);
const button = (label) => {
  const item = nodes(owner.tree).find((n) =>
    n.type === "button" && text(n).includes(label)
  );
  assert(item, `Missing button ${label}`);
  return item;
};
const field = (label) =>
  nodes(owner.tree).find((n) => n.props?.["aria-label"] === label);
assert(render().includes("Consultando el período completo"));
assert.equal(button("Excel / CSV").props.disabled, true);
let html = await flush();
assert(
  html.includes("Importe neto de operaciones") && html.includes("Ana Pérez"),
);
assert.equal(calls[0].name, "management_report_data");
assert.equal(field("Estado de las reservas").props.value, "completed");
field("Estado de las reservas").props.onChange({ target: { value: "future" } });
render();
html = await flush();
assert.equal(field("Estado de las reservas").props.value, "future");
assert(html.includes("Planificación: solo reservas pendientes o confirmadas"));
assert.equal(field("Desde").props.value, today);
button("Excel / CSV").props.onClick();
assert((await downloads.pop().text()).includes("Reservas futuras"));
field("Estado de las reservas").props.onChange({ target: { value: "all" } });
render();
html = await flush();
assert(html.includes("Vista general de todos los estados"));
field("Estado de las reservas").props.onChange({
  target: { value: "completed" },
});
render();
html = await flush();
for (
  const label of [
    "Jugadores",
    "Consumibles",
    "Horarios y canchas",
    "Turnos libres",
    "Cancelaciones",
    "Resumen",
  ]
) {
  button(label).props.onClick();
  html = render();
  assert(!html.includes("No se pudieron cargar"));
}
button("Jugadores").props.onClick();
render();
field("Jugador para informe individual").props.onChange({
  target: { value: "ana" },
});
html = render();
assert(
  html.includes("Frecuencia:") && html.includes("Horarios más elegidos") &&
    html.includes("Finalizado"),
);
button("Excel / CSV").props.onClick();
assert.equal(downloads.length, 1);
assert((await downloads[0].text()).includes("Detalle jugador"));
button("Imprimir / PDF").props.onClick();
assert.equal(printed, 1);
field("Cancha").props.onChange({ target: { value: "c" } });
html = render();
assert(html.includes("se excluyen las ventas directas"));
field("Hasta").props.onChange({ target: { value: "2000-01-01" } });
html = render();
assert(button("Consultar / actualizar").props.disabled);
fail = true;
button("Últimos 30 días").props.onClick();
render();
html = await flush();
assert(html.includes("Sin conexión"));
assert.equal(button("Excel / CSV").props.disabled, true);
fail = false;
button("Reintentar").props.onClick();
render();
html = await flush();
assert(html.includes("Informe individual"));
const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
assert(
  sidebar.indexOf("id: 'reportes'") <
    sidebar.indexOf("id: 'configuracion-menu'"),
);
assert(sidebar.indexOf("id: 'reportes'") > sidebar.indexOf("id: 'torneos'"));
console.log(
  "PASS: actual report component, all sections, player details, date/court filters, CSV, print action, loading/error/retry and menu placement.",
);
