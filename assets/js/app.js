/*
 * Rift Transfers — carte des rosters des grandes équipes aux Worlds de League of Legends.
 * Les données viennent de /data (format décrit dans CONTRIBUTING.md) ; ce fichier ne contient que le rendu.
 */

// ---------- chargement des données ----------
const ROLES = ["top", "jgl", "mid", "bot", "sup"];           // clés internes (classes CSS)
const ROLE_KEYS = ["top", "jungle", "mid", "bot", "support"]; // clés du JSON
const ROLE_NAME = { top: "Top", jgl: "Jungle", mid: "Mid", bot: "Bot", sup: "Support" };

async function loadJSON(name) {
  const res = await fetch(`data/${name}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`data/${name}.json : HTTP ${res.status}`);
  return res.json();
}

let TEAMS_DATA, RESULTS_DATA, PLAYERS_DATA;
try {
  [TEAMS_DATA, RESULTS_DATA, PLAYERS_DATA] = await Promise.all(["teams", "results", "players"].map(loadJSON));
} catch (err) {
  const box = document.getElementById("loadError");
  box.hidden = false;
  box.querySelector("code").textContent = String(err.message || err);
  throw err;
}

// ALL_YEARS : toutes les éditions, qui servent aux statistiques.
// YEARS : la plage affichée, recalculée à chaque rendu par le filtre de période.
const ALL_YEARS = TEAMS_DATA.years;
let YEARS = ALL_YEARS;
const REGIONS = TEAMS_DATA.regions;
const RES = RESULTS_DATA.results;
const RES_LABEL = RESULTS_DATA.labels;
const ONGOING_YEAR = RESULTS_DATA.ongoingYear ?? null;
const HOME = PLAYERS_DATA.homeCountries;
const NAT = {};
for (const [name, code] of Object.entries(PLAYERS_DATA.nationality)) NAT[name.toLowerCase()] = code;

// Une « apparition » = un joueur, une équipe, une édition des Worlds.
// Un poste partagé par deux joueurs qui franchissent tous deux le seuil de 20 % (`split`)
// produit **deux** apparitions, affichées en deux demi-cases ciblables ; une rotation restée
// sous le seuil n'en produit qu'une, et reste signalée par la marque `*`.
const teams = [], players = new Map(), apps = [];
TEAMS_DATA.teams.forEach((td, ti) => {
  const t = { code: td.code, name: td.name, region: td.region, label: td.label, tag: td.tag, i: ti, active: td.active || [], years: {} };
  for (const [yearKey, entry] of Object.entries(td.worlds)) {
    const year = +yearKey, alias = entry.name || null;
    const split = entry.split || [], all = [];
    const slots = ROLE_KEYS.map((roleKey, ri) => {
      const second = entry.shared?.[roleKey] || null;
      const partage = split.includes(roleKey) && second;
      const noms = partage ? [entry.lineup[roleKey], second] : [entry.lineup[roleKey]];
      const faits = noms.map((name, half) => {
        // L'identité reste la graphie canonique : le pseudo d'époque ne change que l'affichage,
        // pour que le fil de carrière ne soit pas scindé.
        const id = name.toLowerCase();
        if (!players.has(id)) players.set(id, { id, name, apps: [] });
        const a = {
          id, name, shown: entry.aliases?.[name] || name, ri, year, alias, team: t, role: ROLES[ri],
          half, halves: noms.length,
          alt: partage ? null : second,
          doubt: (entry.unverified || []).includes(roleKey),
        };
        players.get(id).apps.push(a); apps.push(a); all.push(a);
        return a;
      });
      return faits[0];
    });
    t.years[year] = { alias, slots, all };
  }
  teams.push(t);
});
players.forEach(p => p.apps.sort((a, b) => a.year - b.year || a.half - b.half));

const isImport = a => NAT[a.id] && !HOME[a.team.region].includes(NAT[a.id]);
// ancienneté : n-ième Worlds du joueur avec cette équipe
players.forEach(p => { const c = {}; p.apps.forEach(a => { c[a.team.code] = (c[a.team.code] || 0) + 1; a.sen = c[a.team.code]; }); });

// ---------- rendu ----------
const CW=132, STEP=24, CH=20, TOPPAD=30, ROWH=250, OTHER_MAX_ROWS=8;
const PADX=8, chipW=CW-PADX*2;
const KMIN=0.15, KMAX=2.5;
const $=id=>document.getElementById(id);
const vp=$("vp"), world=$("world"), hdr=$("hdr"), rail=$("rail");
const yTop=y=>YEARS.indexOf(y)*ROWH+TOPPAD;
const regionVar=r=>`var(--${r.toLowerCase()})`;
const shortName=t=>t.label||t.code;
let H=YEARS.length*ROWH+20;
// Dix voies de courbe au lieu de cinq : deux par poste, sinon les deux fils d'une case
// partagée se superposeraient.
const laneAt=(cx,ri,half)=>cx+14+(2*ri+half)*((chipW-28)/9);
// Fenêtre d'existence de l'organisation, bornée par la plage affichée.
const activeSpan=t=>[Math.max(YEARS[0],t.active[0]??YEARS[0]),Math.min(YEARS.at(-1),t.active[1]??Infinity)];

const state={roles:new Set(ROLES),regions:new Set(REGIONS),showNat:false,showSen:false,teamMode:"players",pinned:null,pinnedTeam:null,hover:null,
  yearFrom:ALL_YEARS[0],yearTo:ALL_YEARS.at(-1)};
const view={x:0,y:0,k:1};
let nodesByPlayer=new Map(), hasOther=false, W=0, cols=[];

// ---------- rendu de la carte ----------
function render(){
  YEARS=ALL_YEARS.filter(y=>y>=state.yearFrom&&y<=state.yearTo);
  H=YEARS.length*ROWH+20;
  const inRange=a=>a.year>=state.yearFrom&&a.year<=state.yearTo;

  // « Autres régions » n'accueille que les régions masquées. Une équipe écartée par la
  // période ne doit pas y tomber : les deux tests restent séparés.
  const parRegion=teams.filter(t=>state.regions.has(t.region));
  const vis=parRegion.filter(t=>YEARS.some(y=>t.years[y]));
  const visSet=new Set(vis);
  // La colonne n'apparaît que si elle a quelque chose à montrer : un joueur présent dans une
  // colonne visible **et** dans une région masquée, sur la plage affichée. Sans ce test, masquer
  // la LMS sur 2020–2026 ouvrirait une colonne vide, la région n'y ayant aucune rangée.
  hasOther=[...players.values()].some(p=>{
    const dans=p.apps.filter(inRange);
    return dans.some(a=>visSet.has(a.team))&&dans.some(a=>!state.regions.has(a.team.region));
  });
  const colX=new Map(); let x=0;
  vis.forEach(t=>{colX.set(t,x); x+=CW;});
  const otherX=x; W=x+(hasOther?CW*2:0);
  cols=vis.map(t=>({t,x:colX.get(t),w:CW}));
  if(hasOther) cols.push({other:true,x:otherX,w:CW*2});

  nodesByPlayer=new Map();
  const otherByYear={};
  players.forEach(p=>{
    const dans=p.apps.filter(inRange);
    if(!dans.some(a=>colX.has(a.team))) return;
    nodesByPlayer.set(p.id,dans.map(a=>{
      if(colX.has(a.team)){
        const cx=colX.get(a.team)+PADX, w=chipW/a.halves;
        return {a,x:cx+a.half*w,w,y:yTop(a.year)+a.ri*STEP,lane:laneAt(cx,a.ri,a.half),bottom:yTop(a.year)+5*STEP};
      }
      const n={a,other:true,w:chipW}; (otherByYear[a.year]??=[]).push(n); return n;
    }));
  });
  Object.entries(otherByYear).forEach(([y,list])=>{
    list.sort((m,n)=>m.a.ri-n.a.ri||m.a.half-n.a.half||m.a.name.localeCompare(n.a.name));
    const rows=Math.min(OTHER_MAX_ROWS,Math.max(5,Math.ceil(list.length/2)));
    list.forEach((n,k)=>{
      const cx=otherX+PADX+Math.floor(k/rows)*CW;
      n.x=cx; n.y=yTop(+y)+(k%rows)*STEP; n.lane=laneAt(cx,n.a.ri,n.a.half);
      n.bottom=yTop(+y)+Math.min(rows,list.length)*STEP;
    });
  });

  let html="";
  // Le fond de colonne est borné par la fenêtre d'activité de l'organisation : avant sa
  // création et après sa disparition, la colonne est repliée.
  cols.forEach(c=>{
    if(c.other){ html+=`<div class="colbg other" style="left:${c.x}px;width:${c.w}px;height:${H}px"></div>`; return; }
    const [from,to]=activeSpan(c.t);
    const ys=YEARS.filter(y=>y>=from&&y<=to);
    if(!ys.length) return;
    const top=yTop(ys[0])-70, bottom=yTop(ys.at(-1))+ROWH-70;
    html+=`<div class="colbg" style="left:${c.x}px;top:${Math.max(0,top)}px;width:${c.w}px;height:${Math.min(H,bottom)-Math.max(0,top)}px"></div>`;
  });
  YEARS.forEach((y,j)=>{ if(j) html+=`<div class="yrule" style="top:${yTop(y)-70}px;width:${W}px"></div>`; });
  let paths="";
  nodesByPlayer.forEach((ns,id)=>{
    for(let k=1;k<ns.length;k++){
      const A=ns[k-1], B=ns[k];
      const x1=A.lane,y1=A.y+CH/2,x2=B.lane,y2=B.y+CH/2,b0=A.bottom,t1=yTop(B.a.year)-6,m=(t1-b0)*.55;
      paths+=`<path class="l ${B.a.role} ${A.a.team===B.a.team?"same":"move"}" data-p="${id}" data-k="${id}:${k}" data-r="${B.a.role}" d="M${x1},${y1} L${x1},${b0} C${x1},${b0+m} ${x2},${t1-m} ${x2},${t1} L${x2},${y2}"/>`;
    }
  });
  html+=`<svg width="${W}" height="${H}" aria-hidden="true">${paths}</svg>`;
  vis.forEach(t=>{
    const [from,to]=activeSpan(t);
    YEARS.forEach(y=>{
      const e=t.years[y], cx=colX.get(t)+PADX, top=yTop(y);
      // Hors de la fenêtre d'activité, rien n'est dessiné : l'org n'existait pas encore,
      // ou plus. « Pas aux Worlds » ne vaut que pendant son existence.
      if(!e){ if(y>=from&&y<=to) html+=`<div class="absent" style="left:${cx}px;top:${top}px;width:${chipW}px;height:${5*STEP-4}px">Pas aux Worlds</div>`; return; }
      const r=RES[y]?.[t.code];
      if(e.alias) html+=`<div class="alias" style="left:${cx}px;top:${top-16}px;width:${r?chipW-56:chipW}px">${e.alias}</div>`;
      if(r) html+=`<div class="res${r==="W"?" win":""}" style="left:${cx}px;top:${top-16}px;width:${chipW}px">${RES_LABEL[r]}</div>`;
    });
  });
  nodesByPlayer.forEach(ns=>ns.forEach(n=>{
    const a=n.a, label=a.alias||a.team.name, nat=NAT[a.id], demi=a.halves>1;
    const duo=demi?a.team.years[a.year].all.find(b=>b.ri===a.ri&&b!==a):null;
    const tip=`${a.name}${a.shown!==a.name?` (${a.shown} à l'époque)`:""}${nat?" ("+nat+")":""} · ${ROLE_NAME[a.role]} · ${label} ${a.year}`
      +(a.sen>1?` · ${a.sen}e Worlds avec l'équipe`:"")
      +(duo?` · poste partagé avec ${duo.name}`:"")+(a.alt?` · rotation avec ${a.alt}`:"")+(a.doubt?" · à vérifier":"");
    const mark=n.other?`<span class="t">${a.team.tag||a.team.code}</span>`:(a.alt||a.doubt?`<span class="q">${a.doubt?"?":"*"}</span>`:"");
    html+=`<div class="chip${demi?" half":""}${demi&&a.half?" right":""}" data-p="${a.id}" data-c="${a.id}:${a.year}" data-r="${a.role}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;--s:${Math.min(a.sen-1,5)*11}%" title="${tip}"><span class="r ${a.role}"></span>${nat?`<span class="nat${isImport(a)?" imp":""}">${nat}</span>`:""}<span class="n">${a.shown}</span>${a.sen>1?`<span class="sen">${a.sen}e</span>`:""}${mark}</div>`;
  }));
  world.style.width=W+"px"; world.style.height=H+"px";
  world.innerHTML=html;

  hdr.innerHTML=cols.map(c=>c.other
    ?`<div class="th other" data-x="${c.x}" data-w="${c.w}" title="Équipes des régions masquées"><span class="rg">${REGIONS.filter(r=>!state.regions.has(r)).join(" · ")}</span><span class="tn">Autres régions</span></div>`
    :`<div class="th" data-team="${c.t.code}" data-x="${c.x}" data-w="${c.w}" title="${c.t.name}"><span class="rg"><b style="background:${regionVar(c.t.region)}"></b>${c.t.region}</span><span class="tn">${shortName(c.t)}</span></div>`).join("");
  rail.innerHTML=YEARS.map(y=>`<div class="ylab" data-y="${yTop(y)+2.5*STEP}">${y}${y===ONGOING_YEAR?"<small>EN COURS</small>":""}</div>`).join("");
  if(state.pinnedTeam&&!vis.some(t=>t.code===state.pinnedTeam)) state.pinnedTeam=null;
  applyView(); apply();
}

