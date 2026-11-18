import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [mode, client] = process.argv.slice(2);
const projects = {
  "padel-center": "zcixnnzxxkylotbjudhk",
  "pura-vida": "qsvdpdifygmzdawxfyqv",
};
assert(
  ["apply", "verify"].includes(mode) && projects[client],
  "Expected apply|verify and padel-center|pura-vida",
);
const versions = [
  "20261117120000_player_booking_statistics",
  "20261117130000_management_reports",
];
mkdirSync("dev/release.local", { recursive: true });
function query(sql) {
  const path = `dev/release.local/${client}-reports-${mode}.sql`;
  writeFileSync(path, sql);
  const output = execFileSync("supabase", [
    "db",
    "query",
    "--linked",
    "--project-ref",
    projects[client],
    "--file",
    path,
    "--output",
    "json",
  ], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(
    output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1),
  ).rows;
}
try {
  if (mode === "apply") {
    let sql =
      "BEGIN; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='90s'; SELECT pg_advisory_xact_lock(17120000);\n";
    for (const name of versions) {
      const source = readFileSync(`supabase/migrations/${name}.sql`, "utf8");
      const version = name.slice(0, 14), label = name.slice(15);
      sql +=
        `DO $check$ BEGIN IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND name<>'${label}') THEN RAISE EXCEPTION 'Migration version conflict'; END IF; END $check$;\n`;
      sql += source.replace(/^\s*(BEGIN|COMMIT);[ \t]*\r?$/gm, "") + "\n";
      sql +=
        `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${label}',ARRAY[$report_source$${source}$report_source$]) ON CONFLICT(version) DO NOTHING;\n`;
    }
    sql += "COMMIT; SELECT 'committed' status;";
    query(sql);
  }
  const checks = query(`SELECT
    (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261117120000','20261117130000')) migrations,
    (SELECT count(*) FROM public.players) players,
    (SELECT count(*) FROM public.players WHERE total_bookings>0) players_with_bookings,
    (SELECT count(*) FROM public.players p WHERE p.total_bookings IS DISTINCT FROM (SELECT count(DISTINCT b.id)::int FROM public.bookings b JOIN public.booking_players bp ON bp.booking_id=b.id WHERE bp.player_id=p.id AND b.status<>'cancelled')
      OR p.last_booking IS DISTINCT FROM (SELECT max(b.date) FROM public.bookings b JOIN public.booking_players bp ON bp.booking_id=b.id WHERE bp.player_id=p.id AND b.status<>'cancelled')) incorrect_counters,
    to_regprocedure('public.management_report_data(date,date)')::text report_rpc,
    to_regprocedure('public.inventory_save_product(uuid,jsonb)')::text inventory_rpc,
    has_function_privilege('anon','public.management_report_data(date,date)','execute') anonymous_access;`)[
    0
  ];
  assert.equal(checks.migrations, 2);
  assert.equal(checks.incorrect_counters, 0);
  assert.equal(checks.anonymous_access, false);
  assert(checks.report_rpc);
  const sample = query(`BEGIN;
    SELECT set_config('request.jwt.claims',(SELECT json_build_object('sub',id,'role','authenticated')::text FROM public.user_profiles WHERE role='admin' AND is_active ORDER BY id LIMIT 1),true);
    SET LOCAL ROLE authenticated;
    WITH report AS (SELECT public.management_report_data(current_date-29,current_date) data)
    SELECT jsonb_array_length(data->'bookings') bookings_in_report,jsonb_array_length(data->'players') players_in_report FROM report;
    ROLLBACK;`).find((row) => "bookings_in_report" in row);
  assert(sample);
  assert.equal(sample.players_in_report, checks.players);
  const result = {
    client,
    project: projects[client],
    ...checks,
    ...sample,
    at: new Date().toISOString(),
  };
  mkdirSync("supabase/releases", { recursive: true });
  writeFileSync(
    `supabase/releases/${client}-reports-verification.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.stderr || error.message);
  process.exitCode = 1;
}
