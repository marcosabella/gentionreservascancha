import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const compiled = await build({ stdin: { contents: "export {default as Settings} from './src/components/AdminNotificationSettings'; export {default as Search} from './src/components/AnnouncementPlayerSearch'; export {filterAnnouncementPlayers,searchAnnouncementPlayers} from './src/services/playerAnnouncementsService';", resolveDir: process.cwd(), loader:'tsx' },
  bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react-dom','lucide-react'],
  define:{'import.meta.env.VITE_SUPABASE_URL':'"https://example.invalid"'},
  plugins:[{name:'mock-db',setup(builder) {
    builder.onResolve({filter:/\/lib\/supabase$/},()=>({path:'db',namespace:'test'}));
    builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const supabase = {}'}));
  }}],
});
const module = {exports:{}};
runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url)});
const {Settings,Search,filterAnnouncementPlayers,searchAnnouncementPlayers} = module.exports;
const html = renderToStaticMarkup(React.createElement(Settings));
assert(html.includes('Envío de notificaciones')); assert(html.includes('Configuración de recordatorios'));
assert.match(html, /role="tab" id="notification-tab-send"[^>]*aria-selected="true"/);
assert.match(html, /role="tabpanel" id="notification-panel-reminders"[^>]*hidden/);
assert.match(html, /role="tab" id="notification-tab-history"[^>]*aria-selected="false"/);
assert.match(html, /role="tabpanel" id="notification-panel-history"[^>]*hidden/);
assert.equal((html.match(/role="tab"/g) || []).length,3);
for (const label of ['Categoría','Género','Jugador','Título','Mensaje']) assert(html.includes(label));
assert(html.includes('Buscar jugadores')); assert(html.includes('Agregar todos')); assert(html.includes('Vaciar grilla')); assert(html.includes('Jugadores seleccionados (0)'));
const players = [{id:'one',name:'Ana',category:2,gender:'femenino',push_devices:1},{id:'two',name:'Juan',category:2,gender:'masculino',push_devices:0},{id:'three',name:'Luz',category:3,gender:'femenino',push_devices:2},{id:'four',name:'Sin categoría',category:null,gender:null,push_devices:0}];
const filter = {category:null,gender:null,player_id:null};
const ids = overrides => Array.from(filterAnnouncementPlayers(players,{...filter,...overrides}),p=>p.id).join(',');
assert.equal(ids({}),'one,two,three,four'); assert.equal(ids({category:2}),'one,two');
assert.equal(ids({gender:'femenino'}),'one,three'); assert.equal(ids({category:2,gender:'femenino'}),'one');
assert.equal(ids({player_id:'three'}),'three'); assert.equal(ids({category:2,player_id:'three'}),'');
assert.equal(ids({player_ids:['one','three','one']}),'one,three'); assert.equal(ids({player_ids:[]}),'');
assert.equal(Array.from(searchAnnouncementPlayers([{...players[0],name:'José Pérez'}],' PEREZ jose '),p=>p.id).join(','),'one');
const searchHtml = renderToStaticMarkup(React.createElement(Search,{players,addedIds:['one'],onAdd:()=>{},onClose:()=>{}}));
assert(searchHtml.includes('Nombre del jugador')); assert(searchHtml.includes('Seleccionar resultados')); assert(searchHtml.includes('Agregar seleccionados (0)'));
assert.match(searchHtml,/type="checkbox" disabled=""[^>]*checked/);
console.log('PASS: separate notification/reminder tabs, accessible panels, form fields and matching frontend filters including unclassified players.');