// ---------- navigation : déplacement et zoom ----------
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function clampView(){
  const w=vp.clientWidth, h=vp.clientHeight, m=160;
  view.x=clamp(view.x, Math.min(w-W*view.k-m, m), m);
  view.y=clamp(view.y, Math.min(h-H*view.k-m, m+60), m+60);
}
let settle=null;
function applyView(){
  clampView();
  world.classList.add("moving"); clearTimeout(settle);
  settle=setTimeout(()=>world.classList.remove("moving"),160);
  world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.k})`;
  hdr.querySelectorAll(".th").forEach(th=>{th.style.left=(view.x+(+th.dataset.x)*view.k)+"px"; th.style.width=((+th.dataset.w)*view.k)+"px";});
  rail.querySelectorAll(".ylab").forEach(l=>l.style.top=(view.y+(+l.dataset.y)*view.k)+"px");
  $("zpct").textContent=Math.round(view.k*100)+"%";
}
function zoomAt(px,py,f){
  const k2=clamp(view.k*f,KMIN,KMAX), r=k2/view.k;
  view.x=px-(px-view.x)*r; view.y=py-(py-view.y)*r; view.k=k2; applyView();
}
let anim=null;
function animateTo(t){
  cancelAnimationFrame(anim);
  const s={...view}, t0=performance.now(), d=matchMedia("(prefers-reduced-motion: reduce)").matches?0:320;
  const step=now=>{
    const p=d?Math.min(1,(now-t0)/d):1, e=1-Math.pow(1-p,3);
    view.x=s.x+(t.x-s.x)*e; view.y=s.y+(t.y-s.y)*e; view.k=s.k+(t.k-s.k)*e; applyView();
    if(p<1) anim=requestAnimationFrame(step);
  };
  anim=requestAnimationFrame(step);
}
function fitAll(){
  const w=vp.clientWidth, h=vp.clientHeight, k=clamp(Math.min(w/(W+40),(h-70)/(H+20)),KMIN,1);
  animateTo({k,x:(w-W*k)/2,y:60+(h-60-H*k)/2});
}
function centerOn(x,y,k=Math.max(view.k,.9)){
  animateTo({k,x:vp.clientWidth/2-x*k,y:vp.clientHeight/2-y*k});
}
$("zin").onclick=()=>zoomAt(vp.clientWidth/2,vp.clientHeight/2,1.25);
$("zout").onclick=()=>zoomAt(vp.clientWidth/2,vp.clientHeight/2,0.8);
$("zfit").onclick=fitAll;

vp.addEventListener("wheel",e=>{
  e.preventDefault();
  const r=vp.getBoundingClientRect(), px=e.clientX-r.left, py=e.clientY-r.top;
  const dy=e.deltaMode===1?e.deltaY*16:e.deltaY, dx=e.deltaMode===1?e.deltaX*16:e.deltaX;
  const mouseWheel=e.deltaMode!==0||(dx===0&&Math.abs(dy)>=50&&Number.isInteger(dy));
  if(e.ctrlKey||e.metaKey) zoomAt(px,py,Math.exp(-dy*0.01));
  else if(mouseWheel) zoomAt(px,py,Math.exp(-dy*0.0016));
  else { view.x-=e.shiftKey&&!dx?dy:dx; view.y-=e.shiftKey&&!dx?0:dy; applyView(); }
},{passive:false});

const ptrs=new Map(); let drag=null;
vp.addEventListener("dragstart",e=>e.preventDefault());
vp.addEventListener("pointerdown",e=>{
  if(e.button!==0&&e.pointerType==="mouse") return;
  if(e.pointerType==="mouse"){ e.preventDefault(); vp.focus({preventScroll:true}); }
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===1) drag={sx:e.clientX,sy:e.clientY,vx:view.x,vy:view.y,moved:false,target:e.target};
  else { drag&&(drag.moved=true); pinch=pinchState(); }
});
let pinch=null;
function pinchState(){
  const [a,b]=[...ptrs.values()];
  return {d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2,k:view.k,vx:view.x,vy:view.y};
}
addEventListener("pointermove",e=>{
  if(!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const r=vp.getBoundingClientRect();
  if(ptrs.size>=2&&pinch){
    const [a,b]=[...ptrs.values()], d=Math.hypot(a.x-b.x,a.y-b.y), mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    const k2=clamp(pinch.k*d/pinch.d,KMIN,KMAX), px=pinch.mx-r.left, py=pinch.my-r.top;
    view.k=k2; view.x=px-(px-pinch.vx)*(k2/pinch.k)+(mx-pinch.mx); view.y=py-(py-pinch.vy)*(k2/pinch.k)+(my-pinch.my); applyView();
  } else if(drag){
    const dx=e.clientX-drag.sx, dy=e.clientY-drag.sy;
    if(!drag.moved&&Math.hypot(dx,dy)>5){drag.moved=true; vp.classList.add("drag"); if(state.hover){state.hover=null; apply();}}
    if(drag.moved){view.x=drag.vx+dx; view.y=drag.vy+dy; applyView();}
  }
});
function endPtr(e){
  if(!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if(ptrs.size<2) pinch=null;
  if(ptrs.size===0&&drag){
    vp.classList.remove("drag");
    if(!drag.moved&&e.type==="pointerup") tap(drag.target);
    drag=null;
  } else if(ptrs.size===1&&drag){ const p=[...ptrs.values()][0]; drag.sx=p.x; drag.sy=p.y; drag.vx=view.x; drag.vy=view.y; }
}
addEventListener("pointerup",endPtr); addEventListener("pointercancel",endPtr);
vp.addEventListener("keydown",e=>{
  const s=60;
  if(e.key==="+"||e.key==="=") zoomAt(vp.clientWidth/2,vp.clientHeight/2,1.2);
  else if(e.key==="-") zoomAt(vp.clientWidth/2,vp.clientHeight/2,1/1.2);
  else if(e.key==="ArrowLeft"){view.x+=s;applyView();} else if(e.key==="ArrowRight"){view.x-=s;applyView();}
  else if(e.key==="ArrowUp"){view.y+=s;applyView();} else if(e.key==="ArrowDown"){view.y-=s;applyView();}
  else return; e.preventDefault();
});
addEventListener("resize",()=>applyView());

// ---------- sélection ----------
function tap(target){
  const c=target.closest&&target.closest(".chip");
  if(c){ state.pinnedTeam=null; state.pinned=c.dataset.p; state.hover=null; }
  else { state.pinned=null; state.pinnedTeam=null; state.hover=null; }
  apply();
}
world.addEventListener("mouseover",e=>{const c=e.target.closest(".chip"); if(c&&!drag&&!state.pinned&&!state.pinnedTeam&&matchMedia("(hover:hover)").matches){state.hover=c.dataset.p;apply();}});
world.addEventListener("mouseout",e=>{if(e.target.closest(".chip")&&state.hover){state.hover=null;apply();}});
hdr.addEventListener("click",e=>{const th=e.target.closest(".th[data-team]"); if(!th) return; state.pinned=null; state.hover=null; state.pinnedTeam=state.pinnedTeam===th.dataset.team?null:th.dataset.team; apply();});
$("selClose").onclick=()=>{state.pinned=null; state.pinnedTeam=null; state.hover=null; $("q").value=""; apply();};

function lineage(code){
  const paths=new Set(), chips=new Set(), from={}, to={}; let debut=0;
  players.forEach(p=>p.apps.forEach((a,k)=>{
    if(a.team.code!==code) return;
    chips.add(`${p.id}:${a.year}`);
    const prev=p.apps[k-1], next=p.apps[k+1];
    if(!prev) debut++;
    else if(prev.team.code!==code){ paths.add(`${p.id}:${k}`); chips.add(`${p.id}:${prev.year}`); (from[shortName(prev.team)]??=[]).push(p.name); }
    if(next&&next.team.code!==code){ paths.add(`${p.id}:${k+1}`); chips.add(`${p.id}:${next.year}`); (to[shortName(next.team)]??=[]).push(p.name); }
    if(next&&next.team.code===code) paths.add(`${p.id}:${k+1}`);
  }));
  return {paths,chips,from,to,debut};
}
const fmtFlow=o=>Object.entries(o).sort((a,b)=>b[1].length-a[1].length).map(([t,l])=>`<span title="${l.join(", ")}">${t} <span class="hint">×${l.length}</span></span>`).join(", ")||`<span class="hint">aucun</span>`;

function apply(){
  const {hover,pinned,pinnedTeam}=state;
  const lin=!hover&&!pinned&&pinnedTeam&&state.teamMode==="lineage"?lineage(pinnedTeam):null;
  const ids=hover?new Set([hover]):pinned?new Set([pinned]):(pinnedTeam&&!lin)?new Set(apps.filter(a=>a.team.code===pinnedTeam).map(a=>a.id)):null;
  world.classList.toggle("focus",!!ids||!!lin);
  world.classList.toggle("showNat",state.showNat);
  world.classList.toggle("showSen",state.showSen);
  world.querySelectorAll("[data-p]").forEach(el=>{
    const isPath=el.tagName==="path";
    el.classList.toggle("hl",lin?(isPath?lin.paths.has(el.dataset.k):lin.chips.has(el.dataset.c)):(!!ids&&ids.has(el.dataset.p)));
    el.classList.toggle(isPath?"roff":"off",!state.roles.has(el.dataset.r));
  });
  hdr.querySelectorAll(".th").forEach(th=>th.classList.toggle("on",!!pinnedTeam&&th.dataset.team===pinnedTeam));
  const sel=$("sel"), out=$("selText"), show=hover||pinned;
  if(show){
    const p=players.get(show), steps=[], nat=NAT[p.id];
    p.apps.forEach(a=>{
      const label=a.alias||a.team.name, last=steps[steps.length-1];
      if(last&&last.label===label&&last.role===a.role&&last.to===a.year-1) last.to=a.year;
      else steps.push({label,role:a.role,from:a.year,to:a.year});
    });
    out.innerHTML=`<b class="nm">${p.name}</b>${nat?`<span class="hint">${nat} · </span>`:""}${steps.map(s=>`${s.label} <span class="hint">${s.from===s.to?s.from:s.from+"–"+s.to} · ${ROLE_NAME[s.role]}</span>`).join(" → ")}`;
  } else if(lin){
    const t=teams.find(t=>t.code===pinnedTeam);
    out.innerHTML=`<b class="nm">${t.name}</b><span class="hint">Arrivées et départs</span><br>Arrivées depuis : ${fmtFlow(lin.from)}<br>Départs vers : ${fmtFlow(lin.to)} <span class="hint">· ${lin.debut} premiers Worlds ici</span>`;
  } else if(pinnedTeam){
    const t=teams.find(t=>t.code===pinnedTeam), n=new Set(apps.filter(a=>a.team===t).map(a=>a.id)).size;
    out.innerHTML=`<b class="nm">${t.name}</b><span class="hint">${n} joueurs titulaires aux Worlds depuis 2013, carrières complètes surlignées.</span>`;
  }
  sel.hidden=!(show||pinnedTeam);
  $("selClose").hidden=!!hover&&!pinned;
  renderLegend(!!lin);
}

function renderLegend(lin){
  const L=[];
  L.push(`<span><svg width="30" height="10"><line x1="2" y1="5" x2="28" y2="5" stroke="currentColor" stroke-width="1.8"/></svg> changement d'équipe, coloré par poste</span>`);
  L.push(`<span><span class="lg-half"><i></i><i></i></span> poste tenu par deux joueurs, chacun ciblable · <b>*</b> rotation ponctuelle (survol pour le nom)${apps.some(a=>a.doubt)?" · <b>?</b> à vérifier":""}</span>`);
  L.push(`<span><span class="lg-res">Quarts · Demi · Finale</span> parcours de l'équipe · <b style="color:var(--bot)">★ Vainqueur</b></span>`);
  if(state.showNat) L.push(`<span><span class="lg-nat">KR</span> nationalité · <span class="lg-nat" style="color:var(--accent);border-color:var(--accent)">KR</span> joueur importé</span>`);
  if(state.showSen) L.push(`<span><span class="senbar"></span> 1er → 6e Worlds avec l'équipe</span>`);
  if(hasOther) L.push(`<span>Autres régions : joueurs des régions masquées</span>`);
  if(lin) L.push(`<span>Arrivées et départs : club d'avant et club d'après</span>`);
  L.push(`<span>Glisser pour se déplacer · molette ou pincer pour zoomer</span>`);
  $("legendBody").innerHTML=L.join("");
}

