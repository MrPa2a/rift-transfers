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
// Code ISO → nom français. Le badge des chips reste au code à deux lettres, faute de place ;
// seul le panneau de détail a la place d'écrire « Corée du Sud ».
const COUNTRY = PLAYERS_DATA.countryNames || {};
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
const CW=132, STEP=24, CH=20, TOPPAD=30, ROWH=250;
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
// La voie est un **couloir de colonne** : stable par (poste, moitié), elle garantit que deux
// lignes de postes différents ne se superposent pas sur le trajet vertical entre deux années.
// On ne la déplace donc pas. Mais les dix voies sont réparties sur la largeur *pleine* de la
// chip, alors qu'une demi-case n'occupe que [0, 58] ou [58, 116] : pour top droite, jungle
// droite, bot gauche et support gauche, la voie tombe hors de la chip et la ligne semblait
// sortir de sous le nom voisin. On corrige l'attache — le point de départ et d'arrivée passe
// au centre de la chip, rejoint par un court coude — et le couloir reste intact.
const ELBOW=14;
const attache=n=>n.lane>=n.x&&n.lane<=n.x+n.w?n.lane:n.x+n.w/2;
// Fenêtre d'existence de l'organisation, bornée par la plage affichée.
const activeSpan=t=>[Math.max(YEARS[0],t.active[0]??YEARS[0]),Math.min(YEARS.at(-1),t.active[1]??Infinity)];

// Année d'ouverture de la carte. Elle n'est **pas** `ALL_YEARS[0]` : les Season 1 et 2
// n'alignent que trois et six équipes suivies, donc 500 px de rangées quasi vides en haut
// de la carte. Elles restent à un clic, par le préréglage « Tout ».
const DEFAULT_FROM=2013;

// Nombre d'apparitions aux Worlds de chaque équipe : c'est la mesure du filtre « Présence ».
const APPS=new Map(teams.map(t=>[t.code,Object.keys(t.years).length]));
// Paliers du filtre, choisis sur la distribution réelle : 120 colonnes au total, 54 à partir
// de deux apparitions, 33 à partir de trois, 19 à partir de cinq. Un curseur continu irait de
// 1 à 13 alors que 87 colonnes sur 120 sont à une ou deux apparitions — il passerait la moitié
// de sa course à ne rien déplacer. La carte s'ouvre sur **toutes** les colonnes : être
// exhaustif est le propos de l'outil, et c'est aux filtres de dégrossir.
const PRESENCE=[1,2,3,5];
const DEFAULT_MIN_APPS=1;

const state={roles:new Set(ROLES),regions:new Set(REGIONS),hiddenTeams:new Set(),minApps:DEFAULT_MIN_APPS,showNat:false,showSen:false,teamMode:"players",pinned:null,pinnedTeam:null,hover:null,
  yearFrom:Math.max(ALL_YEARS[0],DEFAULT_FROM),yearTo:ALL_YEARS.at(-1)};
// Une colonne est affichée si sa région l'est, **et** si elle atteint le seuil de présence,
// **et** si l'équipe n'est pas masquée une à une : les trois filtres se cumulent, chacun
// agissant à l'intérieur du sous-ensemble déjà retenu par les précédents. Une équipe écartée
// par l'un des trois se déverse dans « Autres équipes » exactement comme une région masquée —
// c'est le même prédicat qui décide, partout.
const visible=t=>state.regions.has(t.region)&&APPS.get(t.code)>=state.minApps&&!state.hiddenTeams.has(t.code);
// Et une colonne n'est dessinée que si l'équipe a au moins une édition dans la période : c'est
// ce compte-là, et non `visible` seul, qui dit s'il reste quelque chose à l'écran.
const colonne=t=>visible(t)&&YEARS.some(y=>t.years[y]);
const view={x:0,y:0,k:1};
let nodesByPlayer=new Map(), hasOther=false, W=0, cols=[];

