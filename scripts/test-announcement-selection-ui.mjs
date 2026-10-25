import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

// Exercise the actual component event handlers with a small hook host; no DOM or network.
const players = [{id:'ana',name:'Ana Pérez',category:2,gender:'femenino',push_devices:1},{id:'jose',name:'José García',category:3,gender:'masculino',push_devices:0},{id:'luz',name:'Luz Díaz',category:2,gender:'femenino',push_devices:2}];
let frame;
const react = {
  useState(initial) { const owner=frame,index=owner.index++; if (!(index in owner.slots)) owner.slots[index]=typeof initial==='function'?initial():initial; return [owner.slots[index],value=>{owner.slots[index]=typeof value==='function'?value(owner.slots[index]):value;}]; },
  useRef(initial) { return this.useState({current:initial})[0]; },
  useEffect(callback,deps) { const owner=frame,index=owner.index++,previous=owner.slots[index]; if (!previous || deps.some((dep,i)=>dep!==previous[i])) {owner.slots[index]=deps;owner.effects.push(callback);} },
  useCallback(callback) { return callback; },
};
react.useRef = initial => react.useState({current:initial})[0];
const compiled=await build({stdin:{contents:"export {default as Settings} from './src/components/PlayerAnnouncementSettings'; export {default as Admin} from './src/components/AdminNotificationSettings'; export {default as Search} from './src/components/AnnouncementPlayerSearch'; export {default as History} from './src/components/AnnouncementHistory'; export {announcementStatus,deliveryDescription} from './src/utils/announcementStatus';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','lucide-react'],define:{'import.meta.env.VITE_SUPABASE_URL':'"https://example.invalid"'},plugins:[{name:'mock-db',setup(builder){builder.onResolve({filter:/\/lib\/supabase$/},()=>({path:'mock',namespace:'test'}));builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const supabase = globalThis.db'}));}}]});
const sent=[],require=createRequire(import.meta.url),module={exports:{}};
let fail=false;
const intervals=[];
const historyItem={id:'history-test',title:'Torneo enviado',body:'Mensaje completo',created_at:'2026-10-23T18:00:00Z',sender:'admin',players:2,devices:2,queued:2,sending:0,sent:0,failed:0,untracked:0,read_players:0};
runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,crypto:{randomUUID},window:{setInterval:callback=>{intervals.push(callback);return intervals.length;},clearInterval(){},addEventListener(){},removeEventListener(){}},document:{visibilityState:'visible',getElementById:()=>({focus(){}})},require:name=>name==='react'?react:require(name),db:{rpc:async(name,args)=>{
  if(name==='player_announcement_audience')return {data:players,error:null};
  if(name==='admin_player_announcement_history')return {data:[{...historyItem}],error:null};
  if(name==='admin_player_announcement_deliveries')return {data:[{id:'device-1',player_name:'Ana Pérez',state:'sent',attempts:2,last_status:201,finished_at:'2026-10-23T18:01:00Z'}],error:null};
  sent.push(args); return {data:{players:args.filters.player_ids.length,devices:1},error:fail?new Error('offline'):null};
}}});
function mount(Component,props={}) { const owner={slots:[],effects:[],index:0,tree:null}; owner.render=()=>{frame=owner;owner.index=0;owner.tree=Component(props);frame=null;return owner;}; return owner.render(); }
const nodes = tree => !tree || typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text = node => node==null || typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
const button = (host,label) => { const item=nodes(host.tree).find(n=>n.type==='button'&&text(n).includes(label));assert(item,`Missing button ${label}`);return item; };
const {Settings,Search}=module.exports;
const main=mount(Settings);
for(const effect of main.effects)effect();
await new Promise(resolve=>setTimeout(resolve,0)); main.render();
assert(button(main,'Enviar a 0').props.disabled);
button(main,'Buscar jugadores').props.onClick(); main.render();
const popupNode=nodes(main.tree).find(n=>n.type===Search);assert(popupNode);
const popup=mount(Search,popupNode.props);
const search=()=>nodes(popup.tree).find(n=>n.type==='input'&&n.props.type==='search');
search().props.onChange({target:{value:'garcia jose'}}); popup.render();
assert.equal(nodes(popup.tree).filter(n=>n.type==='input'&&n.props.type==='checkbox').length,1);
nodes(popup.tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}}); popup.render();
search().props.onChange({target:{value:'ana'}}); popup.render();
nodes(popup.tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});popup.render();
button(popup,'Agregar seleccionados (2)').props.onClick();main.render();
assert(text(main.tree).includes('Jugadores seleccionados (2)'));
button(main,'Agregar todos').props.onClick();main.render();button(main,'Agregar todos').props.onClick();main.render();
assert(text(main.tree).includes('Jugadores seleccionados (3)'));
nodes(main.tree).find(n=>n.props?.['aria-label']==='Quitar a Luz Díaz').props.onClick();main.render();
assert(text(main.tree).includes('Jugadores seleccionados (2)'));
nodes(main.tree).find(n=>n.type==='input'&&n.props.maxLength===100).props.onChange({target:{value:'Torneo'}});
nodes(main.tree).find(n=>n.type?.name==='AnnouncementEditor').props.onChange('**Inscripción abierta** 🎾');main.render();
fail=true;await nodes(main.tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});main.render();
fail=false;await nodes(main.tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});main.render();
assert.equal(sent.length,2);assert.equal(sent[0].request_id,sent[1].request_id);
assert.equal(Array.from(sent[1].filters.player_ids).join(','),'ana,jose');
assert.equal(sent[1].message,'**Inscripción abierta** 🎾');
button(main,'Vaciar grilla').props.onClick();main.render();assert(button(main,'Enviar a 0').props.disabled);
console.log('PASS: open modal, accent-insensitive search, selections across searches, append to grid, no duplicate rows, remove player, exact send recipients, idempotent retry and empty-grid send disabled.');
const {History,announcementStatus,deliveryDescription}=module.exports;
for(const [overrides,expected] of [[{},'En cola'],[{sending:1},'Procesando'],[{queued:0,sent:2},'Enviado'],[{queued:0,sent:1,failed:1},'Enviado parcialmente'],[{queued:0,failed:2},'Error de envío'],[{queued:0,untracked:2},'Sin registro completo'],[{queued:0,devices:0},'En bandeja (sin push)']]) assert.equal(announcementStatus({...historyItem,...overrides}),expected);
assert(deliveryDescription({state:'failed',last_status:410}).includes('volver a activarlas'));
assert(deliveryDescription({state:'queued',attempts:2}).includes('reintento'));
const history=mount(History,{version:0});
for(const effect of history.effects.splice(0))effect();
await new Promise(resolve=>setTimeout(resolve,0));history.render();
assert(text(history.tree).includes('Torneo enviado'));assert(text(history.tree).includes('En cola: 2'));
historyItem.queued=0;historyItem.sent=2;
await intervals[0]();await new Promise(resolve=>setTimeout(resolve,0));history.render();
assert(text(history.tree).includes('Enviados: 2'));
button(history,'Ver detalle').props.onClick();history.render();
for(const effect of history.effects.splice(0))effect();
await new Promise(resolve=>setTimeout(resolve,0));history.render();
assert(nodes(history.tree).some(n=>n.type?.name==='AnnouncementMessage' && n.props.body==='Mensaje completo'));assert(text(history.tree).includes('Ana Pérez'));assert(text(history.tree).includes('Aceptado por el servicio push.'));
console.log('PASS: every campaign status, provider errors, automatic history refresh and per-device detail without claiming device receipt.');
const admin=mount(module.exports.Admin);
const panel = id => nodes(admin.tree).find(n=>n.props?.id===`notification-panel-${id}`);
assert.equal(panel('send').props.hidden,false);assert.equal(panel('history').props.hidden,true);
assert.equal(nodes(panel('send')).some(n=>n.type===History),false);
button(admin,'Historial').props.onClick();admin.render();
assert.equal(panel('send').props.hidden,true);assert.equal(panel('history').props.hidden,false);
assert.equal(nodes(panel('history')).find(n=>n.type===History).props.active,true);
button(admin,'Historial').props.onKeyDown({key:'ArrowRight',preventDefault(){}});admin.render();
assert.equal(panel('reminders').props.hidden,false);
button(admin,'Configuración de recordatorios').props.onKeyDown({key:'ArrowRight',preventDefault(){}});admin.render();
assert.equal(panel('send').props.hidden,false);
const initialVersion=nodes(panel('history')).find(n=>n.type===History).props.version;
nodes(panel('send')).find(n=>n.type===Settings).props.onSent();admin.render();
assert.equal(nodes(panel('history')).find(n=>n.type===History).props.version,initialVersion+1);
console.log('PASS: history in its own tab, separate send/reminder panels, three-tab keyboard navigation and history invalidation after send.');
