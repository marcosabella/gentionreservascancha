import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSync } from "esbuild";
import { PGlite } from "../tmp/stock-test/node_modules/@electric-sql/pglite/dist/index.js";
process.on("uncaughtException", (error) => {
  console.error(error.message, error.where || "");
  process.exit(1);
});
const compiled = buildSync({
  entryPoints: ["src/utils/managementReports.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { buildManagementReport, playerReport, occupancy, csvContent } =
  await import(
    `data:text/javascript;base64,${
      Buffer.from(compiled.outputFiles[0].text).toString("base64")
    }`
  );
const booking = {
  id: "b",
  courtId: "c",
  courtName: "Cancha",
  date: "2026-11-16",
  startTime: "10:00",
  endTime: "11:30",
  status: "completed",
  totalPrice: 100,
  finalTotal: 160,
  players: [{
    id: "a",
    name: "Ana",
    isOrganizer: true,
    paymentSplits: [{ method: "complimentary", amount: 20 }],
  }, { id: "b", name: "Beto" }],
  consumptions: [{
    id: "i",
    consumableId: "water",
    name: "Agua",
    quantity: 3,
    price: 20,
    splitBetweenPlayers: false,
    assignedToPlayers: ["a"],
  }],
};
const direct = {
  id: "s",
  type: "direct",
  date: "2026-11-16",
  customer: { id: "b" },
  totalAmount: 40,
  items: [{
    consumableId: "water",
    name: "Agua",
    quantity: 2,
    price: 20,
    subtotal: 40,
  }],
};
const data = {
  today: "2026-11-16",
  players: [{
    id: "a",
    name: "Ana",
    createdAt: "2026-01-01",
    lastBooking: "2026-11-16",
  }, {
    id: "b",
    name: "Beto",
    createdAt: "2026-01-01",
    lastBooking: "2026-11-16",
  }, {
    id: "inactive",
    name: "Inactivo",
    createdAt: "2026-01-01",
    lastBooking: "2026-01-15",
  }, { id: "never", name: "Sin reservas", createdAt: "2026-01-01" }],
  courts: [{ id: "c", name: "Cancha", startTime: "10:00", endTime: "14:30" }],
  bookings: [booking, {
    ...booking,
    id: "cancel",
    status: "cancelled",
    startTime: "11:30",
    endTime: "13:00",
  }, { ...booking, id: "previous", date: "2026-11-15" }],
  sales: [direct, { ...direct, id: "duplicate", type: "booking" }],
  blocks: [{
    courtId: "c",
    isActive: true,
    date: "2026-11-16",
    startTime: "13:00",
    endTime: "14:30",
  }],
  recurring: [],
};
const report = buildManagementReport(data, "2026-11-16", "2026-11-16");
const scopedData = {
  ...data,
  nowTime: "12:00",
  bookings: [
    ...data.bookings,
    { ...booking, id: "past-pending", date: "2026-11-15", status: "pending" },
    { ...booking, id: "elapsed", status: "confirmed" },
    { ...booking, id: "future", date: "2026-11-17", status: "confirmed" },
    {
      ...booking,
      id: "later-today",
      startTime: "13:00",
      endTime: "14:30",
      status: "pending",
    },
    { ...booking, id: "ongoing", status: "in-progress" },
  ],
};
const done = buildManagementReport(
  scopedData,
  "2026-11-16",
  "2026-11-17",
  "",
  "completed",
);
assert.equal(
  done.current.active.length,
  1,
  "Finalized scope excludes all other states",
);
assert.equal(
  done.current.occupancy.offered,
  1,
  "Future dates and unelapsed slots must not dilute finalized occupancy",
);
assert.equal(done.current.occupancy.percent, 100);
assert.equal(done.current.cancellations, 0);
const future = buildManagementReport(
  scopedData,
  "2026-11-16",
  "2026-11-17",
  "",
  "future",
);
assert.equal(
  future.current.active.length,
  2,
  "Future scope includes pending/confirmed starts after the Argentina snapshot time",
);
assert.equal(
  future.current.net,
  0,
  "Scheduled activity is not recognized as realized revenue",
);
assert.equal(future.products.length, 0);
assert.equal(future.current.sales.length, 0);
assert.equal(
  future.current.occupancy.offered,
  3,
  "Only future, unblocked capacity is offered",
);
assert.equal(
  playerReport(scopedData, "a", "2026-11-16", "2026-11-17", "", "future")
    .bookings.length,
  2,
);
assert.equal(
  playerReport(scopedData, "a", "2026-11-16", "2026-11-17", "", "future").net,
  0,
);
assert.equal(
  report.current.net,
  180,
  "Net subtracts complimentary amounts and ignores duplicate booking sales",
);
assert.equal(report.current.productGross, 100);
assert.equal(report.products[0].quantity, 5);
assert.equal(report.products[0].direct, 2);
assert.equal(
  report.current.occupancy.offered,
  2,
  "Blocked slots are removed from capacity",
);
assert.equal(report.current.occupancy.occupied, 1);
assert.equal(
  report.current.occupancy.free,
  1,
  "Cancelled reservation releases the slot",
);
assert.equal(report.current.occupancy.percent, 50);
assert.equal(report.previous.net, 140);
assert.equal(
  report.players.find((p) => p.id === "b").reservations,
  1,
  "Participants count as well as organizers",
);
assert.equal(report.inactive.length, 1);
assert.equal(
  report.players.length,
  2,
  "Players without bookings or cancellations in this period must not appear in rankings or exports",
);
assert.equal(
  playerReport(data, "a", "2026-11-16", "2026-11-16").net,
  90,
  "Assigned consumptions and complimentary splits belong to the selected player",
);
assert.equal(playerReport(data, "b", "2026-11-16", "2026-11-16").net, 90);
assert.equal(
  buildManagementReport(data, "2026-11-16", "2026-11-16", "c").current.net,
  140,
  "Direct sales excluded when filtering a court",
);
assert(
  csvContent([["=SUM(A1)", 'A;"B', 20]]).includes("'=") &&
    csvContent([['"']]).includes('""""'),
  "CSV escapes formulas and quotes",
);
const overnight = {
  ...data,
  courts: [{ id: "c", name: "Noche", startTime: "22:30", endTime: "03:00" }],
  bookings: [{ ...booking, startTime: "00:00", endTime: "01:30" }],
  blocks: [],
  recurring: [],
};
assert.equal(
  occupancy(overnight, data.today, data.today).occupied,
  1,
  "Overnight bookings map to the correct slot",
);
assert.equal(occupancy(overnight, data.today, data.today).offered, 3);
overnight.blocks = [{
  courtId: "c",
  isActive: true,
  date: data.today,
  startTime: "23:00",
  endTime: "02:00",
}];
assert.equal(
  occupancy(overnight, data.today, data.today).offered,
  0,
  "Partial overlapping blocks remove each affected 90-minute slot",
);
const fixed = {
  ...data,
  bookings: [],
  blocks: [],
  recurring: [{
    courtId: "c",
    isActive: true,
    dayOfWeek: 1,
    startTime: "10:00",
    endTime: "11:30",
    skipDates: [],
  }],
};
assert.equal(occupancy(fixed, data.today, data.today).occupied, 1);
fixed.recurring[0].skipDates.push(data.today);
assert.equal(occupancy(fixed, data.today, data.today).occupied, 0);
console.log(
  "PASS: rankings, assigned consumptions, complimentary amounts, comparison periods, no duplicate sales, cancellations, blocks, overnight slots, fixed exceptions, court filters and CSV.",
);

const db = new PGlite();
try {
  await db.exec(
    `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, phone text, created_at timestamptz, last_sign_in_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}', encrypted_password text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;`,
  );
  await db.exec(readFileSync("supabase/pura-vida-public-schema.sql", "utf8"));
  await db.exec(
    readFileSync(
      "supabase/migrations/20261019120000_employee_permissions.sql",
      "utf8",
    ),
  );
  await db.exec(`ALTER TABLE public.sales ADD COLUMN distribution jsonb;
    INSERT INTO auth.users(id) SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,3) n;
    INSERT INTO public.user_profiles(id,role,permissions) VALUES
      ('10000000-0000-0000-0000-000000000001','admin','[]'),
      ('10000000-0000-0000-0000-000000000002','employee','["reports.view"]'),
      ('10000000-0000-0000-0000-000000000003','player','[]');
    INSERT INTO public.players(name,email,phone) SELECT 'Jugador '||n,'','' FROM generate_series(1,1205) n;
    INSERT INTO public.bookings(court_name,date,start_time,end_time,status) VALUES ('C',current_date,'10:00','11:30','completed');`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261117120000_player_booking_statistics.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261117130000_management_reports.sql",
      "utf8",
    ),
  );
  await db.exec(
    `SET row_security=on; GRANT USAGE ON SCHEMA auth TO authenticated; SET ROLE authenticated;`,
  );
  const run = () =>
    db.query(
      "SELECT public.management_report_data(current_date-29,current_date) AS data",
    );
  await assert.rejects(run(), /No tenés permiso/);
  for (const n of [1, 2]) {
    await db.query("SELECT set_config('test.uid',$1,false)", [
      `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    ]);
    const result = (await run()).rows[0].data;
    assert.equal(
      result.players.length,
      1205,
      "RPC must not truncate at the API row limit",
    );
    assert.equal(result.bookings.length, 1);
    await assert.rejects(
      db.query(
        "SELECT public.management_report_data('2026-01-01','2027-02-01')",
      ),
      /366/,
    );
    await assert.rejects(
      db.query(
        "SELECT public.management_report_data('2026-11-02','2026-11-01')",
      ),
      /válido/,
    );
  }
  await db.exec(
    "SELECT set_config('test.uid','10000000-0000-0000-0000-000000000003',false)",
  );
  await assert.rejects(run(), /No tenés permiso/);
  await db.exec(
    "RESET ROLE; UPDATE public.user_profiles SET permissions='[]' WHERE role='employee'; SET ROLE authenticated; SELECT set_config('test.uid','10000000-0000-0000-0000-000000000002',false)",
  );
  await assert.rejects(run(), /No tenés permiso/);
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(run(), /permission denied/);
  console.log(
    "PASS: PostgreSQL report RPC, complete datasets beyond 1000 rows, dates, admin/employee/player/anonymous authorization.",
  );
} finally {
  await db.close();
}
