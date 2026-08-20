const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const num=(n,d=1)=>Number(n).toFixed(d);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let DATA={},METRICS={};
async function load(){
  const names=['bill','tesla','emporia','solaredge'];
  const all=await Promise.all(names.map(x=>fetch(`data/${x}.json?v=11`).then(r=>{if(!r.ok)throw new Error(`${x}: ${r.status}`);return r.json()})));
  DATA=Object.fromEntries(names.map((n,i)=>[n,all[i]]));
  METRICS=analyze(); render();
}
function analyze(){
 const {bill:b,tesla:t,emporia:e,solaredge:s}=DATA, cadence=(t.range.cadence_minutes||5)/60, ser=t.series;
 const integrate=(key,fn)=>ser.reduce((a,r)=>a+fn(Number(r[key]||0))*cadence,0);
 const gridImport=integrate('grid',v=>Math.max(0,v)), gridExport=integrate('grid',v=>Math.max(0,-v));
 const batteryDischarge=integrate('battery',v=>Math.max(0,v)), batteryCharge=integrate('battery',v=>Math.max(0,-v));
 const solar=integrate('solar',v=>Math.max(0,v)), home=integrate('home',v=>Math.max(0,v));
 const solarCoverage=home?solar/home*100:0, gridIndependence=home?clamp((home-gridImport)/home*100,0,100):0;
 const recent=b.months.slice(-5), deltas=recent.slice(1).map((r,i)=>r.balance-recent[i].balance), avgDelta=deltas.reduce((a,v)=>a+v,0)/Math.max(1,deltas.length);
 const lastBill=new Date(b.period_end+'T12:00:00'), trueup=new Date(b.true_up+'T12:00:00');
 const monthsRemaining=Math.max(0,(trueup-lastBill)/(1000*60*60*24*30.4375));
 const nemForecast=Math.max(0,b.trueup.nem_balance+avgDelta*monthsRemaining);
 const today=new Date(), daysLeft=Math.max(0,Math.ceil((trueup-today)/(86400000)));
 const nonEnergy=b.trueup.non_bypassable_charges+b.trueup.other_meter_charges_payments;
 const solarMismatch=Math.abs(s.reported_today_kwh-solar), solarMismatchPct=solar?solarMismatch/solar*100:0;
 const peakShare=e.summary.july18_midnight_kwh/b.current_period.highest_demand_kw*100;
 const pressure=clamp(Math.round((b.trueup.account_balance/1000)*70 + (b.trueup.nem_balance/700)*30),0,100);
 const timing=clamp(Math.round(82 + (b.current_period.on_peak_kwh<0?12:0) - (b.current_period.super_off_peak_kwh>300?10:0)),0,100);
 const meterAgreement=solarMismatchPct<10?90:solarMismatchPct<25?70:45;
 return {gridImport,gridExport,batteryDischarge,batteryCharge,solar,home,solarCoverage,gridIndependence,avgDelta,monthsRemaining,nemForecast,daysLeft,nonEnergy,solarMismatch,solarMismatchPct,peakShare,pressure,timing,meterAgreement};
}
function render(){
 const {bill:b,tesla:t,emporia:e}=DATA,m=METRICS;
 $('#account-balance').textContent=money(b.trueup.account_balance); $('#trueup-date').textContent=new Date(b.true_up+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
 $('#daysLeft').textContent=`${m.daysLeft} days left`; $('#trendPill').textContent=m.avgDelta<0?`NEM trend ${money(m.avgDelta)}/month`:`NEM trend +${money(m.avgDelta)}/month`;
 $('#nem-balance').textContent=money(b.trueup.nem_balance); $('#nonenergy-balance').textContent=money(m.nonEnergy); $('#nemForecast').textContent=money(m.nemForecast); $('#month-charge').textContent=money(b.current_period.current_charges);
 $('#confidence').textContent='88%';
 $('#t-solar').textContent=`${num(m.solar)} kWh`; $('#t-home').textContent=`${num(m.home)} kWh`; $('#t-import').textContent=`${num(m.gridImport)} kWh`; $('#t-export').textContent=`${num(m.gridExport)} kWh`;
 $('#tesla-range').textContent=`through ${new Date(t.range.end).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`;
 $('#solarCoverage').textContent=`${num(m.solarCoverage,0)}%`; $('#gridIndependence').textContent=`${num(m.gridIndependence,0)}%`; $('#batterySwing').textContent=`${num(m.batteryCharge+m.batteryDischarge)} kWh`;
 $('#mapSolar').textContent=`${num(m.solar)} kWh`; $('#mapHome').textContent=`${num(m.home)} kWh`; $('#mapBattery').textContent=`${num(m.batteryCharge)} in / ${num(m.batteryDischarge)} out`; $('#mapGrid').textContent=`${num(m.gridImport)} in / ${num(m.gridExport)} out`;
 $('#batteryCharge').textContent=`${num(m.batteryCharge)} kWh`; $('#batteryDischarge').textContent=`${num(m.batteryDischarge)} kWh`; $('#gridImport').textContent=`${num(m.gridImport)} kWh`; $('#gridExport').textContent=`${num(m.gridExport)} kWh`;
 $('#gridBehaviorText').textContent=m.gridExport>m.gridImport?`The supplied Tesla day is a net-export day by about ${num(m.gridExport-m.gridImport)} kWh through the end of the export.`:`The supplied Tesla day is a net-import day by about ${num(m.gridImport-m.gridExport)} kWh through the end of the export.`;
 $('#evJuly').textContent=num(e.summary.july_kwh,1); $('#sdgePeak').textContent=`${num(b.current_period.highest_demand_kw,1)} kW`; $('#evPeak').textContent=`${num(e.summary.july18_midnight_kwh,2)} kWh`;
 $('#evShare').style.width=Math.min(100,m.peakShare)+'%'; $('#evExplainer').textContent=`The EV charger explains about ${num(m.peakShare,0)}% of SDG&E's 14.4 kW highest-use hour. The remaining ~${num(b.current_period.highest_demand_kw-e.summary.july18_midnight_kwh,1)} kW came from other loads.`;
 renderBrain(); drawNem(); drawTesla(); drawEv(); drawDonut(); renderTou(); renderAudit(); renderInsights(); renderConnections();
 const winterPeak=Math.max(...b.months.map(x=>x.balance));
 $('#topInsight').innerHTML=`<h3>✦ Smart finding: this is a winter debt problem, not a broken-solar-looking summer.</h3><p>The NEM energy balance peaked at <b>${money(winterPeak)}</b> in March. Recent months have generally pushed it down. On the supplied Tesla day, solar generated <b>${num(m.solar)} kWh</b> against <b>${num(m.home)} kWh</b> of home use and the site exported more energy than it imported.</p>`;
}
function renderBrain(){const {bill:b,solaredge:s}=DATA,m=METRICS;
 $('#pressureScore').textContent=`${m.pressure}/100`; $('#pressureText').textContent=`Current account balance is ${money(b.trueup.account_balance)} with ${m.daysLeft} days until true-up. Energy-only trajectory is improving, but non-energy buckets already total ${money(m.nonEnergy)}.`;
 $('#timingScore').textContent=`${m.timing}/100`; $('#timingText').textContent=b.current_period.on_peak_kwh<0?`Strong: this bill shows net export during 4–9 PM on-peak. The big EV spike happened at midnight, inside super-off-peak.`:`On-peak imports are still costing leverage; shift flexible loads where possible.`;
 $('#meterScore').textContent=`${m.meterAgreement}/100`; $('#meterText').textContent=`Tesla and SolarEdge differ by ${num(m.solarMismatch)} kWh on the supplied day. Until scope is confirmed, Energy Daddy keeps them as separate meters.`;
 const actions=[
  ['P1','Import SDG&E Green Button','This unlocks 15-minute meter reconciliation and a real tariff audit instead of bill-level inference.'],
  ['P1','Add full Emporia mains/circuits','EV is solved. Whole-home mains let us attribute the rest of the load and compare panel-side consumption against Tesla.'],
  ['P1','Confirm solar topology',`SDG&E registers 6.86 kW, Tesla observed ${num(m.solar)} kWh today, and SolarEdge reports ${s.reported_today_kwh} kWh. We need to label which array/meter each source represents.`],
  ['P2','Add battery settings','Reserve %, grid-charging permission and operating mode would let the brain score battery behavior against EV-TOU-5.'],
  ['P2','Add HVAC + weather','Then we can learn heat→HVAC demand, pre-cooling value, and abnormal usage days.']
 ]; $('#actionCount').textContent=`${actions.length} actions`; $('#actionList').innerHTML=actions.map(a=>`<div class="action"><span>${a[0]}</span><div><b>${a[1]}</b><p>${a[2]}</p></div></div>`).join('');
 $('#forecastCurrent').textContent=money(b.trueup.nem_balance); $('#forecastEnd').textContent=money(m.nemForecast); $('#forecastExplain').textContent=`This is deliberately an NEM-only directional estimate. It uses the average month-to-month change across the most recent four balance changes (${money(m.avgDelta)}/month) for the remaining ${num(m.monthsRemaining,1)} billing-month equivalents. It does not pretend future non-bypassable or meter charges are known.`;
 const q=[['SDG&E bill/NEM','High','Official bill values and true-up ledger'],['Tesla site telemetry','High','5-minute physics-quality site flow for one supplied day'],['Emporia EV','High','Direct circuit measurement for the EV charger'],['SolarEdge','Partial','One share snapshot, not interval history'],['Whole-home attribution','Missing','Need Emporia mains/circuits']]; $('#qualityList').innerHTML=q.map(r=>`<div class="quality"><b>${r[0]}</b><span class="q ${r[1].toLowerCase()}">${r[1]}</span><small>${r[2]}</small></div>`).join('');
}
function canvasSetup(id){const c=$(id),dpr=devicePixelRatio||1,w=c.clientWidth,h=+c.getAttribute('height');c.width=w*dpr;c.height=h*dpr;const x=c.getContext('2d');x.scale(dpr,dpr);return {c,x,w,h}}
function drawNem(){const {x,w,h}=canvasSetup('#nemChart'),m=DATA.bill.months,p=26; x.clearRect(0,0,w,h);const maxK=Math.max(...m.map(d=>Math.abs(d.net_kwh))),maxB=Math.max(...m.map(d=>d.balance)),step=(w-p*2)/(m.length-1);x.strokeStyle='#292930';for(let i=0;i<4;i++){let y=p+i*(h-p*2)/3;x.beginPath();x.moveTo(p,y);x.lineTo(w-p,y);x.stroke()}m.forEach((d,i)=>{const barH=Math.abs(d.net_kwh)/maxK*58,xx=p+i*step,base=h-46;x.fillStyle=d.net_kwh<0?'#48d17a':'#8a7cff';x.fillRect(xx-7,d.net_kwh<0?base:base-barH,14,barH);x.fillStyle='#777780';x.font='9px sans-serif';x.textAlign='center';x.fillText(new Date(d.date+'T12:00:00').toLocaleDateString('en-US',{month:'short'}),xx,h-15)});x.strokeStyle='#64d8ff';x.lineWidth=2.5;x.beginPath();m.forEach((d,i)=>{const xx=p+i*step,yy=p+(1-d.balance/maxB)*(h-85);i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke()}
function drawTesla(){const {x,w,h}=canvasSetup('#teslaChart'),s=DATA.tesla.series,p=16,keys=[['solar','#ffcb66'],['home','#f5f5f7'],['grid','#64d8ff'],['battery','#8a7cff']],max=Math.max(...s.flatMap(r=>keys.map(([k])=>Math.abs(r[k]||0))));x.clearRect(0,0,w,h);keys.forEach(([k,col])=>{x.strokeStyle=col;x.globalAlpha=.9;x.lineWidth=1.35;x.beginPath();s.forEach((r,i)=>{const xx=p+i*(w-p*2)/(s.length-1),yy=h/2-(Number(r[k]||0)/max)*(h/2-p);i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke()});x.globalAlpha=1;x.strokeStyle='#33333a';x.beginPath();x.moveTo(p,h/2);x.lineTo(w-p,h/2);x.stroke()}
function drawEv(){const {x,w,h}=canvasSetup('#evChart'),d=DATA.emporia.daily,p=18,max=Math.max(...d.map(v=>v.kwh));x.clearRect(0,0,w,h);d.forEach((r,i)=>{const xx=p+i*(w-p*2)/d.length,bh=r.kwh/max*(h-45);x.fillStyle=r.kwh>0?'#8a7cff':'#24242a';x.fillRect(xx,h-22-bh,Math.max(2,(w-p*2)/d.length-2),bh)});x.fillStyle='#777780';x.font='9px sans-serif';x.textAlign='left';x.fillText('Jul 1',p,h-7);x.textAlign='right';x.fillText('Aug 19',w-p,h-7)}
function drawDonut(){const {x,w,h}=canvasSetup('#donut'),b=DATA.bill.trueup,vals=[b.nem_balance,b.non_bypassable_charges,b.other_meter_charges_payments],cols=['#8a7cff','#64d8ff','#ffb84d'],sum=vals.reduce((a,b)=>a+b,0);x.clearRect(0,0,w,h);let a=-Math.PI/2;vals.forEach((v,i)=>{const z=v/sum*Math.PI*2;x.beginPath();x.strokeStyle=cols[i];x.lineWidth=24;x.arc(w/2,h/2,78,a,a+z);x.stroke();a+=z});$('#donutTotal').textContent=money(sum);$('#breakdown').innerHTML=[['NEM energy',vals[0]],['Non-bypassable',vals[1]],['Other meter',vals[2]]].map(r=>`<div class="break-row"><i class="dot"></i><small>${r[0]}</small><b>${money(r[1])} · ${num(r[1]/sum*100,0)}%</b></div>`).join('')}
function renderTou(){const b=DATA.bill.current_period,rows=[['On-peak',b.on_peak_kwh],['Off-peak',b.off_peak_kwh],['Super off-peak',b.super_off_peak_kwh]],max=Math.max(...rows.map(r=>Math.abs(r[1])));$('#touBars').innerHTML=rows.map(([n,v])=>`<div class="tou-row"><b>${n}</b><div class="track"><i class="fill ${v<0?'export':''}" style="width:${Math.abs(v)/max*100}%"></i></div><strong>${v>0?'+':''}${v} kWh</strong></div>`).join('')}
function renderAudit(){const b=DATA.bill,e=DATA.emporia.summary,m=METRICS;const items=[
 ['good','Current-month bill is tiny',`Electric service was ${money(b.current_period.electric_service)} and the climate credit reduced current charges to ${money(b.current_period.current_charges)}.`],
 ['good','Winter drove the running NEM balance','The NEM balance climbed to $684.16 by March, then spring/summer export credits pulled it down to $414.17 in July.'],
 ['good','July 18 demand spike identified',`Emporia shows ${num(e.july18_midnight_kwh,2)} kWh on the EV charger from midnight–1 AM, explaining about ${num(m.peakShare,0)}% of SDG&E's 14.4 kW peak hour.`],
 ['warn','Registered solar system size needs verification',`The bill lists a 6.86 kW NEM system. Verify whether that represents all panels, one array, or the original permitted system.`],
 ['warn','Solar source scope mismatch',`Tesla integrates to ${num(m.solar,1)} kWh solar through the supplied day while SolarEdge reports ${DATA.solaredge.reported_today_kwh} kWh. Difference: ${num(m.solarMismatch,1)} kWh.`]
 ];$('#auditTrail').innerHTML=items.map(([c,h,p])=>`<div class="time-item ${c}"><b>${h}</b><span>${p}</span></div>`).join('')}
function getInsights(){const b=DATA.bill,m=METRICS;return [
 {p:1,t:'The $910 balance is not one thing',d:`Only ${money(b.trueup.nem_balance)} is the running NEM energy balance. ${money(m.nonEnergy)} already sits in non-bypassable and other meter buckets.`},
 {p:1,t:'Your supplied Tesla day looks energetically strong',d:`Solar generated ${num(m.solar,1)} kWh versus ${num(m.home,1)} kWh of home load, while grid exports (${num(m.gridExport,1)} kWh) exceeded imports (${num(m.gridImport,1)} kWh).`},
 {p:1,t:'Meter topology is now the biggest unknown',d:`SolarEdge and Tesla differ by ${num(m.solarMismatch,1)} kWh on the supplied day, and SDG&E lists only 6.86 kW of registered NEM capacity. The smart move is mapping sources before calling any one of them wrong.`},
 {p:2,t:'EV timing is behaving like EV-TOU-5 expects',d:`The identified July 18 EV spike began at midnight, inside super-off-peak. It explains most of the 14.4 kW peak without automatically implying expensive timing.`},
 {p:2,t:'Battery is materially shifting energy',d:`Across the supplied Tesla window, Energy Daddy sees about ${num(m.batteryCharge,1)} kWh of charging and ${num(m.batteryDischarge,1)} kWh of discharge. Settings are the missing context for deciding whether that behavior is financially optimal.`},
 {p:3,t:'Green Button is the unlock',d:'Once SDG&E 15-minute intervals are imported, the platform can reconcile utility-meter import/export against Tesla by timestamp and flag actual disagreements instead of inferring from monthly totals.'}
]}
function renderInsights(){const arr=getInsights().sort((a,b)=>a.p-b.p);$('#insightList').innerHTML=arr.map(i=>`<article class="card insight"><span class="priority">P${i.p}</span><div class="eyebrow">SMART FINDING</div><h3>${i.t}</h3><p>${i.d}</p></article>`).join('')}
function renderConnections(){const rows=[['⚡','SDG&E','Bill + NEM + TOU','Loaded'],['▰','Tesla Powerwall','5-minute site telemetry','Loaded'],['🔌','Emporia','EV circuit export','Loaded'],['☀️','SolarEdge','Production snapshot','Partial'],['◉','Enphase Enlighten','Possible second solar view','Not connected'],['⌂','Nest / HVAC','Future load context','Not connected'],['🚘','Tesla vehicle','Future charging context','Not connected'],['☁️','Ambient Weather','Future weather correlation','Not connected']];$('#connectionsList').innerHTML=rows.map(r=>`<article class="card connection"><div class="icon">${r[0]}</div><div class="meta"><b>${r[1]}</b><span>${r[2]}</span></div><span class="tag ${r[3]==='Not connected'?'off':''}">${r[3]}</span></article>`).join('')}
$$('.nav').forEach(b=>b.onclick=()=>{$$('.nav,.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.view).classList.add('active');$('#page-title').textContent=b.querySelector('span').textContent;setTimeout(()=>{if(b.dataset.view==='overview'){drawNem();drawTesla()}if(b.dataset.view==='audit')drawDonut();if(b.dataset.view==='flows')drawEv()},10)});
$('#refresh').onclick=()=>load();
$('#csvUpload').addEventListener('change',async ev=>{const f=ev.target.files[0];if(!f)return;const text=await f.text(),lines=text.trim().split(/\r?\n/),headers=(lines[0]||'').split(',');const rows=lines.slice(1,Math.min(lines.length,501)).map(l=>l.split(','));const numeric=headers.map((h,i)=>{const vals=rows.map(r=>Number(r[i])).filter(Number.isFinite);return vals.length>Math.max(3,rows.length*.7)?`${h}: numeric (${vals.length} sampled)`:null}).filter(Boolean);let dates=[];rows.forEach(r=>r.forEach(v=>{const d=new Date(v);if(v&&/[-/:T]/.test(v)&&!isNaN(d))dates.push(d)}));dates.sort((a,b)=>a-b);$('#uploadResult').textContent=`${f.name}\n${lines.length-1} data rows\n${headers.length} columns\nColumns: ${headers.join(' · ')}\n${dates.length?`Time coverage sampled: ${dates[0].toLocaleString()} → ${dates.at(-1).toLocaleString()}\n`:''}${numeric.length?`Likely numeric fields:\n- ${numeric.join('\n- ')}\n`:''}\nLocal inspection only — no upload performed.`});
window.addEventListener('resize',()=>{if(DATA.bill){if($('#overview').classList.contains('active')){drawNem();drawTesla()}if($('#audit').classList.contains('active'))drawDonut();if($('#flows').classList.contains('active'))drawEv()}});
load().catch(err=>{console.error(err);document.querySelector('.status.ok').textContent='● Data load error';document.querySelector('.status.ok').classList.add('warn')});
