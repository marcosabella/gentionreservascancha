import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';

const directory = resolve('dev/pura-vida.local/supabase');
mkdirSync(join(directory, 'migrations'), { recursive: true });
let config = readFileSync('supabase/config.toml', 'utf8')
  .replace('project_id = "project"', 'project_id = "pura-vida-dev"')
  .replaceAll('5500', '5600').replaceAll('5543', '5643')
  .replace('inspector_port = 8083', 'inspector_port = 8183')
  .replace('[realtime]\nenabled = true', '[realtime]\nenabled = false')
  .replace('[storage]\nenabled = true', '[storage]\nenabled = false')
  .replace('[analytics]\nenabled = true', '[analytics]\nenabled = false')
  .replace(/\[db.seed\][\s\S]*?(?=\n\[)/, '[db.seed]\nenabled = false\nsql_paths = []\n')
  .replace('site_url = "http://127.0.0.1:3000"', 'site_url = "http://localhost:5173"');
writeFileSync(join(directory, 'config.toml'), config);
for (const [source, target] of [
  ['pura-vida-schema.sql', '20261019000000_application_baseline.sql'],
  ['pura-vida-fix-profile-policies.sql', '20261019000001_profile_policies.sql'],
  ['pura-vida-publication-access.sql', '20261019000002_application_access.sql'],
]) copyFileSync(join('supabase', source), join(directory, 'migrations', target));
for (const migration of ['20261019120000_employee_permissions.sql', '20261019160000_cash_management.sql', '20261019170000_cash_management_controls.sql', '20261019180000_cash_sales_atomic.sql', '20261019190000_player_current_account.sql', '20261019200000_secure_user_profiles.sql']) {
  if (existsSync(join('supabase/migrations', migration))) {
    copyFileSync(join('supabase/migrations', migration), join(directory, 'migrations', migration));
  }
}
if (!existsSync(join(directory, 'functions'))) symlinkSync(resolve('supabase/functions'), join(directory, 'functions'), 'junction');
console.log('Prepared isolated local Pura Vida environment (API 56000 / DB 56432).');
