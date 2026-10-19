import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { buildSync } from 'esbuild';

const config = JSON.parse(execFileSync('supabase', ['status','--workdir','dev/pura-vida.local','--output','json'], { encoding:'utf8', windowsHide:true, stdio:['ignore','pipe','pipe'] }));
assert(['http://127.0.0.1:56000','http://localhost:56000'].includes(config.API_URL), 'Only the isolated local database may be tested.');
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth:{ persistSession:false, autoRefreshToken:false } });
const run = randomUUID().slice(0,8), users = [], sessions = [], sources = { sales:[], bookings:[], current_account_entries:[] };
const password = randomUUID()+'aA1!';
async function ok(query, label='query') { const result=await query; assert.ifError(result.error && new Error(`${label}: ${result.error.message}`)); return result.data; }
async function denied(query,label) { const result=await query; assert(result.error || Array.isArray(result.data) && !result.data.length,`${label}: unexpectedly allowed`); return result.error; }
async function identity(role, permissions=[]) {
  const username=`cash_${role}_${run}`;
  const {user}=await ok(service.auth.admin.createUser({email:`${username}@example.invalid`,password,email_confirm:true}),'create identity'); users.push(user.id);
  await ok(service.from('user_profiles').insert({id:user.id,username,role,is_active:true,permissions,password_hash:'test-not-used'}),'profile');
  const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  await ok(client.auth.signInWithPassword({email:user.email,password}),'sign in'); return {client,id:user.id};
}
const openBefore=await ok(service.from('cash_sessions').select('id').is('closed_at',null).is('deleted_at',null));
assert.equal(openBefore.length,0,'Close the local cash register before running integration tests.');
let court, player, product, cashSaleId;
try {
  const admin=await identity('admin'), employee=await identity('employee',['cash.view']), playerUser=await identity('player');
  const token=(await admin.client.auth.getSession()).data.session.access_token;
  const apiResult=await fetch('http://127.0.0.1:56010/functions/v1/create-user',{method:'POST',headers:{apikey:config.ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({username:`cash_ui_${run}`,password,role:'employee',permissions:['cash.edit','cash.delete','cash.reopen','cash.unknown']})});
  const apiBody=await apiResult.json();
  assert.equal(apiResult.status,200,apiBody.error); users.push(apiBody.user.id);
  const savedPermissions=await ok(service.from('user_profiles').select('permissions').eq('id',apiBody.user.id).single());
  assert.deepEqual(savedPermissions.permissions,['cash.view','cash.edit','cash.delete','cash.reopen'],'server user management preserves new cash permissions');
  const command=(action,payload={},client=admin.client)=>client.rpc('cash_command',{action,payload});
  court=await ok(service.from('courts').insert({name:`Caja ${run}`,description:'Prueba',price_per_turn:1000,features:[]}).select().single());
  player=await ok(service.from('players').insert({name:`Caja ${run}`,email:`${run}@example.invalid`,phone:'000',current_account_enabled:true}).select().single());
  const saleData={type:'direct',date:'2030-01-01',time:'10:00',customer_type:'registered',customer_id:player.id,customer_name:player.name,total_amount:500,payment_method:'cash'};
  const missing=await denied(admin.client.from('sales').insert(saleData).select(),'payment requires opening');
  assert.match(missing.message,/Abrí la caja/);
  assert.equal((await ok(service.from('sales').select('id').eq('customer_id',player.id))).length,0,'Failed receipt rolls back sale');
  await denied(command('open',{amount:1000},employee.client),'view is not open');
  await denied(command('open',{amount:1000},playerUser.client),'player blocked');
  const first=await ok(command('open',{amount:1000,notes:`Prueba ${run}`}),'open'); sessions.push(first);
  await denied(command('open',{amount:1000}),'double opening');
  await denied(admin.client.from('cash_movements').insert({session_id:first,actor_name:'x',kind:'manual_in',method:'cash',amount:999,description:'forged'}),'direct ledger insertion');
  await denied(admin.client.from('cash_sessions').update({opening_amount:999}).eq('id',first).select(),'direct session editing');
  assert.equal((await ok(playerUser.client.from('cash_sessions').select('id'))).length,0);
  assert.equal((await ok(employee.client.from('cash_sessions').select('id'))).length,1);
  await denied(command('move',{sessionId:first,kind:'expense',amount:100,notes:'forbidden'},employee.client),'view is not move');
  const expense=await ok(command('move',{sessionId:first,kind:'expense',amount:300,notes:'Gasto de prueba'}));
  await ok(command('move',{sessionId:first,kind:'withdrawal',amount:200,notes:'Entrega parcial'}));
  await denied(command('move',{sessionId:first,kind:'expense',amount:900,notes:'Sin fondos'}),'no overdraft');
  await ok(command('reverse',{sessionId:first,movementId:expense,notes:'Gasto anulado'}));
  await denied(command('reverse',{sessionId:first,movementId:expense,notes:'Duplicado'}),'single reversal');
  product=await ok(service.from('consumables').insert({name:`Caja ${run}`,description:'Prueba',price:100,category:'other'}).select().single());
  const atomicSale={date:'2030-01-01',time:'10:00',customerType:'registered',customer:{id:player.id,name:player.name},paymentMethod:'cash',totalAmount:100,items:[{consumableId:product.id,name:product.name,price:100,quantity:1,subtotal:100}]};
  await denied(admin.client.rpc('cash_save_sale',{action:'create',payload:{...atomicSale,items:[{...atomicSale.items[0],name:null}]}}),'failed item rolls back sale and receipt');
  assert.equal((await ok(service.from('sales').select('id').eq('customer_id',player.id))).length,0);
  const atomicId=await ok(admin.client.rpc('cash_save_sale',{action:'create',payload:atomicSale}),'atomic admin sale'); sources.sales.push(atomicId);
  await ok(admin.client.rpc('cash_save_sale',{action:'update',target:atomicId,payload:{...atomicSale,totalAmount:200,items:[{...atomicSale.items[0],quantity:2,subtotal:200}]}}),'atomic sale edit');
  await ok(admin.client.rpc('cash_save_sale',{action:'delete',target:atomicId}),'atomic sale delete');
  assert.equal((await ok(service.from('cash_movements').select('amount').eq('source_id',atomicId))).reduce((sum,m)=>sum+Number(m.amount),0),0,'atomic sale cycle has zero net receipts');
  await denied(employee.client.rpc('cash_save_sale',{action:'create',payload:atomicSale}),'employee cannot use admin sale endpoint');
  for(const [method,total] of [['cash',500],['card',400],['transfer',600],['current_account',700]]) {
    const sale=await ok(admin.client.from('sales').insert({...saleData,payment_method:method,total_amount:total}).select('id').single(),'sale receipt'); sources.sales.push(sale.id); if(method==='cash') cashSaleId=sale.id;
  }
  const booking=await ok(service.from('bookings').insert({court_id:court.id,court_name:court.name,date:'2030-02-01',start_time:'12:00',end_time:'13:30',total_price:1000,status:'confirmed'}).select('id').single()); sources.bookings.push(booking.id);
  const payload={courtId:court.id,courtName:court.name,date:'2030-02-01',startTime:'12:00',endTime:'13:30',totalPrice:1000,finalTotal:1000,status:'completed',closedAt:new Date().toISOString(),consumptions:[],players:[{id:player.id,name:player.name,email:player.email,phone:player.phone,isOrganizer:true,paymentMethod:'cash',paymentSplits:[{method:'cash',amount:200},{method:'card',amount:300},{method:'current_account',amount:500}]}]};
  await ok(service.from('user_profiles').update({permissions:['cash.view','bookings.view','bookings.close']}).eq('id',employee.id));
  await ok(employee.client.rpc('employee_mutate',{resource:'bookings',action:'update',record_id:booking.id,payload}),'employee closing captured atomically');
  let bookingMoves=await ok(service.from('cash_movements').select('*').eq('source_id',booking.id));
  assert.equal(bookingMoves.length,2); assert.equal(Number(bookingMoves.find(m=>m.method==='cash').amount),200);
  await ok(admin.client.rpc('cash_save_booking',{target:booking.id,payload}),'idempotent booking save');
  assert.equal((await ok(service.from('cash_movements').select('id').eq('source_id',booking.id))).length,2);
  // Even if a stored synthetic booking sale exists, it is not a second receipt.
  const synthetic=await ok(service.from('sales').insert({...saleData,type:'booking',booking_id:booking.id}).select('id').single()); sources.sales.push(synthetic.id);
  assert.equal((await ok(service.from('cash_movements').select('id').eq('source_id',synthetic.id))).length,0);
  const credit=await ok(admin.client.from('current_account_entries').insert({player_id:player.id,type:'credit',amount:150,description:'Pago',date:'2030-02-01',time:'13:00',payment_method:'cash'}).select('id').single()); sources.current_account_entries.push(credit.id);
  const corrected=structuredClone(payload); corrected.players[0].paymentSplits[0].amount=250; corrected.players[0].paymentSplits[1].amount=250;
  await ok(admin.client.rpc('cash_save_booking',{target:booking.id,payload:corrected}),'booking correction');
  await ok(admin.client.from('sales').update({total_amount:700}).eq('id',cashSaleId),'sale correction');
  let entries=await ok(admin.client.from('cash_movements').select('*').eq('session_id',first));
  const expected=1000+entries.filter(m=>m.method==='cash').reduce((sum,m)=>sum+Number(m.amount),0); assert.equal(expected,1900);
  assert.equal(entries.filter(m=>m.method==='card').reduce((sum,m)=>sum+Number(m.amount),0),650);
  assert.equal(entries.filter(m=>m.method==='transfer').reduce((sum,m)=>sum+Number(m.amount),0),600);
  await denied(command('close',{sessionId:first,counted:1890,retained:500}),'difference needs explanation');
  await denied(command('close',{sessionId:first,counted:1890,retained:500,notes:'No autorizado'},employee.client),'view is not close');
  await ok(command('close',{sessionId:first,counted:1890,retained:500,notes:'Faltante de prueba'}));
  const closed=await ok(admin.client.from('cash_sessions').select('*').eq('id',first).single());
  assert.equal(Number(closed.expected_cash),1900); assert.equal(Number(closed.difference),-10); assert.equal(Number(closed.handed_over),1390);
  assert.equal((await ok(employee.client.from('cash_sessions').select('id'))).length,0,'history requires report permission');
  await denied(admin.client.from('sales').delete().eq('id',cashSaleId),'correction needs a new open session');
  assert.equal((await ok(service.from('sales').select('id').eq('id',cashSaleId))).length,1);
  const second=await ok(command('open',{amount:1000,notes:`Prueba ${run}`})); sessions.push(second);
  await ok(admin.client.from('sales').delete().eq('id',cashSaleId),'reversal in next shift');
  await ok(admin.client.from('current_account_entries').delete().eq('id',credit.id),'reverse account receipt');
  const next=await ok(admin.client.from('cash_movements').select('*').eq('session_id',second));
  assert.equal(next.filter(m=>m.method==='cash').reduce((sum,m)=>sum+Number(m.amount),0),-850);
  assert.equal((await ok(service.from('cash_movements').select('id').eq('session_id',first))).length,entries.length,'closed ledger unchanged');
  await denied(command('move',{sessionId:first,kind:'manual_in',amount:100,notes:'Stale view'}),'stale session rejected');
  await ok(service.from('user_profiles').update({permissions:['cash.view','cash.report']}).eq('id',employee.id));
  assert.equal((await ok(employee.client.from('cash_sessions').select('id'))).filter(s=>sessions.includes(s.id)).length,2);
  await ok(service.from('user_profiles').update({permissions:[]}).eq('id',employee.id));
  assert.equal((await ok(employee.client.from('cash_movements').select('id'))).length,0,'revocation takes effect on current token');
  await denied(employee.client.rpc('cash_command_basic',{action:'open',payload:{amount:1}}),'internal command cannot bypass permissions');
  await denied(command('edit',{sessionId:first,amount:1100,notes:'No autorizado'},employee.client),'edit permission required');
  await ok(service.from('user_profiles').update({permissions:['cash.view','cash.edit']}).eq('id',employee.id));
  await ok(command('edit',{sessionId:first,amount:1100,openingNotes:'Fondo corregido',notes:'Corrección de prueba'},employee.client),'employee may edit with grant');
  const edited=await ok(admin.client.from('cash_sessions').select('*').eq('id',first).single());
  assert.equal(Number(edited.expected_cash),2000); assert.equal(Number(edited.difference),-110); assert.equal(Number(edited.counted_cash),1890);
  assert.equal((await ok(employee.client.from('cash_audit').select('id'))).length,0,'edit permission does not expose audit reports');
  await denied(command('delete',{sessionId:first,notes:'No autorizado'},employee.client),'edit is not delete');
  await denied(command('reopen',{sessionId:first,notes:'No autorizado'},employee.client),'edit is not reopen');
  await ok(service.from('user_profiles').update({permissions:['cash.view','cash.reopen']}).eq('id',employee.id));
  await denied(command('reopen',{sessionId:first,notes:'Otra caja abierta'},employee.client),'only one open register on reopening');
  await ok(command('close',{sessionId:second,counted:150,retained:0}));
  await ok(command('reopen',{sessionId:first,notes:'Revisar arqueo'},employee.client),'employee reopens with permission');
  assert.equal((await ok(admin.client.from('cash_sessions').select('*').eq('id',first).single())).closed_at,null);
  await ok(command('move',{sessionId:first,kind:'manual_in',amount:50,notes:'Ingreso posterior a reapertura'}));
  await ok(command('close',{sessionId:first,counted:2050,retained:500,notes:'Segundo cierre'}));
  await ok(service.from('user_profiles').update({permissions:['cash.view','cash.delete']}).eq('id',employee.id));
  await denied(command('delete',{sessionId:first},employee.client),'deletion requires a reason');
  await ok(command('delete',{sessionId:first,notes:'Caja de prueba eliminada'},employee.client),'employee deletes with permission');
  assert((await ok(admin.client.from('cash_sessions').select('*').eq('id',first).single())).deleted_at);
  assert((await ok(admin.client.from('cash_movements').select('id').eq('session_id',first))).length>0,'logical deletion preserves ledger');
  await denied(command('edit',{sessionId:first,amount:1,notes:'Eliminada'}),'cannot edit deleted register');
  await ok(command('reopen',{sessionId:first,notes:'Restauración de prueba'}),'administrator has full restore access');
  const audits=await ok(admin.client.from('cash_audit').select('*').eq('session_id',first));
  assert(audits.some(a=>a.action==='edit' && Number(a.before_data.opening_amount)===1000 && Number(a.after_data.opening_amount)===1100));
  assert(audits.some(a=>a.action==='reopen' && a.before_data.closed_at && !a.after_data.closed_at),'previous closing retained in audit');
  assert(audits.some(a=>a.action==='delete' && a.reason==='Caja de prueba eliminada'));
  const compiled=buildSync({entryPoints:['src/utils/cash.ts'],bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env.VITE_COMPLEX_NAME':'"PURA VIDA"'}});
  const utils=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  assert.equal(utils.cashTotals(closed,entries).expected,1900);
  const hostile={...entries[0],description:'<script>alert(1)</script>',actor_name:'=SUM(A1:A5)'};
  assert(!utils.cashReportHtml(closed,[hostile]).includes('<script>'));
  assert(utils.cashCsv(closed,[hostile]).includes("'=SUM"));
  console.log('PASS: opening, permissions, cash movements, atomic split receipts, no duplicate bookings, account payments, corrections, closing/differences, revocation, edit/delete/reopen with independent permissions, complete audit, CSV and printable report.');
} finally {
  // Local synthetic fixtures only. Keep a test session open during source cleanup
  // so deferred receipt reversals can be recorded, then remove their test ledger.
  if(sessions.length) {
    const current=await service.from('cash_sessions').select('id').is('closed_at',null).is('deleted_at',null);
    if(!current.data?.length) await service.from('cash_sessions').update({closed_at:null,counted_cash:null}).eq('id',sessions.at(-1));
    if(sources.bookings.length) await ok(service.from('current_account_entries').delete().in('related_booking_id',sources.bookings),'clean booking debits');
    if(sources.sales.length) await ok(service.from('current_account_entries').delete().in('related_sale_id',sources.sales),'clean sale debits');
    for(const table of ['sales','current_account_entries','bookings']) if(sources[table].length) await ok(service.from(table).delete().in('id',sources[table]),`clean ${table}`);
    await ok(service.from('cash_movements').update({reversal_of:null}).in('session_id',sessions),'unlink test reversals');
    await ok(service.from('cash_movements').delete().in('session_id',sessions),'clean ledger');
    await ok(service.from('cash_audit').delete().in('session_id',sessions),'clean audit');
    await ok(service.from('cash_sessions').delete().in('id',sessions),'clean sessions');
  }
  for(const [table,kind] of [['sales','sale'],['bookings','booking'],['current_account_entries','account']]) if(sources[table].length) await service.from('cash_source_balances').delete().eq('source_type',kind).in('source_id',sources[table]);
  if(court) await service.from('courts').delete().eq('id',court.id);
  if(player) await service.from('players').delete().eq('id',player.id);
  if(product) await service.from('consumables').delete().eq('id',product.id);
  for(const id of users) { await service.from('user_profiles').delete().eq('id',id); await service.auth.admin.deleteUser(id); }
}