// ---------- recherche ----------
function selectPlayer(id){
  state.pinned=id; state.pinnedTeam=null; state.hover=null; apply();
  const n=nodesByPlayer.get(id)?.[0];
  if(n) centerOn(n.x+chipW/2,n.y+(nodesByPlayer.get(id).at(-1).y-n.y)/2,Math.min(1,Math.max(.45,vp.clientHeight/((nodesByPlayer.get(id).at(-1).y-n.y)+300))));
}
const q=$("q");
// Un joueur renommé se cherche aussi sous le pseudo qu'il portait à l'époque.
const searchIndex=new Map();
players.forEach(p=>{
  searchIndex.set(p.name.toLowerCase(),p.id);
  p.apps.forEach(a=>{ if(a.shown!==a.name) searchIndex.set(a.shown.toLowerCase(),p.id); });
});
$("plist").innerHTML=[...searchIndex.keys()].map(k=>{
  const p=players.get(searchIndex.get(k));
  const nom=p.name.toLowerCase()===k?p.name:p.apps.find(a=>a.shown.toLowerCase()===k).shown;
  return [nom,p];
}).sort((a,b)=>a[0].localeCompare(b[0])).map(([nom,p])=>`<option value="${nom}">${nom===p.name?"":p.name}</option>`).join("");
q.addEventListener("input",()=>{const id=searchIndex.get(q.value.trim().toLowerCase()); if(id){ selectPlayer(id); q.blur(); }});

