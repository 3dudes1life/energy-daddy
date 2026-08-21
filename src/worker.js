const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const json = (data, status=200, extra={}) => new Response(JSON.stringify(data), {status, headers:{...JSON_HEADERS,...extra}});
const nowIso = () => new Date().toISOString();

function allowedOrigin(request, env){
  const origin=request.headers.get('origin');
  if(!origin) return null;
  const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}
function cors(request, env){
  const origin=allowedOrigin(request, env);
  return origin ? {'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-headers':'content-type,x-energy-key','access-control-allow-methods':'GET,POST,OPTIONS'} : {};
}
function isAuthorized(request, env){
  if(request.method==='GET') return true;
  if(!env.INGEST_KEY) return false;
  return request.headers.get('x-energy-key')===env.INGEST_KEY;
}
function iso15(dateInput){
  const d=new Date(dateInput); if(Number.isNaN(d.getTime())) throw new Error('invalid timestamp');
  d.setUTCMinutes(Math.floor(d.getUTCMinutes()/15)*15,0,0); return d.toISOString();
}
async function health(env){
  let d1=false, kv=false;
  try{ await env.ENERGY_DB.prepare('SELECT 1 AS ok').first(); d1=true; }catch{}
  try{ await env.ENERGY_STATE.put('health:last', nowIso(), {expirationTtl:3600}); kv=true; }catch{}
  return {ok:d1&&kv, service:'energy-daddy-api', version:'1.7.7', d1, kv, time:nowIso()};
}
async function latest(env){
  const raw=await env.ENERGY_STATE.get('latest:site','json');
  return raw||{status:'empty', message:'No live telemetry ingested yet.'};
}
async function sources(env){
  const {results=[]}=await env.ENERGY_DB.prepare(`SELECT id,provider,kind,scope,status,last_seen_at,metadata_json FROM sources ORDER BY provider,id`).all();
  const out=[];
  for(const r of results){
    const runtime=await env.ENERGY_STATE.get(`provider:${r.id}`,'json');
    out.push({...r,metadata:r.metadata_json?JSON.parse(r.metadata_json):{},runtime:runtime||null});
  }
  return out;
}
async function history(env,url){
  const start=url.searchParams.get('start'), end=url.searchParams.get('end'), metric=url.searchParams.get('metric'), source=url.searchParams.get('source');
  let sql='SELECT interval_start,interval_end,source_id,metric,energy_wh,power_avg_w,quality,scope,metadata_json FROM telemetry_15m WHERE 1=1'; const binds=[];
  if(start){sql+=' AND interval_start>=?';binds.push(new Date(start).toISOString())}
  if(end){sql+=' AND interval_start<?';binds.push(new Date(end).toISOString())}
  if(metric){sql+=' AND metric=?';binds.push(metric)}
  if(source){sql+=' AND source_id=?';binds.push(source)}
  sql+=' ORDER BY interval_start ASC LIMIT 5000';
  const {results=[]}=await env.ENERGY_DB.prepare(sql).bind(...binds).all(); return results;
}
async function live(env){
  const latestRows=(await env.ENERGY_DB.prepare(`
    SELECT t.interval_start,t.interval_end,t.source_id,t.metric,t.energy_wh,t.power_avg_w,t.quality,t.scope,t.metadata_json
    FROM telemetry_15m t
    JOIN (
      SELECT source_id,metric,scope,MAX(interval_start) AS max_start
      FROM telemetry_15m GROUP BY source_id,metric,scope
    ) x ON x.source_id=t.source_id AND x.metric=t.metric AND x.scope=t.scope AND x.max_start=t.interval_start
    ORDER BY t.source_id,t.metric
  `).all()).results||[];
  const src=await sources(env);
  const cron=await env.ENERGY_STATE.get('cron:last');
  return {ok:true,version:'1.7.7',generated_at:nowIso(),cron_last:cron||null,sources:src,latest:latestRows.map(r=>({...r,metadata:r.metadata_json?JSON.parse(r.metadata_json):{}}))};
}
async function events(env,url){
  const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||20)));
  const {results=[]}=await env.ENERGY_DB.prepare(`SELECT id,ts,type,severity,title,explanation,evidence_json,status FROM events ORDER BY ts DESC LIMIT ?`).bind(limit).all();
  return results.map(r=>({...r,evidence:r.evidence_json?JSON.parse(r.evidence_json):{}}));
}
async function ingestPoints(points,env){
  const stmts=[]; let latestPoint=null;
  for(const p of points){
    if(!p.source_id||!p.metric||p.t==null) continue;
    const start=iso15(p.t), end=new Date(new Date(start).getTime()+15*60*1000).toISOString();
    const energyWh=Number(p.energy_wh||0), powerW=p.power_avg_w==null?null:Number(p.power_avg_w);
    stmts.push(env.ENERGY_DB.prepare(`INSERT INTO telemetry_15m(interval_start,interval_end,source_id,metric,energy_wh,power_avg_w,quality,scope,metadata_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(interval_start,source_id,metric,scope) DO UPDATE SET interval_end=excluded.interval_end,energy_wh=excluded.energy_wh,power_avg_w=excluded.power_avg_w,quality=excluded.quality,metadata_json=excluded.metadata_json`).bind(start,end,p.source_id,p.metric,energyWh,powerW,p.quality||'measured',p.scope||'site',JSON.stringify(p.metadata||{})));
    latestPoint={...p,t:start};
  }
  if(stmts.length) await env.ENERGY_DB.batch(stmts);
  if(latestPoint) await env.ENERGY_STATE.put('latest:site',JSON.stringify({status:'ok',point:latestPoint,updated_at:nowIso()}));
  return stmts.length;
}
async function ingest(request,env){
  if(!isAuthorized(request,env)) return {error:'unauthorized',status:401};
  const body=await request.json(); const points=Array.isArray(body)?body:body.points;
  if(!Array.isArray(points)||!points.length) return {error:'points array required',status:400};
  if(points.length>2000) return {error:'max 2000 points per request',status:413};
  return {ok:true,accepted:await ingestPoints(points,env)};
}
async function recordEvent(env,event){
  await env.ENERGY_DB.prepare(`INSERT INTO events(ts,type,severity,title,explanation,evidence_json,status) VALUES(?,?,?,?,?,?,?)`).bind(event.ts||nowIso(),event.type||'observation',event.severity||'info',event.title||'Untitled',event.explanation||'',JSON.stringify(event.evidence||{}),event.status||'open').run();
}
async function providerRun(env,provider,status,points=0,message=''){
  try{await env.ENERGY_DB.prepare(`INSERT INTO provider_runs(provider,started_at,completed_at,status,points,message) VALUES(?,?,?,?,?,?)`).bind(provider,nowIso(),nowIso(),status,points,message).run()}catch{}
}
async function setProviderState(env,id,state){
  await env.ENERGY_STATE.put(`provider:${id}`,JSON.stringify({...state,updated_at:nowIso()}));
}



