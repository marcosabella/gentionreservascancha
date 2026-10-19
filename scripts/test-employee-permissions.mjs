import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { buildSync } from 'esbuild';

const config = JSON.parse(execFileSync('supabase', ['status', '--workdir', 'dev/pura-vida.local', '--output', 'json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','pipe'] }));
const url = config.API_URL;
assert(['http://127.0.0.1:56000', 'http://localhost:56000'].includes(url), 'Tests must use the isolated local database.');
const password = process.env.PURA_VIDA_BOOTSTRAP_PASSWORD;
assert(password, 'Supply the local administrator password in memory.');
const admin = createClient(url, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(url, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const compiled = buildSync({ entryPoints: ['supabase/functions/_shared/permissions.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const permissions = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
assert.deepEqual(permissions.normalizePermissions(['bookings.close','admin.all','bookings.close']), ['bookings.view','bookings.close']);
assert.equal(permissions.hasPermission({role:'employee',permissions:['bookings.view']},'bookings.close'), false);
assert.equal(permissions.hasPermission({role:'admin'},'sales.delete'), true);
assert.equal(permissions.hasPermission({role:'player'},'sales.delete'), false);

function hash(value) {
  const salt = randomBytes(16);
  return `pbkdf2_sha256$210000$${salt.toString('base64')}$${pbkdf2Sync(value,salt,210000,32,'sha256').toString('base64')}`;
}
async function ok(query, label) {
  const result = await query;
  assert.ifError(result.error && new Error(`${label}: ${result.error.message}`));
  return result.data;
}
async function denied(query, label) {
  const result = await query;
  assert(result.error || (Array.isArray(result.data) && result.data.length === 0), `${label}: forbidden operation succeeded`);
}
const run = randomUUID().slice(0,8);
const authIds = [], tableIds = { courts: [], players: [], consumables: [], bookings: [], sales: [], current_account_entries: [] };
async function user(username, role, selected = [], keep = false, playerId = null) {
  const { data: created, error } = await admin.auth.admin.createUser({ email: `${username}@local.app`, password, email_confirm: true, user_metadata: { username, normalized_username: username, role } });
  assert.ifError(error);
  const id = created.user.id;
  if (!keep) authIds.push(id);
  await ok(admin.from('user_profiles').insert({ id, username, role, player_id: playerId, permissions: permissions.normalizePermissions(selected), is_active: true, password_hash: hash(password) }), 'create profile');
  const client = anon();
  const { error: signInError } = await client.auth.signInWithPassword({ email: created.user.email, password });
  assert.ifError(signInError);
  return { id, client };
}
let bootstrap = await ok(admin.from('user_profiles').select('id').eq('username','puravida').maybeSingle(), 'find local admin');
if (!bootstrap) bootstrap = await user('puravida','admin',[],true);
const reports = [];
try {
  const court = await ok(admin.from('courts').insert({name:`Prueba ${run}`,description:'Prueba automatizada',price_per_turn:1000,features:[]}).select().single(), 'seed court');
  tableIds.courts.push(court.id);
  const player = await ok(admin.from('players').insert({name:`Jugador ${run}`,email:`${run}@example.invalid`,phone:'000'}).select().single(),'seed player');
  tableIds.players.push(player.id);
  const product = await ok(admin.from('consumables').insert({name:`Producto ${run}`,description:'Prueba',price:100,category:'other',available:true}).select().single(),'seed product');
  tableIds.consumables.push(product.id);
  const employee = await user(`empleado_${run}`,'employee');
  const actor = employee.client;
  const setPermissions = async selected => ok(admin.from('user_profiles').update({ permissions: permissions.normalizePermissions(selected) }).eq('id',employee.id),'update permissions');
  const bookingPayload = { courtId:court.id,courtName:court.name,date:'2030-01-10',startTime:'10:00',endTime:'11:30',totalPrice:1000,status:'confirmed',players:[{id:player.id,name:player.name,email:player.email,phone:player.phone,isOrganizer:true,paymentMethod:'current_account'}],consumptions:[] };
  const mutate = (resource,action,id,payload={}) => actor.rpc('employee_mutate',{resource,action,record_id:id,payload});
  assert.deepEqual(await ok(actor.from('courts').select('id'),'no-access courts'),[]);
  await denied(actor.from('players').insert({name:'Forbidden',email:'forbidden@example.invalid',phone:'0'}).select(),'deny ungranted create');
  await denied(actor.from('user_profiles').update({role:'admin'}).eq('id',employee.id).select('id'),'deny self promotion');
  await denied(mutate('bookings','create',null,bookingPayload),'deny no permissions');
  reports.push('employee defaults deny access and role escalation');

  await setPermissions(['bookings.create']);
  const bookingId = await ok(mutate('bookings','create',null,bookingPayload),'allowed booking create');
  tableIds.bookings.push(bookingId);
  assert.equal((await ok(admin.from('booking_players').select('id').eq('booking_id',bookingId),'booking children')).length,1);
  await denied(actor.from('bookings').update({status:'completed'}).eq('id',bookingId).select(),'deny direct status bypass');
  await denied(mutate('bookings','update',bookingId,{status:'cancelled'}),'create does not grant cancel');
  await denied(mutate('bookings','update',bookingId,{...bookingPayload,status:'completed',finalTotal:1000}),'create does not grant close');
  const badBooking = {...bookingPayload,startTime:'12:00',endTime:'13:30',players:[{...bookingPayload.players[0],id:randomUUID()}]};
  await denied(mutate('bookings','create',null,badBooking),'invalid child rolls back parent');
  const afterRollback = await ok(admin.from('bookings').select('id').eq('court_id',court.id),'rollback inventory');
  assert.equal(afterRollback.length,1);
  reports.push('booking create is atomic and does not grant cancel or close');

  await setPermissions(['bookings.edit']);
  await ok(mutate('bookings','update',bookingId,{...bookingPayload,totalPrice:1200}),'allowed booking edit');
  await denied(mutate('bookings','update',bookingId,{status:'cancelled'}),'edit does not grant cancellation');
  await denied(mutate('bookings','update',bookingId,{...bookingPayload,status:'completed'}),'edit does not grant close');
  await setPermissions(['bookings.close']);
  await denied(mutate('bookings','update',bookingId,{...bookingPayload,date:'2030-01-11',status:'completed'}),'closing cannot move booking');
  await ok(mutate('bookings','update',bookingId,{...bookingPayload,totalPrice:1200,status:'completed',finalTotal:1200,closedAt:new Date().toISOString()}),'allowed close');
  const charges = await ok(admin.from('current_account_entries').select('id,amount').eq('related_booking_id',bookingId),'automatic account charge');
  assert.equal(charges.length,1);
  assert.equal(Number(charges[0].amount),1200);
  assert.deepEqual(await ok(actor.from('current_account_entries').select('id'),'no accounts module access'),[]);
  reports.push('booking edit and closing are independent; closing generates account charges atomically');

  await setPermissions(['sales.create']);
  const sale = {date:'2030-01-10',time:'10:00',customerType:'registered',customer:{id:player.id,name:player.name},totalAmount:200,paymentMethod:'current_account',items:[{consumableId:product.id,name:product.name,price:100,quantity:2,subtotal:200}]};
  const saleId = await ok(mutate('sales','create',null,sale),'allowed sale');
  tableIds.sales.push(saleId);
  await denied(mutate('sales','delete',saleId),'sales create does not grant delete');
  assert.equal((await ok(admin.from('current_account_entries').select('amount').eq('related_sale_id',saleId),'sale charge')).length,1);
  await denied(mutate('sales','create',null,{...sale,items:[{...sale.items[0],consumableId:randomUUID()}]}),'bad sale rollback');
  assert.equal((await ok(admin.from('sales').select('id').eq('customer_id',player.id),'sale rollback inventory')).length,1);
  reports.push('sales and account side effects are atomic and action-scoped');

  await setPermissions(['accounts.pay']);
  const payment = {playerId:player.id,type:'credit',amount:100,description:'Prueba',date:'2030-01-10',time:'12:00',paymentMethod:'cash'};
  const entryId = await ok(mutate('accounts','create',null,payment),'allowed payment');
  tableIds.current_account_entries.push(entryId);
  await denied(mutate('accounts','create',null,{...payment,type:'debit'}),'payment cannot forge debit');
  await denied(mutate('accounts','delete',entryId),'payment cannot delete');
  await setPermissions([]);
  await denied(mutate('accounts','create',null,payment),'revoked permissions apply to existing token');
  reports.push('payments exclude debits/deletes and permission revocation is immediate on the server');

  for (const [module,table,row] of [
    ['players','players',{name:`CRUD ${run}`,email:`crud_${run}@example.invalid`,phone:'000'}],
    ['products','consumables',{name:`CRUD ${run}`,price:10,description:'Prueba',category:'other'}],
    ['courts','courts',{name:`CRUD ${run}`,description:'Prueba',price_per_turn:10,features:[]}],
    ['availability','court_unavailabilities',{court_id:court.id,court_name:court.name,title:'Prueba',reason:'other',date:'2030-02-01',start_time:'08:00',end_time:'09:30',is_recurring:false}],
    ['recurring','recurring_bookings',{player_id:player.id,player_name:player.name,court_id:court.id,court_name:court.name,day_of_week:4,start_time:'08:00',end_time:'09:30',is_active:true,skip_dates:[]}],
  ]) {
    await setPermissions([`${module}.create`]);
    const record=await ok(actor.from(table).insert(row).select().single(),`${module} create`);
    try {
      const changed=table==='players'?{name:'Editado'}:table==='consumables'?{price:20}:table==='courts'?{description:'Editado'}:table==='court_unavailabilities'?{title:'Editado'}:{player_name:'Editado'};
      await denied(actor.from(table).update(changed).eq('id',record.id).select(),`${module} create is not edit`);
      await denied(actor.from(table).delete().eq('id',record.id).select(),`${module} create is not delete`);
      await setPermissions([`${module}.edit`]);
      assert.equal((await ok(actor.from(table).update(changed).eq('id',record.id).select(),`${module} edit`)).length,1);
      await setPermissions([`${module}.delete`]);
      assert.equal((await ok(actor.from(table).delete().eq('id',record.id).select(),`${module} delete`)).length,1);
    } finally { await admin.from(table).delete().eq('id',record.id); }
  }
  await setPermissions(['tournaments.manage']);
  const tournament=await ok(actor.from('tournaments').insert({name:`Prueba ${run}`,is_active:false}).select().single(),'tournaments manage');
  try {
    await denied(actor.from('tournaments').delete().eq('id',tournament.id).select(),'tournament manage is not delete');
    await setPermissions(['tournaments.delete']);
    assert.equal((await ok(actor.from('tournaments').delete().eq('id',tournament.id).select(),'tournament delete')).length,1);
  } finally { await admin.from('tournaments').delete().eq('id',tournament.id); }
  reports.push('per-action CRUD enforcement verified for players, products, courts, availability, recurring bookings and tournaments');

  const regularPlayer = await user(`jugador_${run}`,'player',[],false,player.id);
  assert((await ok(regularPlayer.client.from('courts').select('id'),'legacy player court read')).some(item=>item.id===court.id));
  const adminActor = anon();
  const {data: adminAuthUsers}=await admin.auth.admin.listUsers();
  const adminIdentity=adminAuthUsers.users.find(item=>item.id===bootstrap.id);
  assert.ifError((await adminActor.auth.signInWithPassword({email:adminIdentity.email,password})).error);
  assert((await ok(adminActor.from('courts').select('id'),'legacy admin read')).some(item=>item.id===court.id));
  const adminSession=(await adminActor.auth.getSession()).data.session;
  const adminHeaders={apikey:config.ANON_KEY,Authorization:`Bearer ${adminSession.access_token}`,'Content-Type':'application/json'};
  const createdResponse=await fetch('http://127.0.0.1:56010/functions/v1/create-user',{method:'POST',headers:adminHeaders,body:JSON.stringify({username:`usuario_ui_${run}`,password,role:'employee',permissions:['sales.create','unknown.all']})});
  const createdBody=await createdResponse.json();
  assert.equal(createdResponse.status,200,`admin employee creation: ${createdBody.error??''}`);
  authIds.push(createdBody.user.id);
  const saved=await ok(admin.from('user_profiles').select('role,permissions,player_id').eq('id',createdBody.user.id).single(),'created employee profile');
  assert.equal(saved.role,'employee');assert.equal(saved.player_id,null);
  assert.deepEqual(saved.permissions,['sales.view','sales.create']);
  const changedResponse=await fetch('http://127.0.0.1:56010/functions/v1/update-user-role',{method:'POST',headers:adminHeaders,body:JSON.stringify({userId:createdBody.user.id,role:'employee',permissions:['accounts.pay']})});
  assert.equal(changedResponse.status,200,`employee permission update: ${await changedResponse.text()}`);
  const listed=await fetch('http://127.0.0.1:56010/functions/v1/get-all-users',{headers:adminHeaders});
  assert.equal(listed.status,200);
  const listedEmployee=(await listed.json()).users.find(item=>item.id===createdBody.user.id);
  assert.deepEqual(listedEmployee.permissions,['accounts.view','accounts.pay']);
  reports.push('admin API creates employees, normalizes permissions, saves permission edits and lists them correctly');
  const session=(await actor.auth.getSession()).data.session;
  const forbidden=await fetch('http://127.0.0.1:56010/functions/v1/create-user',{method:'POST',headers:{apikey:config.ANON_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({username:'forbidden',password,role:'admin'})});
  assert.equal(forbidden.status,403,'employee cannot manage accounts');
  const login=await fetch('http://127.0.0.1:56010/functions/v1/login',{method:'POST',headers:{Authorization:`Bearer ${config.ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({username:`empleado_${run}`,password})});
  assert.equal(login.status,200,'employee username login');
  assert.equal((await login.json()).user.role,'employee');
  reports.push('existing admin/player access and employee login preserved; account administration remains admin-only');
  console.log(JSON.stringify({passed:reports.length,cases:reports}));
} finally {
  // Clean only synthetic records from this invocation, using the isolated service key.
  for (const id of tableIds.bookings) await admin.from('current_account_entries').delete().eq('related_booking_id',id);
  for (const id of tableIds.sales) await admin.from('current_account_entries').delete().eq('related_sale_id',id);
  for (const table of ['current_account_entries','sales','bookings','consumables','players','courts']) {
    if(tableIds[table].length) await admin.from(table).delete().in('id',tableIds[table]);
  }
  for(const id of authIds) await admin.auth.admin.deleteUser(id);
}
