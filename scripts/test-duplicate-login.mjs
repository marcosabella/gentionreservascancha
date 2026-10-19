import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, pbkdf2Sync } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { buildSync } from 'esbuild';

const config=JSON.parse(execFileSync('supabase',['status','--workdir','dev/pura-vida.local','--output','json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
assert.equal(config.API_URL,'http://127.0.0.1:56000');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options),ids=[];
const client=()=>createClient(config.API_URL,config.ANON_KEY,options);
const username='duplicate_'+randomUUID().slice(0,8),password=randomUUID()+'aA1!',otherPassword=randomUUID()+'bB2!';
let player;
async function ok(query,label='query'){const r=await query;assert.ifError(r.error&&new Error(`${label}: ${r.error.message}`));return r.data;}
const compiled=buildSync({entryPoints:['src/utils/sessionProfile.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {authUserFromProfile,InvalidProfileSession}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
try{
  const canonical=(await ok(service.auth.admin.createUser({email:username+'@example.invalid',password,email_confirm:true,user_metadata:{username,role:'admin'}}))).user;ids.push(canonical.id);
  const salt=randomBytes(16);const hash=`pbkdf2_sha256$210000$${salt.toString('base64')}$${pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64')}`;
  await ok(service.from('user_profiles').insert({id:canonical.id,username,role:'admin',is_active:true,password_hash:hash}));
  const orphan=(await ok(service.auth.admin.createUser({email:username+'_orphan@example.invalid',password:otherPassword,email_confirm:true,user_metadata:{username,normalized_username:username,profile_id:canonical.id,role:'admin'}}))).user;ids.push(orphan.id);
  player=await ok(service.from('players').insert({name:username,email:username+'@example.invalid',phone:'0'}).select('id').single());
  const orphanClient=client();await ok(orphanClient.auth.signInWithPassword({email:orphan.email,password:otherPassword}));
  const orphanProfile=await ok(orphanClient.from('user_profiles').select('id,username,role,is_active,player_id,permissions').eq('id',orphan.id).maybeSingle());
  assert.equal(orphanProfile,null);assert.deepEqual(await ok(orphanClient.from('players').select('id')),[],'orphan identity reproduces empty lists');
  assert.throws(()=>authUserFromProfile(orphan.id,orphanProfile),InvalidProfileSession,'UI must reject legacy identity, never show empty admin dashboard');
  const response=await fetch('http://127.0.0.1:56010/functions/v1/login',{method:'POST',headers:{Authorization:`Bearer ${config.ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  const body=await response.json();assert.equal(response.status,200,body.error);assert.equal(body.user.id,canonical.id);assert.equal(body.user.email,canonical.email,'login selects the profile-linked identity');
  const actor=client();const auth=await ok(actor.auth.signInWithPassword({email:body.user.email,password}));assert.equal(auth.user.id,canonical.id);
  const profile=await ok(actor.from('user_profiles').select('id,username,role,is_active,player_id,permissions').eq('id',auth.user.id).single());
  assert.equal(authUserFromProfile(auth.user.id,profile).role,'admin');
  assert((await ok(actor.from('players').select('id'))).some(row=>row.id===player.id),'correct identity loads business data');
  assert.throws(()=>authUserFromProfile(orphan.id,profile),InvalidProfileSession,'metadata cannot attach another identity to an admin profile');
  await ok(client().auth.signInWithPassword({email:orphan.email,password:otherPassword}),'orphan identity was not modified');
  console.log('PASS: reproduced empty lists with orphan Auth identity; login selects canonical ID; real Auth session loads profile and data; UI rejects orphan, inactive and mismatched identities.');
  assert.throws(()=>authUserFromProfile(profile.id,{...profile,is_active:false}),InvalidProfileSession);
}finally{
  if(player)await service.from('players').delete().eq('id',player.id);
  for(const id of ids){await service.from('user_profiles').delete().eq('id',id);await service.auth.admin.deleteUser(id);}
}