const ENPHASE_TOKEN_KEY='enphase:oauth';
const ENPHASE_SYSTEM_KEY='enphase:system';
const ENPHASE_LAST_POLL_KEY='enphase:last_poll';
const ENPHASE_OAUTH_STATE_PREFIX='enphase:oauth_state:';
const ENPHASE_REDIRECT='https://energy-daddy-api.energyplantdaddy.workers.dev/api/enphase/callback';
const ENPHASE_DEFAULT_REDIRECT='https://api.enphaseenergy.com/oauth/redirect_uri';
const ENPHASE_MANUAL_STATE_PREFIX='enphase:manual_state:';

function base64Basic(clientId,clientSecret){
  return `Basic ${btoa(`${String(clientId||'').trim()}:${String(clientSecret||'').trim()}`)}`;
}
function enphaseConfigured(env){
  return Boolean((env.ENPHASE_API_KEY||'').trim()&&(env.ENPHASE_CLIENT_ID||'').trim()&&(env.ENPHASE_CLIENT_SECRET||'').trim());
}
async function getEnphaseToken(env){ return await env.ENERGY_STATE.get(ENPHASE_TOKEN_KEY,'json'); }
async function storeEnphaseToken(env,token){
  const now=Date.now();
  const expiresIn=Math.max(60,Number(token.expires_in||86300));
  const record={...token,obtained_at:new Date(now).toISOString(),expires_at:new Date(now+expiresIn*1000).toISOString()};
  await env.ENERGY_STATE.put(ENPHASE_TOKEN_KEY,JSON.stringify(record));
  return record;
}
async function exchangeEnphaseCode(env,code,redirectUri=ENPHASE_REDIRECT){
  const q=new URLSearchParams({grant_type:'authorization_code',redirect_uri:redirectUri,code});
  const res=await fetch(`https://api.enphaseenergy.com/oauth/token?${q.toString()}`,{method:'POST',headers:{Authorization:base64Basic(env.ENPHASE_CLIENT_ID,env.ENPHASE_CLIENT_SECRET),Accept:'application/json'}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok||!body.access_token) throw new Error(`Enphase token exchange failed (${res.status}): ${body.message||body.error||'unknown error'}`);
  return storeEnphaseToken(env,body);
}
async function refreshEnphaseToken(env,token){
  if(!token?.refresh_token) throw new Error('No Enphase refresh token is stored. Reconnect Enphase.');
  const q=new URLSearchParams({grant_type:'refresh_token',refresh_token:token.refresh_token});
  const res=await fetch(`https://api.enphaseenergy.com/oauth/token?${q.toString()}`,{method:'POST',headers:{Authorization:base64Basic(env.ENPHASE_CLIENT_ID,env.ENPHASE_CLIENT_SECRET),Accept:'application/json'}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok||!body.access_token) throw new Error(`Enphase token refresh failed (${res.status}): ${body.message||body.error||'unknown error'}`);
  return storeEnphaseToken(env,body);
}
async function validEnphaseToken(env){
  let token=await getEnphaseToken(env);
  if(!token) return null;
  const expiresAt=new Date(token.expires_at||0).getTime();
  if(!expiresAt||expiresAt-Date.now()<10*60*1000) token=await refreshEnphaseToken(env,token);
  return token;
}
async function enphaseFetch(env,path,token){
  const apiKey=String(env.ENPHASE_API_KEY||'').trim();
  const accessToken=String(token?.access_token||'').trim();
  const sep=path.includes('?')?'&':'?';
  const url=`https://api.enphaseenergy.com${path}${sep}key=${encodeURIComponent(apiKey)}`;
  const res=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`Enphase API ${res.status}: ${body.message||body.error||'request failed'}`);
  return body;
}

async function sha256Short(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,12);
}
function edge(value,n=4){
  const v=String(value||'').trim();
  if(!v) return null;
  if(v.length<=n*2) return v;
  return `${v.slice(0,n)}…${v.slice(-n)}`;
}
async function probeEnphase(env,token,mode='query'){
  const apiKey=String(env.ENPHASE_API_KEY||'').trim();
  const accessToken=String(token?.access_token||'').trim();
  let url='https://api.enphaseenergy.com/api/v4/systems';
  const headers={Authorization:`Bearer ${accessToken}`,Accept:'application/json'};
  if(mode==='query') url+=`?key=${encodeURIComponent(apiKey)}`;
  if(mode==='header') headers['x-api-key']=apiKey;
  if(mode==='both') { url+=`?key=${encodeURIComponent(apiKey)}`; headers['x-api-key']=apiKey; }
  const res=await fetch(url,{headers});
  const text=await res.text();
  let body; try{ body=JSON.parse(text); }catch{ body={raw:text.slice(0,300)}; }
  return {mode,status:res.status,ok:res.ok,message:body?.message||body?.error||null,body:res.ok?{count:body?.count??null,systems:Array.isArray(body?.systems)?body.systems.map(x=>({system_id:x.system_id,name:x.name||x.public_name||null,status:x.status||null})).slice(0,5):null}:undefined};
}
async function enphaseDiagnostics(request,env){
  if(!isAuthorized(request,env)) return {error:'unauthorized',status:401};
  const token=await getEnphaseToken(env);
  const apiKey=String(env.ENPHASE_API_KEY||'').trim();
  const clientId=String(env.ENPHASE_CLIENT_ID||'').trim();
  const clientSecret=String(env.ENPHASE_CLIENT_SECRET||'').trim();
  const out={
    ok:true,
    configured:enphaseConfigured(env),
    system_id:String(env.ENPHASE_SYSTEM_ID||'').trim()||null,
    credentials:{
      client_id_hint:edge(clientId),client_id_len:clientId.length,client_id_sha256:clientId?await sha256Short(clientId):null,
      api_key_hint:edge(apiKey),api_key_len:apiKey.length,api_key_sha256:apiKey?await sha256Short(apiKey):null,
      client_secret_len:clientSecret.length,client_secret_sha256:clientSecret?await sha256Short(clientSecret):null
    },
    token:token?{present:true,token_type:token.token_type||null,scope:token.scope||null,enl_uid:token.enl_uid||null,enl_cid:token.enl_cid||null,app_type:token.app_type||null,obtained_at:token.obtained_at||null,expires_at:token.expires_at||null,access_token_sha256:token.access_token?await sha256Short(String(token.access_token).trim()):null}: {present:false}
  };
  if(token?.access_token){
    out.probes=[];
    for(const mode of ['query','header','both']){
      try{ out.probes.push(await probeEnphase(env,token,mode)); }
      catch(e){ out.probes.push({mode,ok:false,status:null,message:String(e?.message||e)}); }
    }
  }
  return out;
}
async function resetEnphase(request,env){
  if(!isAuthorized(request,env)) return {error:'unauthorized',status:401};
  await Promise.all([
    env.ENERGY_STATE.delete(ENPHASE_TOKEN_KEY),
    env.ENERGY_STATE.delete(ENPHASE_SYSTEM_KEY),
    env.ENERGY_STATE.delete(ENPHASE_LAST_POLL_KEY),
    env.ENERGY_STATE.delete('enphase:last_raw'),
    env.ENERGY_STATE.delete('provider:enphase-site')
  ]);
  await env.ENERGY_DB.prepare(`UPDATE sources SET status='planned',last_seen_at=NULL WHERE id='enphase-site'`).run();
  return {ok:true,status:'reset',message:'Enphase tokens/runtime cleared. App credentials in Cloudflare secrets were not changed.'};
}
async function discoverEnphaseSystem(env,token){
  const configured=(env.ENPHASE_SYSTEM_ID||'').trim();
  if(configured){
    const record={system_id:configured,name:'Configured Enphase System',timezone:null,status:'configured',system_count:1,discovered_at:nowIso(),source:'configured'};
    await env.ENERGY_STATE.put(ENPHASE_SYSTEM_KEY,JSON.stringify(record));
    await env.ENERGY_DB.prepare(`UPDATE sources SET status='connected',last_seen_at=? WHERE id='enphase-site'`).bind(nowIso()).run();
    return record;
  }
  const body=await enphaseFetch(env,'/api/v4/systems',token);
  const systems=body.systems||body.items||[];
  if(!Array.isArray(systems)||!systems.length) throw new Error('Enphase authorized successfully, but no systems were returned.');
  const chosen=systems[0];
  const record={system_id:String(chosen.system_id),name:chosen.name||chosen.public_name||'Enphase System',timezone:chosen.timezone||null,status:chosen.status||null,system_count:systems.length,discovered_at:nowIso(),source:'discovered'};
  await env.ENERGY_STATE.put(ENPHASE_SYSTEM_KEY,JSON.stringify(record));
  await env.ENERGY_DB.prepare(`UPDATE sources SET status='connected',last_seen_at=? WHERE id='enphase-site'`).bind(nowIso()).run();
  return record;
}
function findNumeric(obj, keys){
  if(!obj||typeof obj!=='object') return null;
  for(const k of keys){ if(Object.prototype.hasOwnProperty.call(obj,k)){const n=Number(obj[k]);if(Number.isFinite(n))return n;} }
  for(const v of Object.values(obj)){ if(v&&typeof v==='object'){const n=findNumeric(v,keys);if(Number.isFinite(n))return n;} }
  return null;
}