// ---------- tiroirs ----------
function setDrawer(id,open){
  const d=$(id); d.classList.toggle("open",open);
  $(id==="filters"?"openFilters":"openStats").setAttribute("aria-expanded",open);
  if(!open) closeTip();
}
$("openFilters").onclick=()=>{const o=!$("filters").classList.contains("open"); if(o&&innerWidth<900) setDrawer("statsDrawer",false); setDrawer("filters",o);};
$("openStats").onclick=()=>{const o=!$("statsDrawer").classList.contains("open"); if(o&&innerWidth<900) setDrawer("filters",false); setDrawer("statsDrawer",o);};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>setDrawer(b.dataset.close,false));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){ if(!$("modeTip").hidden) closeTip(); else {setDrawer("filters",false); setDrawer("statsDrawer",false);} }});

function pill(container,label,color,on,onToggle,cls="pill"){
  const b=document.createElement("button"); b.type="button"; b.className=cls; b.setAttribute("aria-pressed",on);
  b.innerHTML=(color?`<i style="background:${color}"></i>`:"")+label;
  b.onclick=()=>b.setAttribute("aria-pressed",onToggle());
  container.appendChild(b); return b;
}
// ---------- filtre de période ----------
const yFrom=$("yFrom"), yTo=$("yTo");
// La coupure tombe en 2020, année où la LMS cesse d'être une région majeure : c'est la
// rupture la plus nette du jeu de données après 2015 — 38 % de joueurs communs entre 2019 et
// 2020, et 7 organisations entrantes pour 7 sortantes.
const ERAS=[
  ["Tout",ALL_YEARS[0],ALL_YEARS.at(-1),"Les 14 éditions, de 2013 à 2026"],
  ["Ère moderne",2020,ALL_YEARS.at(-1),"Depuis 2020 : quatre régions majeures, la LMS ayant fusionné dans la PCS"],
  ["Ère historique",ALL_YEARS[0],2019,"2013 à 2019 : la LMS est encore une cinquième région majeure"],
];
function remplirAnnees(){
  // La borne haute ne propose que des années ≥ borne basse, et réciproquement.
  const opt=(y,sel)=>`<option value="${y}"${y===sel?" selected":""}>${y}</option>`;
  yFrom.innerHTML=ALL_YEARS.filter(y=>y<=state.yearTo).map(y=>opt(y,state.yearFrom)).join("");
  yTo.innerHTML=ALL_YEARS.filter(y=>y>=state.yearFrom).map(y=>opt(y,state.yearTo)).join("");
  eraBtns.forEach((b,i)=>b.setAttribute("aria-pressed",state.yearFrom===ERAS[i][1]&&state.yearTo===ERAS[i][2]));
}
function setPeriode(from,to){
  state.yearFrom=Math.min(from,to); state.yearTo=Math.max(from,to);
  state.pinnedTeam=null; state.hover=null;
  remplirAnnees(); render();
}
const eraBtns=ERAS.map(([label,from,to,aide])=>{
  const texte=from===ALL_YEARS[0]&&to===ALL_YEARS.at(-1)?label:`${label} <span class="hint">${from===ALL_YEARS[0]?"→ "+to:from+" →"}</span>`;
  const b=pill($("eras"),texte,null,false,()=>{setPeriode(from,to); return true;},"pill mode");
  b.title=aide; return b;
});
yFrom.addEventListener("change",()=>setPeriode(+yFrom.value,state.yearTo));
yTo.addEventListener("change",()=>setPeriode(state.yearFrom,+yTo.value));

