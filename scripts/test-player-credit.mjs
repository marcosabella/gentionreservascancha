import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { buildSync } from 'esbuild';

const config=JSON.parse(execFileSync('supabase',['status','--workdir','dev/pura-vida.local','--output','json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
assert.equal(config.API_URL,'http://127.0.0.1:56000','Use only the isolated local database');
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const run=randomUUID().slice(0,8),password=randomUUID()+'aA1!',userIds=[],sales=[];
let player,court,booking,credit,session;
async function ok(query,label='query'){const r=await query;assert.ifError(r.error&&new Error(`${label}: ${r.error.message}`));return r.data;}
async function denied(query,label){const r=await query;assert(r.error||Array.isArray(r.data)&&r.data.length===0,`${label}: unexpectedly permitted`);}
async function user(role,permissions=[]){
  const username=`credit_${role}_${run}`;
  const {user}=await ok(service.auth.admin.createUser({email:`${username}@example.invalid`,password,email_confirm:true}));userIds.push(user.id);
  await ok(service.from('user_profiles').insert({id:user.id,username,role,permissions,is_active:true,password_hash:'unused-test'}));
  const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  await ok(client.auth.signInWithPassword({email:user.email,password}));return {id:user.id,client};
}
assert.equal((await ok(service.from('cash_sessions').select('id').is('closed_at',null).is('deleted_at',null))).length,0,'Close local cash before testing');
try{
  const admin=await user('admin'),employee=await user('employee',['players.view','players.create','players.edit']),regular=await user('player');
  player=await ok(admin.client.from('players').insert({name:`Credito ${run}`,email:`${run}@example.invalid`,phone:'0'}).select().single(),'create player');
  assert.equal(player.current_account_enabled,false,'New players default to disabled');
  await denied(employee.client.from('players').update({current_account_enabled:true}).eq('id',player.id).select(),'employee needs credit grant');
  await denied(regular.client.from('players').update({current_account_enabled:true}).eq('id',player.id).select(),'player cannot self-authorize');
  await ok(employee.client.from('players').update({phone:'1'}).eq('id',player.id).select(),'ordinary edit still works');
  const sale={type:'direct',date:'2030-01-01',time:'10:00',customer_type:'registered',customer_id:player.id,customer_name:player.name,total_amount:100,payment_method:'current_account'};
  await denied(admin.client.from('sales').insert(sale).select(),'disabled credit sale rejected in database');
  await denied(admin.client.from('sales').insert({...sale,customer_type:'guest',customer_id:null}).select(),'guest credit rejected');
  await denied(admin.client.from('current_account_entries').insert({player_id:player.id,type:'debit',amount:100,description:'Forbidden',date:'2030-01-01',time:'10:00'}).select(),'direct debt blocked');
  const token=(await admin.client.auth.getSession()).data.session.access_token;
  const response=await fetch('http://127.0.0.1:56010/functions/v1/update-user-role',{method:'POST',headers:{apikey:config.ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({userId:employee.id,role:'employee',permissions:['players.create','players.edit','players.credit']})});
  assert.equal(response.status,200,await response.text());
  assert((await ok(service.from('user_profiles').select('permissions').eq('id',employee.id).single())).permissions.includes('players.credit'),'user management retains the new permission');
  await ok(employee.client.from('players').update({current_account_enabled:true}).eq('id',player.id).select(),'employee with credit permission authorizes');
  const oldSale=await ok(admin.client.from('sales').insert(sale).select().single(),'enabled credit sale');sales.push(oldSale.id);
  court=await ok(service.from('courts').insert({name:`Credito ${run}`,description:'Prueba',price_per_turn:1000,features:[]}).select().single());
  booking=await ok(service.from('bookings').insert({court_id:court.id,court_name:court.name,date:'2030-03-01',start_time:'10:00',end_time:'11:30',total_price:1000,status:'confirmed'}).select().single());
  const payload={courtId:court.id,courtName:court.name,date:'2030-03-01',startTime:'10:00',endTime:'11:30',totalPrice:1000,finalTotal:1000,status:'completed',consumptions:[],players:[{id:player.id,name:player.name,email:player.email,phone:player.phone,isOrganizer:true,paymentMethod:'current_account',paymentSplits:[{method:'current_account',amount:1000}]}]};
  await ok(admin.client.from('players').update({current_account_enabled:false}).eq('id',player.id).select());
  await denied(admin.client.rpc('cash_save_booking',{target:booking.id,payload}),'disabled booking debt blocked atomically');
  assert.equal((await ok(service.from('bookings').select('status').eq('id',booking.id).single())).status,'confirmed');
  assert.equal((await ok(service.from('booking_players').select('id').eq('booking_id',booking.id))).length,0);
  await ok(admin.client.from('players').update({current_account_enabled:true}).eq('id',player.id).select());
  await ok(admin.client.rpc('cash_save_booking',{target:booking.id,payload}),'enabled booking credit');
  credit=await ok(admin.client.from('current_account_entries').insert({player_id:player.id,type:'debit',amount:1000,description:'Turno',date:'2030-03-01',time:'10:00',related_booking_id:booking.id}).select().single());
  await ok(employee.client.from('players').update({current_account_enabled:false}).eq('id',player.id).select(),'revoke credit');
  assert.equal(Number((await ok(service.from('current_account_entries').select('amount').eq('id',credit.id).single())).amount),1000,'debt preserved');
  await ok(admin.client.rpc('cash_save_booking',{target:booking.id,payload}),'historical booking with unchanged credit remains editable');
  await denied(admin.client.rpc('cash_save_booking',{target:booking.id,payload:{...payload,totalPrice:1200,finalTotal:1200,players:[{...payload.players[0],paymentSplits:[{method:'current_account',amount:1200}]}]}}),'historical credit cannot grow while disabled');
  await denied(admin.client.from('sales').update({total_amount:120}).eq('id',oldSale.id).select(),'existing sale cannot increase disabled debt');
  await ok(admin.client.from('sales').update({notes:'Historical note'}).eq('id',oldSale.id).select(),'historical sale remains editable');
  await denied(admin.client.from('current_account_entries').insert({player_id:player.id,type:'debit',amount:1,description:'Extra',date:'2030-03-01',time:'10:00',related_booking_id:booking.id}).select(),'cannot forge extra historical debit');
  session=await ok(admin.client.rpc('cash_command',{action:'open',payload:{amount:0,notes:`Credito prueba ${run}`}}));
  await ok(admin.client.from('current_account_entries').insert({player_id:player.id,type:'credit',amount:200,description:'Pago deuda previa',date:'2030-03-01',time:'12:00',payment_method:'cash'}),'disabled player may settle debt');
  await ok(service.from('user_profiles').update({permissions:['players.view','players.edit']}).eq('id',employee.id));
  await denied(employee.client.from('players').update({current_account_enabled:true}).eq('id',player.id).select(),'revocation applies on current token');
  const compiled=buildSync({entryPoints:['src/utils/playerCredit.ts'],bundle:true,write:false,format:'esm',platform:'node'});
  const utils=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  const original={...payload,id:booking.id,createdAt:'2030-03-01',players:payload.players};
  assert.equal(utils.playersWithUnauthorizedCredit(original,original,[{id:player.id,currentAccountEnabled:false}]).length,0);
  assert.equal(utils.playersWithUnauthorizedCredit({...original,totalPrice:1200,players:[{...payload.players[0],paymentSplits:[{method:'current_account',amount:1200}]}]},original,[{id:player.id,currentAccountEnabled:false}]).length,1);
  console.log('PASS: default disabled, per-player enable/revoke, employee permission, no self-authorization, sales/bookings/direct-debt enforcement, atomic rollback, historical debt/edit preservation, debt payments, live permission revocation and UI helpers.');
}finally{
  if(player) await ok(service.from('current_account_entries').delete().eq('player_id',player.id),'clean entries');
  if(sales.length) await ok(service.from('sales').delete().in('id',sales),'clean sales');
  if(booking) await ok(service.from('bookings').delete().eq('id',booking.id),'clean booking');
  if(session){await service.from('cash_movements').delete().eq('session_id',session);await service.from('cash_audit').delete().eq('session_id',session);await service.from('cash_sessions').delete().eq('id',session);}
  if(court)await service.from('courts').delete().eq('id',court.id);
  if(player)await service.from('players').delete().eq('id',player.id);
  for(const id of userIds){await service.from('user_profiles').delete().eq('id',id);await service.auth.admin.deleteUser(id);}
}