function flattenLeaves(value,path='',out=[]){
  if(value===null||value===undefined){ out.push({path,value:null,type:'null'}); return out; }
  if(Array.isArray(value)){
    if(!value.length) out.push({path,value:[],type:'array'});
    value.slice(0,20).forEach((v,i)=>flattenLeaves(v,`${path}[${i}]`,out));
    return out;
  }
  if(typeof value==='object'){
    const keys=Object.keys(value);
    if(!keys.length) out.push({path,value:{},type:'object'});
    keys.slice(0,100).forEach(k=>flattenLeaves(value[k],path?`${path}.${k}`:k,out));
    return out;
  }
  out.push({path,value,type:typeof value}); return out;
}
function safeTelemetryShape(body){
  const leaves=flattenLeaves(body).slice(0,250);
  return {
    top_level_keys:body&&typeof body==='object'&&!Array.isArray(body)?Object.keys(body):[],
    leaves:leaves.map(x=>({path:x.path,type:x.type,value:(typeof x.value==='string'&&x.value.length>120)?`${x.value.slice(0,117)}…`:x.value}))
  };
}
function latestPowerByHints(body,hints){
  const leaves=flattenLeaves(body);
  const candidates=[];
  for(const leaf of leaves){
    if(!/(^|\.)(power|watts|w|power_w)$/i.test(leaf.path)) continue;
    const n=Number(leaf.value); if(!Number.isFinite(n)) continue;
    const p=leaf.path.toLowerCase();
    const score=hints.reduce((acc,h)=>acc+(p.includes(h)?10:0),0) + (p.endsWith('.power')?2:0);
    if(score>0) candidates.push({value:n,path:leaf.path,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0]||null;
}
function mapEnphaseLatest(body){
  // Enphase latest_telemetry groups device classes and puts instantaneous watts in nested `power` fields.
  // We score leaf paths rather than assuming one historic payload spelling.
  const pv=latestPowerByHints(body,['pv','production','solar','micro']);
  const consumption=latestPowerByHints(body,['consumption','consume','load']);
  const battery=latestPowerByHints(body,['battery','encharge','storage']);
  return {pv,consumption,battery};
}
async function enphaseTelemetryShape(request,env){
  if(!isAuthorized(request,env)) return {error:'unauthorized',status:401};
  const token=await validEnphaseToken(env);
  if(!token) return {error:'not_authorized',status:401,message:'Enphase OAuth token is not stored.'};
  let system=await env.ENERGY_STATE.get(ENPHASE_SYSTEM_KEY,'json');
  if(!system) system=await discoverEnphaseSystem(env,token);
  const body=await enphaseFetch(env,`/api/v4/systems/${encodeURIComponent(system.system_id)}/latest_telemetry`,token);
  const mapped=mapEnphaseLatest(body);
  return {
    ok:true,
    system_id:system.system_id,
    mapped:{
      pv_power_w:mapped.pv?.value??null,pv_path:mapped.pv?.path??null,
      consumption_power_w:mapped.consumption?.value??null,consumption_path:mapped.consumption?.path??null,
      battery_power_w:mapped.battery?.value??null,battery_path:mapped.battery?.path??null
    },
    shape:safeTelemetryShape(body)
  };
}
async function pollEnphase(env,{force=false}={}){
  if(!enphaseConfigured(env)){
    const state={status:'awaiting_credentials',live:false,message:'Enphase app credentials are not configured in Cloudflare.'};
    await setProviderState(env,'enphase-site',state); return state;
  }
  let token;
  try{ token=await validEnphaseToken(env); }catch(err){
    const state={status:'auth_error',live:false,message:String(err?.message||err)};await setProviderState(env,'enphase-site',state);return state;
  }
  if(!token){ const state={status:'awaiting_authorization',live:false,message:'Credentials are loaded. Open /api/enphase/connect/manual once to authorize this home.'};await setProviderState(env,'enphase-site',state);return state; }
  let system=await env.ENERGY_STATE.get(ENPHASE_SYSTEM_KEY,'json');
  try{
    if(!system) system=await discoverEnphaseSystem(env,token);
    const lastPoll=await env.ENERGY_STATE.get(ENPHASE_LAST_POLL_KEY);
    if(!force&&lastPoll&&Date.now()-new Date(lastPoll).getTime()<55*60*1000){
      const state={status:'connected',live:true,last_seen_at:lastPoll,system_id:system.system_id,message:'Enphase connected. Hourly polling is intentionally capped to protect the free 1,000-hit/month Watt plan.'};
      await setProviderState(env,'enphase-site',state);return state;
    }
    const body=await enphaseFetch(env,`/api/v4/systems/${encodeURIComponent(system.system_id)}/latest_telemetry`,token);
    const mapped=mapEnphaseLatest(body);
    const pv=mapped.pv?.value??null;
    const consumption=mapped.consumption?.value??null;
    const captured=nowIso(); const pts=[];
    if(Number.isFinite(pv)) pts.push({source_id:'enphase-site',metric:'solar_production',t:captured,energy_wh:pv*0.25,power_avg_w:pv,scope:'array_b',quality:'provider_latest',metadata:{provider:'Enphase',system_id:system.system_id,provider_path:mapped.pv?.path||null,derivation:'latest PV power × 15 minutes; interval telemetry will backfill settlement-grade history'}});
    if(Number.isFinite(consumption)) pts.push({source_id:'enphase-site',metric:'site_consumption',t:captured,energy_wh:consumption*0.25,power_avg_w:consumption,scope:'site_meter',quality:'provider_latest',metadata:{provider:'Enphase',system_id:system.system_id,provider_path:mapped.consumption?.path||null,topology_note:'Consumption is evidence from Enphase CTs and remains topology-qualified until reconciled against SDG&E/Tesla.'}});
    const accepted=pts.length?await ingestPoints(pts,env):0;
    await env.ENERGY_STATE.put(ENPHASE_LAST_POLL_KEY,captured);
    await env.ENERGY_DB.prepare(`UPDATE sources SET status='live',last_seen_at=? WHERE id='enphase-site'`).bind(captured).run();
    const state={status:'live',live:true,last_seen_at:captured,system_id:system.system_id,pv_power_w:Number.isFinite(pv)?pv:null,consumption_power_w:Number.isFinite(consumption)?consumption:null,pv_path:mapped.pv?.path||null,consumption_path:mapped.consumption?.path||null,points:accepted,message:accepted?'Enphase latest telemetry poll succeeded and mapped provider fields.':'Enphase responded, but PV/consumption power still could not be mapped; use /api/enphase/telemetry-shape.'};
    await env.ENERGY_STATE.put('enphase:last_raw',JSON.stringify({captured_at:captured,body}));
    await setProviderState(env,'enphase-site',state);await providerRun(env,'Enphase',accepted?'ok':'mapping_needed',accepted,state.message);return state;
  }catch(err){
    const state={status:'error',live:false,message:String(err?.message||err)};await setProviderState(env,'enphase-site',state);await providerRun(env,'Enphase','error',0,state.message);await recordEvent(env,{type:'provider_error',severity:'warn',title:'Enphase poll failed',explanation:state.message,evidence:{provider:'Enphase'},status:'open'});return state;
  }
}
async function enphaseStatus(env){
  const token=await getEnphaseToken(env),system=await env.ENERGY_STATE.get(ENPHASE_SYSTEM_KEY,'json'),runtime=await env.ENERGY_STATE.get('provider:enphase-site','json');
  return {configured:enphaseConfigured(env),authorized:Boolean(token?.refresh_token),token_expires_at:token?.expires_at||null,system:system||null,runtime:runtime||null,connect_url:'/api/enphase/connect/manual'};
}
async function enphaseConnect(request,env){
  // 1.7.4: always route through the manual bridge. Enphase's oauth_login endpoint
  // has returned 406/blank-browser behavior in this homeowner flow, so the old
  // automatic callback path is intentionally disabled rather than retried.
  return Response.redirect('https://energy-daddy-api.energyplantdaddy.workers.dev/api/enphase/connect/manual',302);
}
async function enphaseCallback(request,env){
  const u=new URL(request.url),err=u.searchParams.get('error');
  if(err) return new Response(`<h1>Enphase connection cancelled</h1><p>${err}</p><p><a href="/">Back to Energy Daddy</a></p>`,{status:400,headers:{'content-type':'text/html; charset=utf-8'}});
  const code=u.searchParams.get('code'),state=u.searchParams.get('state');
  if(!code||!state) return new Response('<h1>Missing Enphase authorization code/state.</h1>',{status:400,headers:{'content-type':'text/html; charset=utf-8'}});
  const stateKey=`${ENPHASE_OAUTH_STATE_PREFIX}${state}`,valid=await env.ENERGY_STATE.get(stateKey);if(!valid)return new Response('<h1>Enphase authorization state expired or invalid.</h1><p>Start the connection again from Energy Daddy.</p>',{status:400,headers:{'content-type':'text/html; charset=utf-8'}});await env.ENERGY_STATE.delete(stateKey);
  try{
    const token=await exchangeEnphaseCode(env,code);const system=await discoverEnphaseSystem(env,token);const poll=await pollEnphase(env,{force:true});
    await recordEvent(env,{type:'provider_connected',severity:'info',title:'Enphase connected',explanation:`Energy Daddy authorized Enphase system ${system.name}.`,evidence:{provider:'Enphase',system_id:system.system_id},status:'closed'});
    return Response.redirect('https://energy-daddy-api.energyplantdaddy.workers.dev/?enphase=connected',302);
  }catch(e){
    await setProviderState(env,'enphase-site',{status:'auth_error',live:false,message:String(e?.message||e)});
    return new Response(`<h1>Enphase connection failed</h1><p>${String(e?.message||e)}</p><p><a href="/api/enphase/connect">Try again</a></p>`,{status:500,headers:{'content-type':'text/html; charset=utf-8'}});
  }
}


function htmlEscape(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function enphaseManualStart(env){
  if(!enphaseConfigured(env)) return json({error:'enphase_not_configured',message:'Set Enphase credentials first.'},503);
  const state=crypto.randomUUID();
  await env.ENERGY_STATE.put(`${ENPHASE_MANUAL_STATE_PREFIX}${state}`,nowIso(),{expirationTtl:1800});
  const u=new URL('https://api.enphaseenergy.com/oauth/authorize');
  u.searchParams.set('response_type','code');
  u.searchParams.set('client_id',env.ENPHASE_CLIENT_ID);
  u.searchParams.set('redirect_uri',ENPHASE_DEFAULT_REDIRECT);
  u.searchParams.set('state',state);
  const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Enphase</title><style>body{font-family:system-ui;background:#07131f;color:#eef7ff;max-width:760px;margin:0 auto;padding:28px}a,button{color:#07131f;background:#84f5b5;padding:12px 16px;border-radius:12px;text-decoration:none;border:0;font-weight:700}.card{background:#102232;padding:20px;border-radius:18px;margin:16px 0}input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #446078;background:#07131f;color:#fff}code{word-break:break-all}</style></head><body><h1>Connect Enphase</h1><div class="card"><p>Step 1: open Enphase authorization using its documented default redirect.</p><p><a href="${htmlEscape(u.toString())}" >Open Enphase authorization</a></p><p>This opens in the <strong>same tab</strong> — no popup is required. If Enphase approves, its final page/URL will contain <code>code=...</code> and <code>state=...</code>.</p><p><small>If the button is blocked, copy this authorization URL into a normal browser tab:</small></p><p><code>${htmlEscape(u.toString())}</code></p></div><div class="card"><p>Step 2: paste the <strong>entire final Enphase URL</strong> below. Energy Daddy will validate the state and exchange the code server-side.</p><form method="post" action="/api/enphase/manual/exchange"><input type="url" name="callback_url" required placeholder="https://api.enphaseenergy.com/oauth/redirect_uri?code=...&state=..."><p><button type="submit">Finish Enphase connection</button></p></form></div><p><a href="/">Back to Energy Daddy</a></p></body></html>`;
  return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
async function enphaseManualExchange(request,env){
  let callbackUrl='';
  const ct=request.headers.get('content-type')||'';
  if(ct.includes('application/json')) callbackUrl=(await request.json()).callback_url||'';
  else { const form=await request.formData(); callbackUrl=String(form.get('callback_url')||''); }
  let u; try{u=new URL(callbackUrl)}catch{return new Response('<h1>Invalid URL</h1><p>Paste the full Enphase redirect URL.</p>',{status:400,headers:{'content-type':'text/html; charset=utf-8'}})}
  const code=u.searchParams.get('code'),state=u.searchParams.get('state'),err=u.searchParams.get('error');
  if(err) return new Response(`<h1>Enphase declined access</h1><p>${htmlEscape(err)}</p>`,{status:400,headers:{'content-type':'text/html; charset=utf-8'}});
  if(!code||!state) return new Response('<h1>Missing code or state</h1><p>The pasted Enphase URL must contain both.</p>',{status:400,headers:{'content-type':'text/html; charset=utf-8'}});
  const stateKey=`${ENPHASE_MANUAL_STATE_PREFIX}${state}`;
  const valid=await env.ENERGY_STATE.get(stateKey);
  if(!valid) return new Response('<h1>Authorization state expired</h1><p>Start the manual connection again.</p>',{status:400,headers:{'content-type':'text/html; charset=utf-8'}});
  await env.ENERGY_STATE.delete(stateKey);
  try{
    const token=await exchangeEnphaseCode(env,code,ENPHASE_DEFAULT_REDIRECT);
    const system=await discoverEnphaseSystem(env,token);
    const poll=await pollEnphase(env,{force:true});
    await recordEvent(env,{type:'provider_connected',severity:'info',title:'Enphase connected',explanation:`Energy Daddy authorized Enphase system ${system.system_id}.`,evidence:{provider:'Enphase',system_id:system.system_id,method:'manual_default_redirect'},status:'closed'});
    return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enphase connected</title></head><body style="font-family:system-ui;padding:30px"><h1>Enphase connected ✅</h1><p>System ${htmlEscape(system.system_id)} is connected.</p><p>${htmlEscape(poll.message||'First poll completed.')}</p><p><a href="/">Open Energy Daddy</a></p></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  }catch(e){
    await setProviderState(env,'enphase-site',{status:'auth_error',live:false,message:String(e?.message||e)});
    return new Response(`<h1>Enphase connection failed</h1><p>${htmlEscape(String(e?.message||e))}</p><p><a href="/api/enphase/connect/manual">Try again</a></p>`,{status:500,headers:{'content-type':'text/html; charset=utf-8'}});
  }
}


async function enphaseCodeExchange(request,env){
  if(!isAuthorized(request,env)) return json({error:'unauthorized'},401);
  if(!enphaseConfigured(env)) return json({error:'enphase_not_configured',message:'Enphase credentials are not configured.'},503);
  let code='';
  try{
    const ct=request.headers.get('content-type')||'';
    if(ct.includes('application/json')) code=String((await request.json()).code||'').trim();
    else { const form=await request.formData(); code=String(form.get('code')||'').trim(); }
  }catch{}
  if(!code) return json({error:'missing_code',message:'Paste the Enphase authorization code.'},400);
  try{
    const token=await exchangeEnphaseCode(env,code,ENPHASE_DEFAULT_REDIRECT);
    const system=await discoverEnphaseSystem(env,token);
    const poll=await pollEnphase(env,{force:true});
    await recordEvent(env,{type:'provider_connected',severity:'info',title:'Enphase connected',explanation:`Energy Daddy authorized Enphase system ${system.system_id}.`,evidence:{provider:'Enphase',system_id:system.system_id,method:'manual_code'},status:'closed'});
    return json({ok:true,provider:'Enphase',system_id:system.system_id,status:'connected',poll});
  }catch(e){
    await setProviderState(env,'enphase-site',{status:'auth_error',live:false,message:String(e?.message||e)});
    return json({error:'enphase_exchange_failed',message:String(e?.message||e)},500);
  }
}

async function pollSolarEdge(env){
  const siteId=(env.SOLAREDGE_SITE_ID||'').trim();
  const apiKey=(env.SOLAREDGE_API_KEY||'').trim();
  if(!siteId||!apiKey){
    const state={status:'awaiting_credentials',live:false,message:'SolarEdge API key/site ID not configured. Build 1.5.1 will not guess or poll without them.'};
    await setProviderState(env,'solaredge-site',state);
    await providerRun(env,'SolarEdge','skipped',0,state.message);
    return state;
  }
  try{
    const endpoint=`https://monitoringapi.solaredge.com/site/${encodeURIComponent(siteId)}/overview?api_key=${encodeURIComponent(apiKey)}`;
    const res=await fetch(endpoint,{headers:{accept:'application/json'}});
    if(!res.ok) throw new Error(`SolarEdge HTTP ${res.status}`);
    const body=await res.json();
    const overview=body.overview||{};
    const power=Number(overview.currentPower?.power);
    if(!Number.isFinite(power)) throw new Error('SolarEdge response did not include currentPower.power');
    const captured=nowIso();
    const accepted=await ingestPoints([{source_id:'solaredge-site',metric:'solar_production',t:captured,energy_wh:power*0.25,power_avg_w:power,scope:'array_a',quality:'derived_live',metadata:{provider:'SolarEdge',provider_last_update:overview.lastUpdateTime||null,derivation:'current power × 15 minutes; use interval API later for settlement-grade history'}}],env);
    await env.ENERGY_DB.prepare(`UPDATE sources SET status='live',last_seen_at=? WHERE id='solaredge-site'`).bind(captured).run();
    const state={status:'live',live:true,last_seen_at:captured,power_w:power,points:accepted,message:'SolarEdge production poll succeeded.'};
    await setProviderState(env,'solaredge-site',state); await providerRun(env,'SolarEdge','ok',accepted,'current production');
    return state;
  }catch(err){
    const state={status:'error',live:false,message:String(err?.message||err)};
    await setProviderState(env,'solaredge-site',state); await providerRun(env,'SolarEdge','error',0,state.message);
    await recordEvent(env,{type:'provider_error',severity:'warn',title:'SolarEdge poll failed',explanation:state.message,evidence:{provider:'SolarEdge'},status:'open'});
    return state;
  }
}

async function runBrainCycle(env){
  const started=nowIso();
  await env.ENERGY_STATE.put('cron:last',started);
  const solar=await pollSolarEdge(env);
  const enphase=await pollEnphase(env);
  await setProviderState(env,'tesla-site',{status:'historical_only',live:false,message:'Tesla live polling intentionally disabled to avoid paid API use. Battery impact comes from periodic history imports.'});
  await setProviderState(env,'sdge-meter',{status:'reconciliation',live:false,message:'SDG&E is treated as delayed settlement/reconciliation evidence, not a real-time feed.'});
  await setProviderState(env,'emporia-ev',{status:'manual_or_bridge',live:false,message:'Emporia EV attribution is loaded from exports today; a local bridge can be added later without blocking SolarEdge live production.'});
  return {ok:true,started_at:started,solaredge:solar,enphase};
}

async function api(request,env){
  const url=new URL(request.url), path=url.pathname;
  const headers=cors(request,env);
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
  try{
    if(path==='/api/health') return json(await health(env),200,headers);
    if(path==='/api/latest') return json(await latest(env),200,headers);
    if(path==='/api/live') return json(await live(env),200,headers);
    if(path==='/api/sources') return json(await sources(env),200,headers);
    if(path==='/api/history') return json(await history(env,url),200,headers);
    if(path==='/api/events') return json(await events(env,url),200,headers);
    if(path==='/api/enphase/status') return json(await enphaseStatus(env),200,headers);
    if(path==='/api/enphase/diagnostics'&&request.method==='POST'){const r=await enphaseDiagnostics(request,env);return json(r,r.status||200,headers);}
    if(path==='/api/enphase/telemetry-shape'&&request.method==='POST'){const r=await enphaseTelemetryShape(request,env);return json(r,r.status||200,headers);}
    if(path==='/api/enphase/reset'&&request.method==='POST'){const r=await resetEnphase(request,env);return json(r,r.status||200,headers);}
    if(path==='/api/enphase/connect') return enphaseConnect(request,env);
    if(path==='/api/enphase/connect/manual') return enphaseManualStart(env);
    if(path==='/api/enphase/manual/exchange'&&request.method==='POST') return enphaseManualExchange(request,env);
    if(path==='/api/enphase/manual/code'&&request.method==='POST') return enphaseCodeExchange(request,env);
    if(path==='/api/enphase/callback') return enphaseCallback(request,env);
    if(path==='/api/enphase/poll'&&request.method==='POST'){ if(!isAuthorized(request,env)) return json({error:'unauthorized'},401,headers); return json(await pollEnphase(env,{force:true}),200,headers); }
    if(path==='/api/ingest'&&request.method==='POST'){const r=await ingest(request,env);return json(r,r.status||200,headers)}
    if(path==='/api/event'&&request.method==='POST'){
      if(!isAuthorized(request,env)) return json({error:'unauthorized'},401,headers);
      await recordEvent(env,await request.json()); return json({ok:true},201,headers);
    }
    if(path==='/api/brain/run'&&request.method==='POST'){
      if(!isAuthorized(request,env)) return json({error:'unauthorized'},401,headers);
      return json(await runBrainCycle(env),200,headers);
    }
    return json({error:'not found'},404,headers);
  }catch(err){return json({error:'server_error',message:String(err?.message||err)},500,headers)}
}

export default {
  async fetch(request, env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')) return api(request,env);
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env, ctx){
    ctx.waitUntil(runBrainCycle(env));
  }
};