ROLES.forEach(r=>pill($("roles"),ROLE_NAME[r],`var(--${r})`,true,()=>{state.roles.has(r)?state.roles.delete(r):state.roles.add(r); apply(); return state.roles.has(r);}));
REGIONS.forEach(r=>pill($("regions"),r,regionVar(r),true,()=>{
  if(state.regions.has(r)){ if(state.regions.size===1) return true; state.regions.delete(r); } else state.regions.add(r);
  render(); return state.regions.has(r);
}));
const MODE_TIP={players:"Surligne tous les joueurs passés par l'équipe, avec toute leur carrière",lineage:"Ne garde que le club juste avant l'arrivée et le club juste après le départ"};
const modeBtns=[["players","Carrières complètes"],["lineage","Arrivées et départs"]].map(([m,l])=>{
  const b=pill($("teamMode"),l,null,m==="players",()=>{state.teamMode=m; modeBtns.forEach(x=>x.setAttribute("aria-pressed",x===b)); apply(); return true;},"pill mode");
  b.title=MODE_TIP[m]; return b;
});
[["optNat","showNat"],["optSen","showSen"]].forEach(([id,k])=>$(id).addEventListener("change",e=>{state[k]=e.target.checked; apply();}));

const modeInfo=$("modeInfo"), modeTip=$("modeTip");
function closeTip(){ if(!modeTip.hidden){modeTip.hidden=true; modeInfo.setAttribute("aria-expanded","false");} }
modeInfo.addEventListener("click",e=>{
  e.stopPropagation();
  if(!modeTip.hidden) return closeTip();
  modeTip.hidden=false; modeInfo.setAttribute("aria-expanded","true");
  const r=modeInfo.getBoundingClientRect(), w=modeTip.offsetWidth;
  modeTip.style.top=(r.bottom+8)+"px"; modeTip.style.left=Math.max(12,Math.min(r.left-12,innerWidth-w-12))+"px";
});
document.addEventListener("click",e=>{if(!modeTip.hidden&&!e.target.closest("#modeTip,#modeInfo")) closeTip();});
$("filters").querySelector(".dbody").addEventListener("scroll",closeTip,{passive:true});

