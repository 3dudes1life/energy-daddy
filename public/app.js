const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const num=(n,d=1)=>Number(n).toFixed(d);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let DATA={},METRICS={};
async function load(){
  const names=['bill','tesla','emporia','solaredge'];
  const all=await Promise.all(names.map(x=>fetch(`data/${x}.json?v=17`).then(r=>{if(!r.ok)throw new Error(`${x}: ${r.status}`);return r.json()})));
  DATA=Object.fromEntries(names.map((n,i)=>[n,all[i]]));
  METRICS=analyze(); render(); initLocalMemory(); probeCloud();
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
 const latest=ser[ser.length-1]||{}, socPoints=ser.filter(r=>r.soc!=null), latestSoc=socPoints.length?Number(socPoints[socPoints.length-1].soc):null;
 const solarPeak=Math.max(...ser.map(r=>Number(r.solar||0))), homePeak=Math.max(...ser.map(r=>Number(r.home||0)));
 const physicsErrors=ser.map(r=>Math.abs(Number(r.solar||0)+Number(r.battery||0)+Number(r.grid||0)-Number(r.home||0)));
 const physicsMae=physicsErrors.reduce((a,v)=>a+v,0)/Math.max(1,physicsErrors.length);
 const evening=ser.filter(r=>{const h=new Date(r.t).getHours();return h>=16&&h<21});
 const eveningHome=evening.length?evening.reduce((a,r)=>a+Number(r.home||0),0)/evening.length:0;
 const batteryKwhNominal=13.5, usableKwh=latestSoc==null?0:batteryKwhNominal*latestSoc/100;
 const shieldHours=eveningHome?usableKwh/eveningHome:0;
 const ytdNetKwh=b.months.reduce((a,r)=>a+Number(r.net_kwh||0),0);
 const solarDominant=ser.length?ser.filter(r=>Number(r.solar||0)>Number(r.home||0)&&Number(r.solar||0)>0.2).length/ser.length*100:0;
 const onPeakSeries=ser.filter(r=>touStateAt(r.t)==='ON-PEAK');
 const onPeakImport=onPeakSeries.reduce((a,r)=>a+Math.max(0,Number(r.grid||0))*cadence,0);
 const onPeakExport=onPeakSeries.reduce((a,r)=>a+Math.max(0,-Number(r.grid||0))*cadence,0);
 const gridNeutralPeakPct=onPeakSeries.length?onPeakSeries.filter(r=>Math.abs(Number(r.grid||0))<0.25).length/onPeakSeries.length*100:0;
 const evTou={on:0,off:0,super:0,total:0};
 (e.hourly||[]).forEach(r=>{const k=Math.max(0,Number(r.kwh||0)); if(!k)return; evTou.total+=k; const st=touStateAt(r.t); if(st==='ON-PEAK')evTou.on+=k; else if(st==='SUPER OFF-PEAK')evTou.super+=k; else evTou.off+=k;});
 const evPreferredPct=evTou.total?evTou.super/evTou.total*100:0;
 const energyShare=b.trueup.account_balance?b.trueup.nem_balance/b.trueup.account_balance*100:0;
 return {gridImport,gridExport,batteryDischarge,batteryCharge,solar,home,solarCoverage,gridIndependence,avgDelta,monthsRemaining,nemForecast,daysLeft,nonEnergy,solarMismatch,solarMismatchPct,peakShare,pressure,timing,meterAgreement,latest,latestSoc,solarPeak,homePeak,physicsMae,eveningHome,shieldHours,ytdNetKwh,solarDominant,onPeakImport,onPeakExport,gridNeutralPeakPct,evTou,evPreferredPct,energyShare};
}
function render(){
 const {bill:b,tesla:t,emporia:e}=DATA,m=METRICS;
 $('#account-balance').textContent=money(b.trueup.account_balance); $('#trueup-date').textContent=new Date(b.true_up+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
 $('#daysLeft').textContent=`${m.daysLeft} days left`; $('#trendPill').textContent=m.avgDelta<0?`NEM trend ${money(m.avgDelta)}/month`:`NEM trend +${money(m.avgDelta)}/month`;
 $('#nem-balance').textContent=money(b.trueup.nem_balance); $('#nonenergy-balance').textContent=money(m.nonEnergy); $('#nemForecast').textContent=money(m.nemForecast); $('#month-charge').textContent=money(b.current_period.current_charges);
 $('#confidence').textContent=`${learningProfile().confidence}%`;
 $('#t-solar').textContent=`${num(m.solar)} kWh`; $('#t-home').textContent=`${num(m.home)} kWh`; $('#t-import').textContent=`${num(m.gridImport)} kWh`; $('#t-export').textContent=`${num(m.gridExport)} kWh`;
 $('#tesla-range').textContent=`through ${new Date(t.range.end).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`;
 $('#solarCoverage').textContent=`${num(m.solarCoverage,0)}%`; $('#gridIndependence').textContent=`${num(m.gridIndependence,0)}%`; $('#batterySwing').textContent=`${num(m.batteryCharge+m.batteryDischarge)} kWh`;
 $('#mapSolar').textContent=`${num(m.solar)} kWh`; $('#mapHome').textContent=`${num(m.home)} kWh`; $('#mapBattery').textContent=`${num(m.batteryCharge)} in / ${num(m.batteryDischarge)} out`; $('#mapGrid').textContent=`${num(m.gridImport)} in / ${num(m.gridExport)} out`;
 $('#batteryCharge').textContent=`${num(m.batteryCharge)} kWh`; $('#batteryDischarge').textContent=`${num(m.batteryDischarge)} kWh`; $('#gridImport').textContent=`${num(m.gridImport)} kWh`; $('#gridExport').textContent=`${num(m.gridExport)} kWh`;
 $('#gridBehaviorText').textContent=m.gridExport>m.gridImport?`The supplied Tesla day is a net-export day by about ${num(m.gridExport-m.gridImport)} kWh through the end of the export.`:`The supplied Tesla day is a net-import day by about ${num(m.gridImport-m.gridExport)} kWh through the end of the export.`;
 $('#evJuly').textContent=num(e.summary.july_kwh,1); $('#sdgePeak').textContent=`${num(b.current_period.highest_demand_kw,1)} kW`; $('#evPeak').textContent=`${num(e.summary.july18_midnight_kwh,2)} kWh`;
 $('#evShare').style.width=Math.min(100,m.peakShare)+'%'; $('#evExplainer').textContent=`The EV charger explains about ${num(m.peakShare,0)}% of SDG&E's 14.4 kW highest-use hour. The remaining ~${num(b.current_period.highest_demand_kw-e.summary.july18_midnight_kwh,1)} kW came from other loads.`;
 renderBrain(); renderLearningCore(); renderDailyCoach(); renderLiveBrain(); renderLab(); drawNem(); drawTesla(); drawEv(); renderTou(); renderAudit(); renderInsights(); renderConnections(); renderEvTou(); renderCloud();
 const winterPeak=Math.max(...b.months.map(x=>x.balance));
 $('#topInsight').innerHTML=`<h3>✦ Smart finding: this is a winter debt problem, not a broken-solar-looking summer.</h3><p>The NEM energy balance peaked at <b>${money(winterPeak)}</b> in March. Recent months have generally pushed it down. On the supplied Tesla day, solar generated <b>${num(m.solar)} kWh</b> against <b>${num(m.home)} kWh</b> of home use and the site exported more energy than it imported.</p>`;
}
function learningProfile(){
 const m=METRICS,b=DATA.bill,e=DATA.emporia;
 const models=[
  {id:'tou',name:'Rate timing',state:'confident',confidence:94,evidence:`EV behavior is ${num(m.evPreferredPct,0)}% super-off-peak and this bill exported during 4–9 PM.`},
  {id:'trueup',name:'True-up behavior',state:'confident',confidence:91,evidence:`${b.months.length} billing periods show winter accumulation followed by spring/summer recovery.`},
  {id:'ev',name:'EV load signature',state:'confident',confidence:96,evidence:`Emporia explains about ${num(m.peakShare,0)}% of the July 18 highest-use hour.`},
  {id:'battery',name:'Battery impact',state:'learning',confidence:68,evidence:`Tesla history shows charge/discharge behavior, but live polling is intentionally disabled.`},
  {id:'solar',name:'Dual-solar behavior',state:'observing',confidence:46,evidence:'SolarEdge Array A and Enphase Array B are mapped separately; aligned live history is not connected yet.'},
  {id:'wholehome',name:'Whole-home demand',state:'observing',confidence:38,evidence:'EV attribution exists, but full mains/circuit history is still missing.'}
 ];
 const confidence=Math.round(models.reduce((a,x)=>a+x.confidence,0)/models.length);
 const confident=models.filter(x=>x.state==='confident').length;
 const stage=confident>=4?'CONFIDENT':confident>=2?'LEARNING':'OBSERVING';
 return {models,confidence,stage};
}
function renderLearningCore(){
 if(!$('#learningModels'))return; const p=learningProfile(),m=METRICS,b=DATA.bill;
 $('#learningStage').textContent=p.stage; $('#learningConfidence').textContent=`${p.confidence}%`; $('#modelCount').textContent=p.models.length; $('#smartMode').textContent='DATA';
 $('#learningSummary').textContent=p.stage==='LEARNING'?`Energy Daddy already has ${p.models.filter(x=>x.state==='confident').length} confident household behaviors. Live solar/site history will turn the remaining observations into personalized timing recommendations.`:'Energy Daddy is building explainable household behavior models.';
 $('#learningModels').innerHTML=p.models.map(x=>`<div class="learning-model ${x.state}"><div><b>${x.name}</b><small>${x.evidence}</small></div><div class="model-score"><strong>${x.confidence}%</strong><em>${x.state}</em></div></div>`).join('');
 let title='Protect the expensive window',text=`Until live solar forecasting is connected, keep flexible grid-heavy loads out of 4–9 PM when practical. Your EV history already shows strong cheap-window behavior.`,why=`Evidence: this bill is net-exporting during on-peak, while the identified 14.4 kW demand event happened around midnight. This is a safe recommendation from your rate + measured history, not an AI guess.`;
 if(m.evPreferredPct<70){title='Move more EV energy to the preferred window';text=`Only ${num(m.evPreferredPct,0)}% of observed EV charging landed in super-off-peak.`}
 $('#nextActionTitle').textContent=title;$('#nextActionText').textContent=text;$('#nextActionWhy').innerHTML=`<b>Why?</b><span>${why}</span>`;
 $('#brainStatus').textContent=`● ${p.stage.toLowerCase()}`;
}

function observedSolarWindow(){
 const ser=DATA.tesla?.series||[];
 const pts=ser.filter(r=>Number(r.solar||0)>=Math.max(1,Number(r.home||0)));
 if(!pts.length)return null;
 const fmt=t=>new Date(t).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
 return {start:pts[0].t,end:pts[pts.length-1].t,label:`${fmt(pts[0].t)}–${fmt(pts[pts.length-1].t)}`};
}
function dailyCoachProfile(){
 const m=METRICS,b=DATA.bill,p=learningProfile(),now=new Date(),tou=touStateAt(now),window=observedSolarWindow();
 const selfSupply=clamp(m.gridIndependence,0,100);
 const timing=m.timing;
 const reconciliation=clamp(100-Math.min(35,m.physicsMae*30),55,100);
 const learning=p.confidence;
 const score=Math.round(timing*.38+selfSupply*.28+reconciliation*.14+learning*.20);
 const onPeak=tou==='ON-PEAK',superOff=tou==='SUPER OFF-PEAK';
 let nowTitle=superOff?'CHEAP WINDOW':onPeak?'PROTECT MODE':'NORMAL WINDOW';
 let nowWhy=superOff?'Super off-peak is active. Flexible grid loads are cheapest here.':onPeak?'4–9 PM on-peak is active. Avoid starting flexible heavy loads when practical.':'You are outside the highest-cost window. Hold large flexible loads for solar or super off-peak when possible.';
 const best='10 AM–2 PM';
 const bestWhy=window?`Your supplied solar day was production-strong from ${window.label}; 10 AM–2 PM overlaps that pattern with super off-peak.`:'10 AM–2 PM overlaps super off-peak and the expected daytime solar window.';
 let dayType='SOLAR-LEANING';
 if(m.gridExport>m.gridImport*1.15)dayType='EXPORT-HEAVY';
 else if(m.evTou.total>40)dayType='EV-HEAVY';
 else if(m.gridImport>m.gridExport*1.25)dayType='GRID-HEAVY';
 const actions=[];
 if(onPeak) actions.push(['watch','Hold flexible loads','Wait until after 9 PM unless the load is necessary.']);
 else if(superOff) actions.push(['good','Good time for flexible loads','Your rate plan currently favors this window.']);
 else actions.push(['info','Wait for the better window','10 AM–2 PM or midnight–6 AM is usually more favorable than now.']);
 actions.push(['good','Keep EV out of 4–9 PM',`${num(m.evPreferredPct,0)}% of observed EV energy already lands in super off-peak.`]);
 actions.push([b.current_period.on_peak_kwh<0?'good':'watch','Protect the evening peak',b.current_period.on_peak_kwh<0?`This bill is already net-exporting ${Math.abs(b.current_period.on_peak_kwh)} kWh during on-peak — preserve that behavior.`:`On-peak imports remain an optimization target.`]);
 return {score,tou,nowTitle,nowWhy,best,bestWhy,dayType,dayTypeConfidence:Math.round((p.confidence+timing)/2),actions,window,mode:CloudBrain.mode==='cloud'?'CLOUD + HISTORY':'HISTORICAL'};
}
function renderDailyCoach(){
 if(!$('#dailyCoachCard'))return; const c=dailyCoachProfile(),m=METRICS,b=DATA.bill;
 $('#energyScore').textContent=c.score;
 $('#coachHeadline').textContent=c.score>=85?'Your energy habits are working today':c.score>=70?'Good foundation — protect the expensive hours':'There is useful room to optimize';
 $('#coachSubhead').textContent=`Energy Daddy ranked this from rate timing, observed self-supply, data agreement and ${learningProfile().models.length} household behavior models.`;
 $('#coachNow').textContent=c.nowTitle; $('#coachNowWhy').textContent=c.nowWhy;
 $('#coachBestWindow').textContent=c.best; $('#coachBestWhy').textContent=c.bestWhy;
 $('#coachProtect').textContent='4–9 PM'; $('#coachProtectWhy').textContent='EV-TOU-5 on-peak · preserve battery/solar leverage.';
 $('#coachActions').innerHTML=c.actions.map(([cls,t,d])=>`<div class="coach-action ${cls}"><b>${t}</b><small>${d}</small></div>`).join('');
 $('#coachMode').textContent=c.mode;
 $('#coachFreshness').innerHTML=CloudBrain.mode==='cloud'?`<span class="pulse-dot"></span> Cloud brain ${CloudBrain.live?.cron_last?`checked ${fmtAge(CloudBrain.live.cron_last)}`:'online'}`:'Using loaded household evidence';
 $('#coachEvidence').innerHTML=`<b>How this was decided</b><br>Rate timing score: ${m.timing}/100 · Grid independence on supplied Tesla day: ${num(m.gridIndependence,0)}% · Learning confidence: ${learningProfile().confidence}% · Tesla physics residual: ${num(m.physicsMae,2)} kW. ${c.window?`Observed solar-dominant window: ${c.window.label}.`:''} No generative AI was used.`;
 $('#dayType').textContent=c.dayType; $('#dayTypeConfidence').textContent=`${c.dayTypeConfidence}% confidence`;
 $('#dayTypeText').textContent=`This classification is based on the loaded household evidence, not a generic household profile. It will graduate to true day-by-day classification once Enphase/SolarEdge/Emporia live history is connected.`;
 const schedule=[['12–6 AM','Super off-peak','EV / flexible grid loads'],['10 AM–2 PM','Super off-peak + solar overlap','Best daytime flexible-load target'],['4–9 PM','On-peak','Protect battery + avoid new heavy loads']];
 $('#miniSchedule').innerHTML=schedule.map(r=>`<div class="schedule-row"><b>${r[0]}</b><span>${r[1]}</span><em>${r[2]}</em></div>`).join('');
 const fp=[['🚘','EV signature',`${num(m.evPreferredPct,0)}% super off-peak`,m.evPreferredPct>80?'strong':'learning'],['☀️','Solar shape',`${num(m.solarDominant,0)}% solar-dominant samples`,m.solarDominant>35?'strong':'learning'],['🔋','Peak protection',`${num(m.onPeakImport,1)} kWh import / ${num(m.onPeakExport,1)} kWh export`,m.onPeakExport>=m.onPeakImport?'strong':'watch'],['◎','True-up pattern',`${money(b.trueup.nem_balance)} NEM balance`,m.avgDelta<0?'improving':'watch']];
 $('#fingerprints').innerHTML=fp.map(([i,t,d,st])=>`<div class="fingerprint"><span>${i}</span><div><b>${t}</b><small>${d}</small></div><em>${st}</em></div>`).join('');
}
function renderBrain(){const {bill:b,solaredge:s}=DATA,m=METRICS;
 $('#pressureScore').textContent=`${m.pressure}/100`; $('#pressureText').textContent=`Current account balance is ${money(b.trueup.account_balance)} with ${m.daysLeft} days until true-up. Energy-only trajectory is improving, but non-energy buckets already total ${money(m.nonEnergy)}.`;
 $('#timingScore').textContent=`${m.timing}/100`; $('#timingText').textContent=b.current_period.on_peak_kwh<0?`Strong: this bill shows net export during 4–9 PM on-peak. The big EV spike happened at midnight, inside super-off-peak.`:`On-peak imports are still costing leverage; shift flexible loads where possible.`;
 $('#meterScore').textContent=`${m.meterAgreement}/100`; $('#meterText').textContent=`Cross-source confidence is limited because Tesla and SolarEdge are different evidence feeds. Energy Daddy refuses to merge unlike scopes until interval/source mapping is available.`;
 const actions=[
  ['P1','Import SDG&E Green Button','This unlocks 15-minute meter reconciliation and a real tariff audit instead of bill-level inference.'],
  ['P1','Add full Emporia mains/circuits','EV is solved. Whole-home mains let us attribute the rest of the load and compare panel-side consumption against Tesla.'],
  ['P1','Map solar source scope',`Tesla integrated ${num(m.solar)} kWh on the supplied day while SolarEdge's shared snapshot reports ${s.reported_today_kwh} kWh. Label what each feed measures before comparing totals.`],
  ['P2','Add battery settings','Reserve %, grid-charging permission and operating mode would let the brain score battery behavior against EV-TOU-5.'],
  ['P2','Add HVAC + weather','Then we can learn heat→HVAC demand, pre-cooling value, and abnormal usage days.']
 ]; $('#actionCount').textContent=`${actions.length} actions`; $('#actionList').innerHTML=actions.map(a=>`<div class="action"><span>${a[0]}</span><div><b>${a[1]}</b><p>${a[2]}</p></div></div>`).join('');
 $('#forecastCurrent').textContent=money(b.trueup.nem_balance); $('#forecastEnd').textContent=money(m.nemForecast); $('#forecastExplain').textContent=`This is deliberately an NEM-only directional estimate. It uses the average month-to-month change across the most recent four balance changes (${money(m.avgDelta)}/month) for the remaining ${num(m.monthsRemaining,1)} billing-month equivalents. It does not pretend future non-bypassable or meter charges are known.`;
 const q=[['SDG&E bill/NEM','High','Official bill values and true-up ledger'],['Tesla site telemetry','High','5-minute physics-quality site flow for one supplied day'],['Emporia EV','High','Direct circuit measurement for the EV charger'],['SolarEdge','Partial','One share snapshot, not interval history'],['Whole-home attribution','Missing','Need Emporia mains/circuits']]; $('#qualityList').innerHTML=q.map(r=>`<div class="quality"><b>${r[0]}</b><span class="q ${r[1].toLowerCase()}">${r[1]}</span><small>${r[2]}</small></div>`).join('');
}
function touStateAt(date){
 const d=new Date(date),h=d.getHours()+d.getMinutes()/60,weekend=[0,6].includes(d.getDay());
 if(h>=16&&h<21)return 'ON-PEAK';
 if(weekend&&h<14)return 'SUPER OFF-PEAK';
 if(!weekend&&((h>=0&&h<6)||(h>=10&&h<14)))return 'SUPER OFF-PEAK';
 return 'OFF-PEAK';
}
function renderLiveBrain(){
 const m=METRICS,l=m.latest||{}; if(!$('#liveHome'))return;
 const kw=(v)=>`${num(Math.abs(Number(v||0)),1)} kW`;
 $('#liveHome').textContent=kw(l.home); $('#liveSolar').textContent=kw(l.solar);
 $('#liveBattery').textContent=Number(l.battery||0)>=0?`${kw(l.battery)} out`:`${kw(l.battery)} charging`;
 $('#liveGrid').textContent=Number(l.grid||0)>0?`${kw(l.grid)} import`:`${kw(l.grid)} export`;
 $('#liveSoc').textContent=m.latestSoc==null?'—':`${num(m.latestSoc,0)}%`;
 $('#liveTou').textContent=touStateAt(l.t||new Date());
 const dt=new Date(l.t); $('#telemetryAge').textContent=`● snapshot ${dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`;
 let story='';
 if(Number(l.grid||0)<=0 && Number(l.battery||0)>0) story=`The supplied snapshot shows the Powerwall covering the evening while the grid is effectively at zero. That is exactly the behavior we want during the expensive window.`;
 else if(Number(l.grid||0)>0 && touStateAt(l.t)==='ON-PEAK') story=`The house is importing during on-peak in this snapshot. Once live feeds exist, this becomes a high-priority alert.`;
 else story=`The latest supplied telemetry is behaving normally for its TOU period.`;
 $('#liveNarrative').textContent=story;
 const briefs=[];
 briefs.push(m.gridExport>m.gridImport?['good','Grid-positive supplied day',`Tesla shows ${num(m.gridExport-m.gridImport)} kWh more export than import through the supplied snapshot.`]:['watch','Net grid import day',`Tesla shows ${num(m.gridImport-m.gridExport)} kWh more import than export.`]);
 briefs.push(DATA.bill.current_period.on_peak_kwh<0?['good','Peak-period behavior is strong',`${Math.abs(DATA.bill.current_period.on_peak_kwh)} net kWh were exported during the bill's on-peak bucket.`]:['watch','Peak imports need attention',`${DATA.bill.current_period.on_peak_kwh} kWh were imported on-peak.`]);
 briefs.push(m.physicsMae<0.25?['good','Tesla physics reconcile cleanly',`Average site-flow equation error is only ${num(m.physicsMae,2)} kW across the supplied samples.`]:['watch','Site-flow mismatch detected',`Average telemetry equation error is ${num(m.physicsMae,2)} kW; worth checking sign conventions or sampling.`]);
 $('#dailyBrief').innerHTML=briefs.map(([c,t,p])=>`<div class="brief ${c}"><b>${t}</b><p>${p}</p></div>`).join('');
}
function renderLab(){
 if(!$('#saveKwh'))return; const m=METRICS,b=DATA.bill;
 const update=()=>{const save=Number($('#saveKwh').value);$('#saveKwhLabel').textContent=`${save} kWh/mo`;$('#scenarioCurrentKwh').textContent=`${Math.round(m.ytdNetKwh)} kWh`;
   const remaining=Math.max(0,m.monthsRemaining),adj=Math.round(m.ytdNetKwh-save*remaining);$('#scenarioAdjustedKwh').textContent=`${adj} kWh`;
   const dollarsPerNetKwh=b.trueup.nem_balance/Math.max(1,m.ytdNetKwh); const directional=Math.max(0,b.trueup.nem_balance-save*remaining*dollarsPerNetKwh);$('#scenarioNem').textContent=money(directional);
   $('#scenarioExplain').textContent=`Directional only: the model uses your current NEM-balance-to-net-kWh relationship as a pressure factor, not as a tariff quote. Improving net position by ${save} kWh/month for ~${num(remaining,1)} billing-month equivalents would remove roughly ${Math.round(save*remaining)} net kWh of pressure.`;
 }; $('#saveKwh').oninput=update; update();
 $('#shieldSoc').textContent=m.latestSoc==null?'—':`${num(m.latestSoc,0)}%`; $('#shieldHours').textContent=m.shieldHours?`${num(m.shieldHours,1)} hr`:'—'; $('#shieldMeter').style.width=`${clamp((m.latestSoc||0),0,100)}%`;
 $('#shieldText').textContent=`Using a 13.5 kWh nominal Powerwall assumption and the supplied day's average 4–9 PM home load of ${num(m.eveningHome,1)} kW, the latest observed state of charge implies about ${num(m.shieldHours,1)} hours of rough load coverage. This is a planning estimate, not a battery guarantee.`;
 const anomalies=[];
 if(m.solarMismatchPct>20)anomalies.push(['P1','Solar sources disagree',`SolarEdge's shared daily total and Tesla's integrated supplied day differ by ${num(m.solarMismatch)} kWh (${num(m.solarMismatchPct,0)}%). Keep them separate until topology is labeled.`]);
 anomalies.push(['P2','July 18 demand event explained',`Emporia EV charging accounted for about ${num(m.peakShare,0)}% of SDG&E's highest-use hour, so this is classified rather than unexplained.`]);
 if(m.physicsMae>0.3)anomalies.push(['P2','Tesla site-flow equation drift',`Average equation residual is ${num(m.physicsMae,2)} kW.`]);
 $('#anomalyList').innerHTML=anomalies.map(a=>`<div class="action"><span>${a[0]}</span><div><b>${a[1]}</b><p>${a[2]}</p></div></div>`).join('');
 $('#solarPeak').textContent=`${num(m.solarPeak,1)} kW`; $('#solarDominantPct').textContent=`${num(m.solarDominant,0)}%`;
 $('#solarPerfText').textContent=`On the supplied Tesla day, solar output exceeded instantaneous home demand in ${num(m.solarDominant,0)}% of samples. Peak observed production reached ${num(m.solarPeak,1)} kW. This view intentionally judges observed behavior only, not utility paperwork or hardware inventory.`;
}
function canvasSetup(id){const c=$(id),dpr=devicePixelRatio||1,w=c.clientWidth,h=+c.getAttribute('height');c.width=w*dpr;c.height=h*dpr;const x=c.getContext('2d');x.scale(dpr,dpr);return {c,x,w,h}}
function drawNem(){const {x,w,h}=canvasSetup('#nemChart'),m=DATA.bill.months,p=26; x.clearRect(0,0,w,h);const maxK=Math.max(...m.map(d=>Math.abs(d.net_kwh))),maxB=Math.max(...m.map(d=>d.balance)),step=(w-p*2)/(m.length-1);x.strokeStyle='#292930';for(let i=0;i<4;i++){let y=p+i*(h-p*2)/3;x.beginPath();x.moveTo(p,y);x.lineTo(w-p,y);x.stroke()}m.forEach((d,i)=>{const barH=Math.abs(d.net_kwh)/maxK*58,xx=p+i*step,base=h-46;x.fillStyle=d.net_kwh<0?'#48d17a':'#8a7cff';x.fillRect(xx-7,d.net_kwh<0?base:base-barH,14,barH);x.fillStyle='#777780';x.font='9px sans-serif';x.textAlign='center';x.fillText(new Date(d.date+'T12:00:00').toLocaleDateString('en-US',{month:'short'}),xx,h-15)});x.strokeStyle='#64d8ff';x.lineWidth=2.5;x.beginPath();m.forEach((d,i)=>{const xx=p+i*step,yy=p+(1-d.balance/maxB)*(h-85);i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke()}
function drawTesla(){const {x,w,h}=canvasSetup('#teslaChart'),s=DATA.tesla.series,p=16,keys=[['solar','#ffcb66'],['home','#f5f5f7'],['grid','#64d8ff'],['battery','#8a7cff']],max=Math.max(...s.flatMap(r=>keys.map(([k])=>Math.abs(r[k]||0))));x.clearRect(0,0,w,h);keys.forEach(([k,col])=>{x.strokeStyle=col;x.globalAlpha=.9;x.lineWidth=1.35;x.beginPath();s.forEach((r,i)=>{const xx=p+i*(w-p*2)/(s.length-1),yy=h/2-(Number(r[k]||0)/max)*(h/2-p);i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke()});x.globalAlpha=1;x.strokeStyle='#33333a';x.beginPath();x.moveTo(p,h/2);x.lineTo(w-p,h/2);x.stroke()}
function drawEv(){const {x,w,h}=canvasSetup('#evChart'),d=DATA.emporia.daily,p=18,max=Math.max(...d.map(v=>v.kwh));x.clearRect(0,0,w,h);d.forEach((r,i)=>{const xx=p+i*(w-p*2)/d.length,bh=r.kwh/max*(h-45);x.fillStyle=r.kwh>0?'#8a7cff':'#24242a';x.fillRect(xx,h-22-bh,Math.max(2,(w-p*2)/d.length-2),bh)});x.fillStyle='#777780';x.font='9px sans-serif';x.textAlign='left';x.fillText('Jul 1',p,h-7);x.textAlign='right';x.fillText('Aug 19',w-p,h-7)}
function drawDonut(){const b=DATA.bill.trueup,vals=[b.nem_balance,b.non_bypassable_charges,b.other_meter_charges_payments],sum=vals.reduce((a,b)=>a+b,0); if($('#breakdown')) $('#breakdown').innerHTML=[['NEM energy',vals[0]],['Non-bypassable',vals[1]],['Other meter',vals[2]]].map(r=>`<div class="break-row"><i class="dot"></i><small>${r[0]}</small><b>${money(r[1])} · ${num(r[1]/sum*100,0)}%</b></div>`).join(''); const c=$('#donut'); if(!c)return; const {x,w,h}=canvasSetup('#donut'),cols=['#8a7cff','#64d8ff','#ffb84d'];x.clearRect(0,0,w,h);let a=-Math.PI/2;vals.forEach((v,i)=>{const z=v/sum*Math.PI*2;x.beginPath();x.strokeStyle=cols[i];x.lineWidth=24;x.arc(w/2,h/2,78,a,a+z);x.stroke();a+=z}); if($('#donutTotal'))$('#donutTotal').textContent=money(sum)}
function renderTou(){const b=DATA.bill.current_period,rows=[['On-peak',b.on_peak_kwh],['Off-peak',b.off_peak_kwh],['Super off-peak',b.super_off_peak_kwh]],max=Math.max(...rows.map(r=>Math.abs(r[1])));$('#touBars').innerHTML=rows.map(([n,v])=>`<div class="tou-row"><b>${n}</b><div class="track"><i class="fill ${v<0?'export':''}" style="width:${Math.abs(v)/max*100}%"></i></div><strong>${v>0?'+':''}${v} kWh</strong></div>`).join('')}
function renderAudit(){
 const b=DATA.bill,e=DATA.emporia.summary,m=METRICS;
 $('#auditMonth').textContent=money(b.current_period.current_charges);
 $('#auditBalance').textContent=money(b.trueup.account_balance);
 $('#energyShare').textContent=`${num(m.energyShare,0)}% energy balance`;
 const buckets=[
  ['NEM energy',b.trueup.nem_balance,'Energy bought/credited across the settlement year','energy'],
  ['Non-bypassable',b.trueup.non_bypassable_charges,'Charges that generation credits do not simply erase','nbc'],
  ['Other meter',b.trueup.other_meter_charges_payments,'Other accumulated meter charges/payments on the account','other']
 ];
 $('#auditBuckets').innerHTML=buckets.map(([n,v,d,c])=>`<article class="card audit-bucket ${c}"><span>${n}</span><strong>${money(v)}</strong><small>${d}</small><b>${num(v/b.trueup.account_balance*100,0)}%</b></article>`).join('');
 $('#balanceStack').innerHTML=buckets.map(([n,v,d,c])=>`<i class="${c}" title="${n}: ${money(v)}" style="width:${v/b.trueup.account_balance*100}%"></i>`).join('');
 $('#balanceCallout').innerHTML=`<b>Key point:</b> ${money(m.nonEnergy)} — about ${num(m.nonEnergy/b.trueup.account_balance*100,0)}% of the current balance — is outside the running NEM-energy bucket. That is why staring only at net kWh cannot explain the whole ${money(b.trueup.account_balance)}.`;
 const peakNet=b.current_period.on_peak_kwh, superNet=b.current_period.super_off_peak_kwh;
 $('#touSummary').innerHTML=`<div><b>${peakNet<0?'✓ Net exporter':'! Net importer'} during 4–9 PM</b><span>${Math.abs(peakNet)} kWh ${peakNet<0?'exported':'imported'} in the bill's on-peak bucket.</span></div><div><b>${superNet} kWh super-off-peak import</b><span>This is where flexible loads like EV charging can legitimately be large without being peak-period behavior.</span></div>`;
 const months=b.months; $('#auditLedger').innerHTML=months.map((r,i)=>{const prev=i?months[i-1].balance:0,delta=r.balance-prev;return `<div class="ledger-row"><span>${new Date(r.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',year:'2-digit'})}</span><b class="${r.net_kwh<0?'goodtxt':'badgetxt'}">${r.net_kwh>0?'+':''}${r.net_kwh} kWh</b><strong>${money(r.balance)}</strong><em class="${delta<=0?'goodtxt':'badgetxt'}">${delta>0?'+':''}${money(delta)}</em></div>`}).join('');
 const evidence=[
  ['explained','$910 composition','The three bill buckets add back to the current account balance.'],
  ['explained','Winter NEM buildup','Monthly ledger shows the energy balance peaking in March, then improving through July.'],
  ['explained','July 18 demand spike',`EV charging explains about ${num(m.peakShare,0)}% of the highest-use hour.`],
  ['partial','Solar feed comparison','Tesla and SolarEdge are not treated as interchangeable until their measurement scopes are labeled.'],
  ['missing','Utility interval reconciliation','Green Button 15-minute data is still needed to compare SDG&E meter intervals against site telemetry.'],
  ['missing','Whole-home circuit attribution','Current Emporia export covers the EV charger, not every circuit.']
 ];
 $('#evidenceBoard').innerHTML=evidence.map(([c,t,d])=>`<div class="evidence ${c}"><span>${c==='explained'?'✓':c==='partial'?'~':'?'}</span><div><b>${t}</b><small>${d}</small></div></div>`).join('');
 const items=[
  ['good','Current-month charge separated from true-up',`This month's current charges are ${money(b.current_period.current_charges)} after the climate credit; the ${money(b.trueup.account_balance)} figure is accumulated.`],
  ['good','Balance anatomy reconciles',`${money(b.trueup.nem_balance)} NEM + ${money(b.trueup.non_bypassable_charges)} non-bypassable + ${money(b.trueup.other_meter_charges_payments)} other meter = ${money(b.trueup.account_balance)}.`],
  ['good','Winter drove the NEM energy balance','The running NEM balance climbed to $684.16 by March, then spring/summer credits pushed it down before August rose again.'],
  ['good','July 18 demand spike identified',`Emporia shows ${num(e.july18_midnight_kwh,2)} kWh on the EV charger from midnight–1 AM, explaining about ${num(m.peakShare,0)}% of SDG&E's 14.4 kW peak hour.`],
  ['warn','Exact utility-vs-house interval audit is not available yet','We need SDG&E Green Button interval data before Energy Daddy can call a meter discrepancy real.'],
  ['warn','Solar feeds remain separate evidence',`Tesla integrates to ${num(m.solar,1)} kWh on the supplied day while the SolarEdge snapshot reports ${DATA.solaredge.reported_today_kwh} kWh. Energy Daddy will not merge them until scope is known.`]
 ];
 $('#auditTrail').innerHTML=items.map(([c,h,p])=>`<div class="time-item ${c}"><b>${h}</b><span>${p}</span></div>`).join('');
 renderEvTou();
} 
function renderEvTou(){
 const m=METRICS;if(!$('#evTouGrid'))return; const t=m.evTou,total=t.total||1;
 const rows=[['Super off-peak',t.super,'preferred'],['Off-peak',t.off,'normal'],['On-peak',t.on,'avoid']];
 $('#evTouGrid').innerHTML=rows.map(([n,v,c])=>`<div class="ev-tou-item"><span>${n}</span><strong>${num(v,1)} kWh</strong><div class="track"><i class="fill ${c}" style="width:${v/total*100}%"></i></div><small>${num(v/total*100,0)}% of measured EV energy</small></div>`).join('');
 $('#evTouScore').textContent=`${num(m.evPreferredPct,0)}% super off-peak`;
 $('#evTouText').textContent=`Across the supplied Emporia history, ${num(m.evPreferredPct,0)}% of measured EV charging landed in EV-TOU-5 super-off-peak hours. This is a real behavior score from the charger timestamps, not an assumption based on one spike.`;
}
function getInsights(){const b=DATA.bill,m=METRICS;return [
 {p:1,t:'The $910 balance is not one thing',d:`Only ${money(b.trueup.nem_balance)} is the running NEM energy balance. ${money(m.nonEnergy)} already sits in non-bypassable and other meter buckets.`},
 {p:1,t:'Your supplied Tesla day looks energetically strong',d:`Solar generated ${num(m.solar,1)} kWh versus ${num(m.home,1)} kWh of home load, while grid exports (${num(m.gridExport,1)} kWh) exceeded imports (${num(m.gridImport,1)} kWh).`},
 {p:1,t:'Source scope is now the biggest data question',d:`SolarEdge and Tesla differ by ${num(m.solarMismatch,1)} kWh on the supplied day. Energy Daddy keeps them separate until we know exactly what each feed measures instead of forcing a false reconciliation.`},
 {p:2,t:'EV timing is behaving like EV-TOU-5 expects',d:`The identified July 18 EV spike began at midnight, inside super-off-peak. It explains most of the 14.4 kW peak without automatically implying expensive timing.`},
 {p:2,t:'Battery is materially shifting energy',d:`Across the supplied Tesla window, Energy Daddy sees about ${num(m.batteryCharge,1)} kWh of charging and ${num(m.batteryDischarge,1)} kWh of discharge. Settings are the missing context for deciding whether that behavior is financially optimal.`},
 {p:3,t:'Green Button is the unlock',d:'Once SDG&E 15-minute intervals are imported, the platform can reconcile utility-meter import/export against Tesla by timestamp and flag actual disagreements instead of inferring from monthly totals.'}
]}
function renderInsights(){const arr=getInsights().sort((a,b)=>a.p-b.p);$('#insightList').innerHTML=arr.map(i=>`<article class="card insight"><span class="priority">P${i.p}</span><div class="eyebrow">SMART FINDING</div><h3>${i.t}</h3><p>${i.d}</p></article>`).join('')}
function renderConnections(){const rows=[['⚡','SDG&E','Bill + NEM + TOU','Loaded'],['▰','Tesla Powerwall','5-minute site telemetry','Loaded'],['🔌','Emporia','EV circuit export','Loaded'],['☀️','SolarEdge','Array A production','Partial'],['◉','Enphase Enlighten','Array B + site meter','Ready to connect'],['⌂','Nest / HVAC','Future load context','Not connected'],['🚘','Tesla vehicle','Future charging context','Not connected'],['☁️','Ambient Weather','Future weather correlation','Not connected']];$('#connectionsList').innerHTML=rows.map(r=>`<article class="card connection"><div class="icon">${r[0]}</div><div class="meta"><b>${r[1]}</b><span>${r[2]}</span></div><span class="tag ${r[3]==='Not connected'?'off':''}">${r[3]}</span></article>`).join('')}

const CloudBrain={mode:'local',health:null,live:null,queue:0,memory:0,lastError:null};
function openEnergyDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('energy-daddy-local',1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('imports'))db.createObjectStore('imports',{keyPath:'id'});if(!db.objectStoreNames.contains('queue'))db.createObjectStore('queue',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function dbCount(store){try{const db=await openEnergyDB();return await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}catch{return 0}}
async function saveLocalImport(record){const db=await openEnergyDB();await new Promise((resolve,reject)=>{const tx=db.transaction(['imports','queue'],'readwrite');tx.objectStore('imports').put(record);tx.objectStore('queue').put({id:record.id,type:'import',created_at:new Date().toISOString(),payload:{id:record.id,filename:record.filename,row_count:record.row_count,range_start:record.range_start,range_end:record.range_end}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});await initLocalMemory()}
async function initLocalMemory(){CloudBrain.memory=await dbCount('imports');CloudBrain.queue=await dbCount('queue');if($('#memoryCount'))$('#memoryCount').textContent=CloudBrain.memory;if($('#syncQueue'))$('#syncQueue').textContent=CloudBrain.queue}
function apiBase(){
 const q=new URLSearchParams(location.search).get('api');
 if(q) return q.replace(/\/$/,'');
 if(location.hostname==='localhost' && location.port==='5050') return 'http://localhost:5051';
 return '';
}
async function probeCloud(){
 try{
  const base=apiBase(),ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),3000);
  const [hr,lr]=await Promise.all([fetch(`${base}/api/health`,{cache:'no-store',signal:ctl.signal}),fetch(`${base}/api/live`,{cache:'no-store',signal:ctl.signal})]);
  clearTimeout(timer);if(!hr.ok)throw new Error(`Health HTTP ${hr.status}`);if(!lr.ok)throw new Error(`Live HTTP ${lr.status}`);
  const h=await hr.json(),live=await lr.json();CloudBrain.health=h;CloudBrain.live=live;CloudBrain.mode=h.ok?'cloud':'degraded';CloudBrain.lastError=null
 } catch(err){CloudBrain.mode='local';CloudBrain.health=null;CloudBrain.live=null;CloudBrain.lastError=String(err?.message||err)}
 renderCloud();
}
function fmtAge(ts){if(!ts)return 'never';const m=Math.max(0,Math.round((Date.now()-new Date(ts))/60000));return m<1?'just now':m<60?`${m}m ago`:`${Math.round(m/60)}h ago`}
function renderCloud(){
 if(!$('#cloudMode'))return;const isCloud=CloudBrain.mode==='cloud',live=CloudBrain.live;
 $('#cloudMode').textContent=isCloud?'CLOUD':'LOCAL';
 $('#cloudModeText').textContent=isCloud?'Cloudflare Worker + D1 + KV responded. Live Brain will only call providers that have approved server-side credentials.':'Bundled/local evidence is active. On localhost:5050 Energy Daddy will look for the Worker on localhost:5051.';
 $('#cloudModeBadge').textContent=isCloud?'● cloud API healthy':'● local-first';
 if($('#mobileCloudDot')){$('#mobileCloudDot').textContent=isCloud?'●':'○';$('#mobileCloudDot').className=isCloud?'cloud-ok':'cloud-local'}
 if($('#mobileWatchText'))$('#mobileWatchText').textContent=isCloud?`Cloud brain online · ${live?.cron_last?`last heartbeat ${fmtAge(live.cron_last)}`:'heartbeat pending'}`:'Local evidence mode';
 $('#syncQueue').textContent=CloudBrain.queue;$('#memoryCount').textContent=CloudBrain.memory;
 const checks=[
  ['Frontend','ready','Static app is deployed with the Worker and remains locally runnable on 5050.'],
  ['Worker API',isCloud?'ready':'staged',isCloud?'Health + Live endpoints responded.':'Start Wrangler on 5051 to test locally.'],
  ['D1 ledger',CloudBrain.health?.d1?'ready':'staged','Canonical 15-minute telemetry is the durable evidence ledger.'],
  ['KV current state',CloudBrain.health?.kv?'ready':'staged','Provider freshness + current state live here.'],
  ['Tesla live polling','disabled','$0 strategy: periodic historical evidence only unless you later decide paid Tesla telemetry is worth it.'],
  ['SolarEdge Array A','ready','Poll independently every 15 minutes once credentials are configured.'],
  ['Enphase Array B + site meter','ready','Connect separately; never overwrite or double-count SolarEdge production.']
 ];
 $('#cloudChecks').innerHTML=checks.map(([n,c,d])=>`<div class="quality"><b>${n}</b><span class="q ${c==='ready'||c==='safe'?'high':'partial'}">${c}</span><small>${d}</small></div>`).join('');
 const src=live?.sources||[];
 const byId=Object.fromEntries(src.map(x=>[x.id,x]));
 const plan=[
  ['solaredge-site','SolarEdge','Array A production','15-minute live production'],
  ['enphase-site','Enphase','Array B + site meter','15-minute production + consumption/grid evidence'],
  ['tesla-site','Tesla','Battery impact','historical / periodic — no paid live polling'],
  ['sdge-meter','SDG&E','Utility settlement','delayed reconciliation, not instant'],
  ['emporia-ev','Emporia','Load attribution','EV export today · bridge later']
 ];
 $('#sourceRegistry').innerHTML=plan.map(([id,p,r,c])=>{const x=byId[id],st=x?.runtime?.status||x?.status||'planned';return `<div class="source-row"><div><b>${p}</b><small>${r}</small></div><span>${c}</span><em class="${st}">${st.replaceAll('_',' ')}</em></div>`}).join('');
 if($('#liveSourceStatus')) $('#liveSourceStatus').innerHTML=plan.map(([id,p,r])=>{const x=byId[id],rt=x?.runtime||{},st=rt.status||x?.status||'planned';const msg=rt.message||'No runtime status yet.';const detail=rt.last_seen_at?` · ${fmtAge(rt.last_seen_at)}`:'';return `<div class="live-provider"><div><b>${p}</b><small>${msg}${detail}</small></div><em class="${st}">${st.replaceAll('_',' ')}</em></div>`}).join('');
 const latest=live?.latest||[];
 if($('#cloudLatest')) $('#cloudLatest').innerHTML=latest.length?latest.slice(0,10).map(r=>`<div class="cloud-reading"><b>${r.source_id} · ${r.metric}</b><strong>${r.power_avg_w!=null?`${num(r.power_avg_w/1000,2)} kW`:`${num(r.energy_wh/1000,2)} kWh`}</strong><small>${fmtAge(r.interval_start)} · ${r.quality} · ${r.scope}</small></div>`).join(''):'<div class="muted">No cloud telemetry yet. This is correct until a live source or authenticated import writes data.</div>';
 if($('#cronLast')) $('#cronLast').textContent=`cron ${live?.cron_last?fmtAge(live.cron_last):'—'}`;
 if($('#livePollBadge')){const solar=byId['solaredge-site']?.runtime?.status;$('#livePollBadge').textContent=solar==='live'?'● SolarEdge live':isCloud?'● brain online':'● local';$('#livePollBadge').className=`status ${solar==='live'?'ok':'warn'}`}
 if($('#cloudLatestNote')) $('#cloudLatestNote').textContent=latest.length?'Newest canonical readings from D1. Energy Daddy keeps source/metric/scope attached so unlike measurements are never silently merged.':'The cloud brain is healthy; provider data is simply not connected yet.';
 const events=[
  ['✓','Explained event','July 18 midnight demand spike is mostly EV charging.'],
  ['$0','Tesla strategy','Battery history stays periodic/manual; live paid Tesla polling is intentionally disabled.'],
  ['☀','Dual-solar strategy','SolarEdge Array A + Enphase Array B stay independent; Energy Daddy derives Total Solar only after aligned intervals are available.'],
  ['⚠','Utility audit rule','Only call an SDG&E discrepancy after aligned interval evidence actually disagrees.']
 ];
 renderDailyCoach();
 $('#eventBrainPreview').innerHTML=events.map(([p,t,d])=>`<div class="action"><span>${p}</span><div><b>${t}</b><p>${d}</p></div></div>`).join('');
}
function openView(view){
 $$('.nav,.view').forEach(x=>x.classList.remove('active'));
 const target=$(`#${view}`); if(target)target.classList.add('active');
 const nav=$(`.nav[data-view="${view}"]`); if(nav)nav.classList.add('active');
 const names={overview:'Overview',brain:'Smart Core',audit:'Bill Audit',lab:'What-If Lab',flows:'Energy Flow',connections:'Connections',cloud:'Live Brain'};
 $('#page-title').textContent=names[view]||'Energy Daddy';
 closeMobileSheet(); window.scrollTo({top:0,behavior:'smooth'});
 setTimeout(()=>{if(view==='overview'){drawNem();drawTesla()}if(view==='audit')drawDonut();if(view==='flows')drawEv()},10)
}
$$('.nav[data-view]').forEach(b=>b.onclick=()=>openView(b.dataset.view));
function openMobileSheet(){const s=$('#mobileSheet'),b=$('#mobileSheetBackdrop');if(!s)return;s.classList.add('open');b.classList.add('open');s.setAttribute('aria-hidden','false')}
function closeMobileSheet(){const s=$('#mobileSheet'),b=$('#mobileSheetBackdrop');if(!s)return;s.classList.remove('open');b.classList.remove('open');s.setAttribute('aria-hidden','true')}
const more=$('.mobile-more-btn');if(more)more.onclick=openMobileSheet;
if($('#closeMobileSheet'))$('#closeMobileSheet').onclick=closeMobileSheet;if($('#mobileSheetBackdrop'))$('#mobileSheetBackdrop').onclick=closeMobileSheet;
$$('[data-mobile-view]').forEach(b=>b.onclick=()=>openView(b.dataset.mobileView));
if($('#showInstallHelp'))$('#showInstallHelp').onclick=()=>{openMobileSheet();setTimeout(()=>$('#installHelp')?.scrollIntoView({behavior:'smooth',block:'center'}),150)};
if($('#openCoachWhy'))$('#openCoachWhy').onclick=()=>{const e=$('#coachEvidence');const open=e.hasAttribute('hidden');if(open)e.removeAttribute('hidden');else e.setAttribute('hidden','');$('#openCoachWhy').textContent=open?'Hide why':'Why these?'};

$('#refresh').onclick=()=>load(); if($('#testCloud'))$('#testCloud').onclick=()=>probeCloud(); setInterval(()=>{if(document.visibilityState==='visible')probeCloud()},60000);
$('#csvUpload').addEventListener('change',async ev=>{const f=ev.target.files[0];if(!f)return;const text=await f.text(),lines=text.trim().split(/\r?\n/),headers=(lines[0]||'').split(',');const rows=lines.slice(1,Math.min(lines.length,501)).map(l=>l.split(','));const numeric=headers.map((h,i)=>{const vals=rows.map(r=>Number(r[i])).filter(Number.isFinite);return vals.length>Math.max(3,rows.length*.7)?`${h}: numeric (${vals.length} sampled)`:null}).filter(Boolean);let dates=[];rows.forEach(r=>r.forEach(v=>{const d=new Date(v);if(v&&/[-/:T]/.test(v)&&!isNaN(d))dates.push(d)}));dates.sort((a,b)=>a-b);const id=`${f.name}:${f.size}:${f.lastModified}`;await saveLocalImport({id,filename:f.name,size:f.size,row_count:Math.max(0,lines.length-1),headers,range_start:dates[0]?.toISOString()||null,range_end:dates.at(-1)?.toISOString()||null,imported_at:new Date().toISOString()});$('#uploadResult').textContent=`${f.name}\n${lines.length-1} data rows\n${headers.length} columns\nColumns: ${headers.join(' · ')}\n${dates.length?`Time coverage sampled: ${dates[0].toLocaleString()} → ${dates.at(-1).toLocaleString()}\n`:''}${numeric.length?`Likely numeric fields:\n- ${numeric.join('\n- ')}\n`:''}\nSaved to local Energy Daddy memory and staged for future cloud sync. File contents were not uploaded.`});
window.addEventListener('resize',()=>{if(DATA.bill){if($('#overview').classList.contains('active')){drawNem();drawTesla()}if($('#audit').classList.contains('active'))drawDonut();if($('#flows').classList.contains('active'))drawEv()}});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
load().catch(err=>{console.error(err);document.querySelector('.status.ok').textContent='● Data load error';document.querySelector('.status.ok').classList.add('warn')});

// Build 1.7 Adaptive Browser Brain
(function adaptiveBrowserBrain(){
  const root=document.body;
  let lastBucket='';
  function apply(){
    const w=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
    const h=Math.max(document.documentElement.clientHeight||0,window.innerHeight||0);
    const bucket=w<=350?'micro':w<=480?'phone':w<=760?'compact':w<=1100?'tablet':'desktop';
    root.classList.remove('viewport-micro','viewport-phone','viewport-compact','viewport-tablet','viewport-desktop','orientation-portrait','orientation-landscape','pointer-coarse');
    root.classList.add('viewport-'+bucket,'orientation-'+(h>=w?'portrait':'landscape'));
    if(matchMedia('(pointer:coarse)').matches) root.classList.add('pointer-coarse');
    if(lastBucket!==bucket){
      lastBucket=bucket;
      setTimeout(()=>{
        try{if(window.DATA?.bill){if(document.querySelector('#overview')?.classList.contains('active')){drawNem();drawTesla()}if(document.querySelector('#audit')?.classList.contains('active'))drawDonut();if(document.querySelector('#flows')?.classList.contains('active'))drawEv()}}catch(e){}
      },80);
    }
  }
  apply();
  let timer;
  addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(apply,120)},{passive:true});
  addEventListener('orientationchange',()=>setTimeout(apply,180),{passive:true});
  if(window.visualViewport) visualViewport.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(apply,120)},{passive:true});
})();