// ---------- rendu de la carte ----------
function render(){
  YEARS=ALL_YEARS.filter(y=>y>=state.yearFrom&&y<=state.yearTo);
  H=YEARS.length*ROWH+20;
  const inRange=a=>a.year>=state.yearFrom&&a.year<=state.yearTo;

  // « Autres équipes » n'accueille que ce qui est masqué — région ou équipe. Une équipe
  // écartée par la période ne doit pas y tomber : les deux tests restent séparés.
  const vis=teams.filter(colonne);
  const visSet=new Set(vis);
  // La colonne n'apparaît que si elle a quelque chose à montrer : un joueur présent dans une
  // colonne visible **et** dans une équipe masquée, sur la plage affichée. Sans ce test, masquer
  // la LMS sur 2020–2026 ouvrirait une colonne vide, la région n'y ayant aucune rangée.
  hasOther=[...players.values()].some(p=>{
    const dans=p.apps.filter(inRange);
    return dans.some(a=>visSet.has(a.team))&&dans.some(a=>!visible(a.team));
  });
  const colX=new Map(); let x=0;
  vis.forEach(t=>{colX.set(t,x); x+=CW;});
  const otherX=x;

  // Une apparition hors colonne n'informe que si elle touche la carte visible : sans ce
  // filtre, un joueur parti pour de bon traîne une chip sur toutes les éditions suivantes,
  // reliées entre elles sans jamais rejoindre une colonne affichée.
  //
  //  - Base : garder l'apparition dont la voisine précédente **ou** suivante tombe dans une
  //    colonne visible.
  //  - Garde-fou : dans un bloc jeté **ponté** — encadré de deux apparitions gardées, donc
  //    traversé par une ligne —, garder en plus une chip par club absent des deux bornes.
  //    Sinon la ligne saute par-dessus un club sans rien dire : Peanut, HLE seule visible,
  //    irait de `2017 T1` à `2023 GEN` en effaçant son année LGD.
  //
  // Un bloc de **fin** ne porte aucune ligne — le fil s'arrête à la chip de départ : on le
  // jette sans rien fausser, et c'est lui qui concentre le bruit. La séquence des clubs reste
  // donc exacte, la durée approximative ; le panneau de détail, qui ne filtre rien, garde les
  // années exactes.
  const retenues=dans=>{
    const vu=dans.map(a=>colX.has(a.team));
    if(vu.every(Boolean)) return dans;
    const garde=vu.map((v,i)=>!!(v||vu[i-1]||vu[i+1]));
    for(let i=0;i<dans.length;i++){
      if(garde[i]) continue;
      let j=i; while(j+1<dans.length&&!garde[j+1]) j++;
      if(i>0&&j<dans.length-1){
        const bornes=new Set([dans[i-1].team,dans[j+1].team]), deja=new Set();
        for(let k=i;k<=j;k++){
          const t=dans[k].team;
          if(!bornes.has(t)&&!deja.has(t)){ deja.add(t); garde[k]=true; }
        }
      }
      i=j;
    }
    return dans.filter((a,i)=>garde[i]);
  };

  nodesByPlayer=new Map();
  const otherByYear={};
  players.forEach(p=>{
    const dans=retenues(p.apps.filter(inRange));
    if(!dans.some(a=>colX.has(a.team))) return;
    nodesByPlayer.set(p.id,dans.map(a=>{
      if(colX.has(a.team)){
        const cx=colX.get(a.team)+PADX, w=chipW/a.halves;
        return {a,x:cx+a.half*w,w,y:yTop(a.year)+a.ri*STEP,lane:laneAt(cx,a.ri,a.half),bottom:yTop(a.year)+5*STEP};
      }
      const n={a,other:true,w:chipW}; (otherByYear[a.year]??=[]).push(n); return n;
    }));
  });
  // Largeur de « Autres » : une sous-colonne par chip simultanée d'un même poste, jamais
  // moins de deux. Les cinq rangées étant désormais indexées par le poste, c'est ce cumul —
  // et non le total de l'année — qui décide de la largeur.
  const parPoste=l=>{const c={}; l.forEach(n=>c[n.a.ri]=(c[n.a.ri]||0)+1); return Math.max(0,...Object.values(c));};
  const otherCols=Math.max(2,...Object.values(otherByYear).map(parPoste));
  W=x+(hasOther?CW*otherCols:0);
  cols=vis.map(t=>({t,x:colX.get(t),w:CW}));
  if(hasOther) cols.push({other:true,x:otherX,w:CW*otherCols});

  Object.entries(otherByYear).forEach(([y,list])=>{
    // La rangée vient du **poste**, comme dans une colonne d'équipe, et non d'un rang dans la
    // liste : sans ça la chip changeait de ligne d'une année à l'autre selon le nombre de
    // voisines, et le fil zigzaguait. Deux joueurs du même poste la même année se rangent en
    // sous-colonnes côte à côte.
    list.sort((m,n)=>m.a.ri-n.a.ri||m.a.half-n.a.half||m.a.name.localeCompare(n.a.name));
    const pris={};
    list.forEach(n=>{
      const cx=otherX+PADX+((pris[n.a.ri]=(pris[n.a.ri]??-1)+1))*CW;
      n.x=cx; n.y=yTop(+y)+n.a.ri*STEP; n.lane=laneAt(cx,n.a.ri,n.a.half);
      n.bottom=yTop(+y)+5*STEP;
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
      const x1=A.lane,y1=A.y+CH/2,x2=B.lane,y2=B.y+CH/2,b0=A.bottom,t1=yTop(B.a.year)-6;
      // Attache : la ligne descend **droit** sous le nom jusqu'au bord bas de la chip, et ne
      // rejoint son couloir qu'une fois dégagée — sinon le coude sort par le côté de la case
      // et on retombe sur le défaut qu'on corrige. Le coude de départ tient entre le bas de la
      // chip et `b0` ; celui d'arrivée au-dessus de son bord haut, dans l'inter-rangée.
      // Pour une chip pleine `attache` renvoie la voie elle-même : tout devient colinéaire et
      // le tracé est identique à celui d'avant, au pixel près.
      const ax=attache(A), bx=attache(B);
      const y0=A.y+CH, yd=Math.min(y0+ELBOW,b0), sd=(yd-y0)*.6;
      const yu=bx===x2?t1:B.y-ELBOW, te=Math.min(t1,yu), su=(B.y-yu)*.6, m=(te-b0)*.55;
      paths+=`<path class="l ${B.a.role} ${A.a.team===B.a.team?"same":"move"}" data-p="${id}" data-k="${id}:${k}" data-r="${B.a.role}" d="M${ax},${y1} L${ax},${y0} C${ax},${y0+sd} ${x1},${yd-sd} ${x1},${yd} L${x1},${b0} C${x1},${b0+m} ${x2},${te-m} ${x2},${te} L${x2},${yu} C${x2},${yu+su} ${bx},${B.y-su} ${bx},${B.y} L${bx},${y2}"/>`;
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

  // Sous-titre de la colonne « Autres équipes » : les régions masquées, puis le nombre
  // d'équipes masquées une à une — celles dont la région, elle, est bien affichée.
  const nMasquees=teams.filter(t=>state.regions.has(t.region)&&!visible(t)).length;
  const dehors=[...REGIONS.filter(r=>!state.regions.has(r)),...(nMasquees?[`${nMasquees} équipe${nMasquees>1?"s":""}`]:[])].join(" · ");
  hdr.innerHTML=cols.map(c=>c.other
    ?`<div class="th other" data-x="${c.x}" data-w="${c.w}" title="Joueurs passés par des équipes qui ne sont pas affichées"><span class="rg">${dehors}</span><span class="tn">Autres équipes</span></div>`
    // Le `×` masque la colonne ; le reste de l'en-tête épingle l'équipe. Deux cibles
    // distinctes, sans quoi les deux gestes se marcheraient dessus. La liste à cocher du
    // tiroir reste la source de vérité — ce bouton n'en est qu'un raccourci.
    :`<div class="th" data-team="${c.t.code}" data-x="${c.x}" data-w="${c.w}" title="${c.t.name}"><span class="rg"><b style="background:${regionVar(c.t.region)}"></b>${c.t.region}</span><span class="tn">${shortName(c.t)}</span><button type="button" class="hide" data-hide="${c.t.code}" aria-label="Masquer ${shortName(c.t)}" title="Masquer cette colonne">×</button></div>`).join("");
  rail.innerHTML=YEARS.map(y=>`<div class="ylab" data-y="${yTop(y)+2.5*STEP}">${y}${y===ONGOING_YEAR?"<small>EN COURS</small>":""}</div>`).join("");
  if(state.pinnedTeam&&!vis.some(t=>t.code===state.pinnedTeam)) state.pinnedTeam=null;
  if(typeof majRegionPills==="function") majRegionPills();
  renderTeamList();
  applyView(); apply();
}

// ---------- navigation : déplacement et zoom ----------
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function clampView(){
  // Marge de débord proportionnelle au viewport : on doit pouvoir pousser la première colonne
  // au-delà du tiroir de filtres, qui masque ~302 px (360 px moins les 58 px du rail des
  // années). Le plancher à 320 px tient cette promesse sur une fenêtre courte, où
  // min(w,h)*0.5 tomberait sous le seuil. Le bouton « tout afficher » sert de filet.
  const w=vp.clientWidth, h=vp.clientHeight, m=Math.max(320,Math.min(w,h)*0.5);
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
hdr.addEventListener("click",e=>{
  const x=e.target.closest(".hide");
  if(x) return void setHidden([x.dataset.hide],true);
  const th=e.target.closest(".th[data-team]"); if(!th) return;
  state.pinned=null; state.hover=null; state.pinnedTeam=state.pinnedTeam===th.dataset.team?null:th.dataset.team; apply();
});
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
  // Trois états d'en-tête au clic sur une équipe : épinglée, en lien, sans rapport. L'ensemble
  // « en lien » se déduit des chips **réellement surlignées**, et non de `lineage`, pour deux
  // raisons : c'est le seul moyen d'être d'accord avec la carte (plage d'années, blocs jetés
  // par `retenues`), et ça évite de faire correspondre un libellé court à un code d'équipe.
  // L'en-tête « Autres équipes » suit la même règle : en lien s'il porte une chip surlignée.
  let liees=null, autresLiee=false;
  if(pinnedTeam){
    liees=new Set();
    nodesByPlayer.forEach(ns=>ns.forEach(n=>{
      if(lin?!lin.chips.has(`${n.a.id}:${n.a.year}`):!ids.has(n.a.id)) return;
      if(n.other) autresLiee=true; else if(n.a.team.code!==pinnedTeam) liees.add(n.a.team.code);
    }));
  }
  hdr.querySelectorAll(".th").forEach(th=>{
    const on=!!pinnedTeam&&th.dataset.team===pinnedTeam;
    th.classList.toggle("on",on);
    th.classList.toggle("dim",!!liees&&!on&&(th.dataset.team?!liees.has(th.dataset.team):!autresLiee));
  });
  const sel=$("sel"), out=$("selText"), show=hover||pinned;
  if(show){
    const p=players.get(show), steps=[], nat=NAT[p.id];
    p.apps.forEach(a=>{
      const label=a.alias||a.team.name, last=steps[steps.length-1];
      if(last&&last.label===label&&last.role===a.role&&last.to===a.year-1) last.to=a.year;
      else steps.push({label,role:a.role,from:a.year,to:a.year});
    });
    out.innerHTML=`<b class="nm">${p.name}</b>${nat?`<span class="hint">${COUNTRY[nat]||nat} · </span>`:""}${steps.map(s=>`${s.label} <span class="hint">${s.from===s.to?s.from:s.from+"–"+s.to} · ${ROLE_NAME[s.role]}</span>`).join(" → ")}`;
  } else if(lin){
    const t=teams.find(t=>t.code===pinnedTeam);
    out.innerHTML=`<b class="nm">${t.name}</b><span class="hint">Arrivées et départs</span><br>Arrivées depuis : ${fmtFlow(lin.from)}<br>Départs vers : ${fmtFlow(lin.to)} <span class="hint">· ${lin.debut} premiers Worlds ici</span>`;
  } else if(pinnedTeam){
    const t=teams.find(t=>t.code===pinnedTeam), n=new Set(apps.filter(a=>a.team===t).map(a=>a.id)).size;
    out.innerHTML=`<b class="nm">${t.name}</b><span class="hint">${n} joueurs titulaires aux Worlds depuis ${ALL_YEARS[0]}, carrières complètes surlignées.</span>`;
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
  if(hasOther) L.push(`<span>Autres équipes : joueurs des régions et des équipes masquées, à l'édition de leur départ ou de leur retour</span>`);
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
  // La barre de recherche et la légende glissent à droite du tiroir de filtres (CSS `.fopen`)
  // pour rester lisibles au lieu de passer dessous.
  if(id==="filters") document.body.classList.toggle("fopen",open);
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
  ["Tout",ALL_YEARS[0],ALL_YEARS.at(-1),`Les ${ALL_YEARS.length} éditions, de ${ALL_YEARS[0]} à ${ALL_YEARS.at(-1)}`],
  ["Ère moderne",2020,ALL_YEARS.at(-1),"Depuis 2020 : quatre régions majeures, la LMS ayant fusionné dans la PCS"],
  ["Ère historique",ALL_YEARS[0],2019,`${ALL_YEARS[0]} à 2019 : la LMS est encore une cinquième région majeure`],
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
const regionBtns=new Map(REGIONS.map(r=>[r,pill($("regions"),r,regionVar(r),true,()=>{
  if(state.regions.has(r)){ if(state.regions.size===1) return true; state.regions.delete(r); } else state.regions.add(r);
  render(); return state.regions.has(r);
})]));
// Le seuil de présence peut vider une région entière — la GPL dès « 2+ », quatre familles à
// « 3+ ». Une pilule cochée sans aucune colonne derrière serait incomprise : elle porte donc
// son compte, et c'est le compte qui dit d'abaisser le seuil.
function majRegionPills(){
  for(const [r,b] of regionBtns){
    const total=teams.filter(t=>t.region===r).length;
    const n=teams.filter(t=>t.region===r&&APPS.get(t.code)>=state.minApps).length;
    b.innerHTML=`<i style="background:${regionVar(r)}"></i>${r}`+(n<total?`<span class="cnt">${n}/${total}</span>`:"");
    b.title=n<total?`${n} colonne${n>1?"s":""} sur ${total} au seuil de présence actuel`:`${total} colonne${total>1?"s":""}`;
  }
}
// ---------- masquage des colonnes d'équipe ----------
// La liste à cocher est la source de vérité, le `×` de l'en-tête un raccourci : une colonne
// masquée doit pouvoir revenir sans deviner où cliquer. Elle est groupée par région et ne
// liste que les régions affichées, puisque le masquage agit **à l'intérieur** du
// sous-ensemble retenu par le filtre de régions. Une équipe masquée dont la région est
// ensuite masquée reste masquée au retour de celle-ci — « tout réafficher » est le filet qui
// garantit le retour en un geste.
// Seuil de présence : « au moins N apparitions aux Worlds ». Une seule borne, pas deux —
// une période est un intervalle, un nombre d'apparitions est un seuil, et une borne haute ne
// répondrait à aucune question qu'on se pose.
const presenceBtns=PRESENCE.map(n=>{
  const b=pill($("presence"),n===1?"Toutes":`${n}+`,null,n===DEFAULT_MIN_APPS,()=>{
    state.minApps=n;
    presenceBtns.forEach(x=>x.setAttribute("aria-pressed",x===b));
    state.pinnedTeam=null; state.hover=null;
    render();
    return true;
  },"pill mode");
  const combien=teams.filter(t=>APPS.get(t.code)>=n).length;
  b.title=n===1 ? `Les ${combien} équipes` : `${combien} équipes sur ${teams.length}, venues au moins ${n} fois`;
  return b;
});

const teamsList=$("teamsList"), teamsSum=$("teamsSum");
function renderTeamList(){
  const dedans=teams.filter(t=>state.regions.has(t.region)), n=dedans.filter(t=>state.hiddenTeams.has(t.code)).length;
  // Restaurer le focus : le rendu complet de la liste l'effacerait à chaque case cochée.
  const actif=teamsList.contains(document.activeElement)?document.activeElement.dataset.team:null;
  const aff=dedans.length-n, pl=x=>x>1?"s":"";
  teamsSum.textContent=n?`${aff} équipe${pl(aff)} affichée${pl(aff)} sur ${dedans.length}`:`${dedans.length} équipe${pl(dedans.length)} affichée${pl(dedans.length)}`;
  let h="";
  REGIONS.filter(r=>state.regions.has(r)).forEach(r=>{
    const lot=dedans.filter(t=>t.region===r);
    h+=`<div class="tgrp"><div class="thd"><b><i style="background:${regionVar(r)}"></i>${r}</b>`
      +`<span><button type="button" data-rg="${r}" data-on="1">Toutes</button><button type="button" data-rg="${r}">Aucune</button></span></div><div class="labs">`
      +lot.map(t=>{
        // Une équipe sans aucune édition dans la période affichée n'a pas de colonne : la
        // case reste utile mais ne change rien tant que la période n'est pas élargie.
        const vide=!YEARS.some(y=>t.years[y]);
        // Une équipe sous le seuil de présence n'a pas de colonne non plus : sa case reste
        // cochée — ce n'est pas elle qui l'écarte — mais le libellé le dit.
        const sousSeuil=APPS.get(t.code)<state.minApps;
        const pourquoi=vide?" · aucune édition dans la période affichée":sousSeuil?` · ${APPS.get(t.code)} apparition${APPS.get(t.code)>1?"s":""}, sous le seuil de présence`:"";
        return `<label class="toggle tm${vide||sousSeuil?" vide":""}" title="${t.name}${pourquoi}"><input type="checkbox" data-team="${t.code}"${state.hiddenTeams.has(t.code)?"":" checked"}> ${shortName(t)}</label>`;
      }).join("")+`</div></div>`;
  });
  if(state.hiddenTeams.size) h+=`<button type="button" class="pill mode" data-showall="1">Tout réafficher (${state.hiddenTeams.size})</button>`;
  teamsList.innerHTML=h;
  if(actif) teamsList.querySelector(`input[data-team="${actif}"]`)?.focus();
}
// Masquer la dernière colonne viderait la carte : on s'arrête avant. D'où le test à chaque
// tour plutôt qu'une fois pour toutes — « Aucune » sur la seule région affichée laisse une
// équipe debout au lieu de ne rien faire.
function setHidden(codes,masquer){
  let change=false;
  for(const c of codes){
    if(masquer){
      if(!state.hiddenTeams.has(c)&&teams.filter(colonne).length>1){ state.hiddenTeams.add(c); change=true; }
    } else if(state.hiddenTeams.delete(c)) change=true;
  }
  if(change) render();
  return change;
}
teamsList.addEventListener("change",e=>{
  const cb=e.target.closest("input[data-team]"); if(!cb) return;
  // Refus (dernière colonne) : la case retrouve son état, `render` n'ayant pas eu lieu.
  if(!setHidden([cb.dataset.team],!cb.checked)) cb.checked=!cb.checked;
});
teamsList.addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  if(b.dataset.showall) return void setHidden([...state.hiddenTeams],false);
  if(b.dataset.rg) setHidden(teams.filter(t=>t.region===b.dataset.rg).map(t=>t.code),!b.dataset.on);
});

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