// ---------- statistiques ----------
(function stats(){
  const plist=[...players.values()];
  const btn=p=>`<button type="button" class="pl" data-id="${p.id}">${p.name}</button>`;
  const most=plist.map(p=>({p,n:p.apps.length})).sort((a,b)=>b.n-a.n||a.p.name.localeCompare(b.p.name)).slice(0,10);
  const trav=plist.map(p=>({p,n:new Set(p.apps.map(a=>a.team.code)).size})).filter(x=>x.n>=3).sort((a,b)=>b.n-a.n||b.p.apps.length-a.p.apps.length).slice(0,10);
  const stable=[];
  teams.forEach(t=>{
    const ys=ALL_YEARS.filter(y=>t.years[y]); let run=[ys[0]];
    const sig=y=>t.years[y].slots.map(a=>a.id).join(",");
    for(let i=1;i<=ys.length;i++){
      const y=ys[i];
      if(y===run[run.length-1]+1&&sig(y)===sig(run[0])) run.push(y);
      else { if(run.length>=2) stable.push({t,from:run[0],to:run[run.length-1],n:run.length,names:t.years[run[0]].slots.map(a=>a.name).join(", ")}); run=[y]; }
    }
  });
  stable.sort((a,b)=>b.n-a.n||a.from-b.from);
  const flow={}; REGIONS.forEach(a=>{flow[a]={}; REGIONS.forEach(b=>flow[a][b]=0);});
  plist.forEach(p=>p.apps.forEach((a,k)=>{const b=p.apps[k+1]; if(b&&b.team!==a.team) flow[a.team.region][b.team.region]++;}));
  const fmax=Math.max(...REGIONS.flatMap(a=>REGIONS.map(b=>flow[a][b])));
  const imp={}; REGIONS.forEach(r=>{imp[r]={}; ALL_YEARS.forEach(y=>{
    const s=apps.filter(a=>a.year===y&&a.team.region===r);
    imp[r][y]=s.length?{i:s.filter(isImport).length,n:s.length}:null;
  });});
  let h=`<div class="st"><h3>Le plus de Worlds</h3><ol>${most.map(x=>`<li>${btn(x.p)}<span class="v">${x.n}</span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>Plus grands voyageurs</h3><p class="note">Nombre d'équipes différentes parmi celles suivies</p><ol>${trav.map(x=>`<li>${btn(x.p)}<span class="v">${x.n} équipes</span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>Rosters inchangés</h3><p class="note">Même cinq titulaires sur des Worlds consécutifs</p><ol>${stable.map(s=>`<li><span><b>${shortName(s.t)}</b> ${s.from}–${s.to}<br><span class="note">${s.names}</span></span><span class="v">${s.n} ans</span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>Flux entre régions</h3><p class="note">Changements d'équipe d'un Worlds à l'autre. Ligne : région quittée, colonne : région rejointe.</p><div class="tw"><table class="fl"><tr><th></th>${REGIONS.map(r=>`<th>→ ${r}</th>`).join("")}</tr>${REGIONS.map(a=>`<tr><th>${a}</th>${REGIONS.map(b=>`<td style="--a:${Math.round(flow[a][b]/fmax*70)}%">${flow[a][b]||"·"}</td>`).join("")}</tr>`).join("")}</table></div></div>`;
  h+=`<div class="st"><h3>Joueurs importés</h3><p class="note">Titulaires dont la nationalité n'est pas celle de la région de l'équipe</p><div class="tw"><table class="fl"><tr><th></th>${ALL_YEARS.map(y=>`<th>${String(y).slice(2)}</th>`).join("")}</tr>${REGIONS.map(r=>`<tr><th>${r}</th>${ALL_YEARS.map(y=>{const c=imp[r][y]; return c?`<td style="--a:${Math.round(c.i/c.n*90)}%">${c.i}<small>/${c.n}</small></td>`:`<td class="na">–</td>`;}).join("")}</tr>`).join("")}</table></div></div>`;
  const box=$("stats"); box.innerHTML=h;
  box.addEventListener("click",e=>{const b=e.target.closest(".pl"); if(!b) return; if(innerWidth<900) setDrawer("statsDrawer",false); selectPlayer(b.dataset.id);});
})();

// ---------- démarrage ----------
if(innerWidth<700) $("legend").open=false;
remplirAnnees();
render();
view.k=innerWidth<700?.7:.9; view.x=16; view.y=70; applyView();
