/*
 * Rift Transfers — map of the rosters of every team that played the League of Legends Worlds.
 * The data comes from /data (format described in CONTRIBUTING.md); this file holds the rendering only.
 *
 * No displayed text is written here: everything goes through `t()`, and the dictionary lives in
 * i18n.js. Importing that module **already translates** the page's static HTML, before the data
 * is even loaded — the error box below depends on it.
 */
// Throughout this file `t` is already the variable for a team — hence `tr` and `trn` for
// translating, rather than a hundred-line rename that would gain nothing.
import { t as tr, tn as trn, ord, lang, setLang, LANGS, surChangement } from "./i18n.js";

// ---------- data loading ----------
const ROLES = ["top", "jgl", "mid", "bot", "sup"];           // internal keys (CSS classes)
const ROLE_KEYS = ["top", "jungle", "mid", "bot", "support"]; // JSON keys
// The five roles are spelled the same way in both languages: they are the game's own terms,
// which nobody translates, so they stay out of the dictionary.
const ROLE_NAME = { top: "Top", jgl: "Jungle", mid: "Mid", bot: "Bot", sup: "Support" };

async function loadJSON(name) {
  const res = await fetch(`data/${name}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`data/${name}.json : HTTP ${res.status}`);
  return res.json();
}

let TEAMS_DATA, RESULTS_DATA, PLAYERS_DATA, CAREERS_DATA;
try {
  [TEAMS_DATA, RESULTS_DATA, PLAYERS_DATA, CAREERS_DATA] = await Promise.all(["teams", "results", "players", "careers"].map(loadJSON));
} catch (err) {
  const box = document.getElementById("loadError");
  box.hidden = false;
  document.getElementById("loadDetail").textContent = String(err.message || err);
  throw err;
}

// ALL_YEARS: every edition, which the statistics are computed on.
// YEARS: the displayed range, recomputed on each render by the period filter.
const ALL_YEARS = TEAMS_DATA.years;
let YEARS = ALL_YEARS;
const REGIONS = TEAMS_DATA.regions;
const RES = RESULTS_DATA.results;
// Run labels and country names are **bilingual inside the data**: they are interface text, but
// they are collected and checked along with the rest of /data. Reading them therefore goes
// through the current language, and not through a table frozen at load time — the language
// changes without reloading the page.
const RES_LABEL = RESULTS_DATA.labels;
const parcours = (code) => RES_LABEL[code]?.[lang()] ?? code;
const ONGOING_YEAR = RESULTS_DATA.ongoingYear ?? null;
const HOME = PLAYERS_DATA.homeCountries;
// ISO code → country name. The chip badge stays with the two-letter code for lack of room;
// only the detail panel has space enough to spell out "South Korea".
const COUNTRY = PLAYERS_DATA.countryNames || {};
const pays = (code) => COUNTRY[code]?.[lang()] ?? code;
// Name of the league behind each region code, collected from `Leagues.League` (§ 15 of the
// collection report). It is the league's name **today**, whereas a family of columns spans
// sixteen years: the LEC was called "EU LCS" for half its life. A pill's code is therefore the
// name of a family of columns, not the league of a given year — a row's region, for its part,
// is decided at the year of its edition (docs/SOURCES.md, "Périmètre"). Hence a sober label,
// one that does not state itself as a historical truth.
const LEAGUE_NAMES = TEAMS_DATA.leagueNames || {};
// Geographic zone of a region, written next to the league name when its pill is hovered.
//
// It is **derived from `homeCountries`**, and not from `Leagues.Region`, which arrives in the
// same query: for the LPL the source says "China" while the map counts Taiwan and Hong Kong as
// domestic — the tooltip would contradict the "imported" badge shown a few pixels away.
// `Leagues.Region` is also circular for the LMS ("LMS") and approximate for the LCP.
// `homeCountries` is the territory the map actually uses, already settled region by region with
// its justification written down, and already in /data: nothing to collect.
const ZONE_MAX = 3; // beyond that, the list of countries is unreadable in a tooltip
// The three regions `ZONE_MAX` rules out — LEC (25 countries), LCL (8), LLA (7) — get a short
// label, and those are the **only** new pieces of text in this entry: the project already
// writes them elsewhere ("post-Soviet space" is in the dictionary and in docs/SOURCES.md).
// A settled table: we do not invent the name of a territory, any more than we abbreviate a team
// name on our own. A too-wide region absent from it displays **no** zone at all.
// Both spellings stay here rather than in i18n.js: what matters is the arbitration, and it
// reads as one block — three keys scattered through the dictionary would make it invisible.
const ZONES_ARBITREES = {
  LEC: { fr: "Europe", en: "Europe" },
  LCL: { fr: "espace post-soviétique", en: "post-Soviet space" },
  LLA: { fr: "Amérique latine", en: "Latin America" },
};
// "Thailand, Philippines and Singapore" — the last one joined by "and", "et" in French.
function zoneDe(region) {
  const codes = HOME[region] || [];
  if (!codes.length) return null;
  if (codes.length > ZONE_MAX) return ZONES_ARBITREES[region]?.[lang()] || null;
  const noms = codes.map(pays);
  return noms.length > 1 ? `${noms.slice(0, -1).join(", ")}${tr("zone.et")}${noms.at(-1)}` : noms[0];
}
const NAT = {};
for (const [name, code] of Object.entries(PLAYERS_DATA.nationality)) NAT[name.toLowerCase()] = code;

// An "appearance" = one player, one team, one edition of Worlds.
// A role shared by two players who both cross the 20 % threshold (`split`) produces **two**
// appearances, displayed as two targetable half-chips; a rotation that stayed under the
// threshold produces only one, and is still flagged by the `*` mark.
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
        // Identity stays the canonical spelling: the period handle only changes the display,
        // so that the career thread is not split in two.
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

// ---------- career steps outside Worlds (data/careers.json) ----------
// A step says **where the player was** during a year with no row, between two of their
// appearances. It enters the thread as one more appearance, so the line no longer jumps over
// the gap, but it stays grey: it is not a Worlds row, and that distinction must survive every
// setting.
//
// The club passed through does not always have a column — it never went to Worlds. It then gets
// a pseudo-team that no filter can make visible, and therefore falls into "Other teams" through
// the existing predicate, with no special case anywhere else.
const CAREERS = CAREERS_DATA.careers || {};
// Short code for clubs without a column, resolved by the script from `Teams.Short` just like a
// column code. A club the source cannot abbreviate is absent from it: its chip stays without a
// badge rather than carrying a made-up abbreviation.
const CLUB_SIGLES = CAREERS_DATA.clubs || {};
const byCode = new Map(teams.map(t => [t.code, t]));
const clubTeams = new Map();
const clubTeam = name => {
  if (!clubTeams.has(name)) clubTeams.set(name, { code: `@${name}`, name, label: name, tag: CLUB_SIGLES[name] || null, region: null, i: -1, active: [], years: {}, club: true });
  return clubTeams.get(name);
};
// First and last year with a game on record for the player: the two bounds the end marks
// display. They do **not** state a career — a still-active player may simply not have qualified
// again, and the source does not cover everything.
const SEEN = new Map();
// Gap years without a single game on record. The wording stops there: "no professional game on
// record", never "no team".
const VOIDS = new Map();
const stepApps = [];
players.forEach(p => {
  const fiche = CAREERS[p.name];
  if (!fiche) return;
  if (Array.isArray(fiche.seen)) SEEN.set(p.id, fiche.seen);
  const nouveaux = [];
  for (const [key, entry] of Object.entries(fiche.years || {})) {
    const year = +key;
    if (!entry.steps?.length) {
      // `offLevel`: the player did play, but nothing at Primary level. We say nothing about it
      // — least of all that they did not play.
      if (!entry.offLevel) {
        if (!VOIDS.has(p.id)) VOIDS.set(p.id, new Set());
        VOIDS.get(p.id).add(year);
      }
      continue;
    }
    // The role is that of the last appearance before it: the thread keeps its column lane
    // instead of switching lanes on a year whose role the source does not state.
    const avant = p.apps.filter(a => a.year < year).at(-1) || p.apps[0];
    entry.steps.forEach((st, rang) => {
      const t = st.team ? byCode.get(st.team) : clubTeam(st.club);
      if (!t) return;
      nouveaux.push({
        id: p.id, name: p.name, shown: p.name, ri: avant.ri, year, alias: null, team: t,
        role: ROLES[avant.ri], half: 0, halves: 1, alt: null, doubt: false, step: true, rang,
      });
    });
  }
  if (!nouveaux.length) return;
  stepApps.push(...nouveaux);
  p.apps.push(...nouveaux);
  p.apps.sort((a, b) => a.year - b.year || a.half - b.half || (a.rang ?? 0) - (b.rang ?? 0));
});

// A step has no region of its own: it inherits its column's, which is a place on the map and
// not a claim about the league played that year. A club without a column has none at all, hence
// the guard — `HOME[null]` would crash the map.
const isImport = a => !a.step && NAT[a.id] && !HOME[a.team.region].includes(NAT[a.id]);
// seniority: the player's n-th Worlds with this team. A step is not one.
players.forEach(p => { const c = {}; p.apps.forEach(a => { if (a.step) { a.sen = 0; return; } c[a.team.code] = (c[a.team.code] || 0) + 1; a.sen = c[a.team.code]; }); });

// ---------- rendering ----------
const CW=132, STEP=24, CH=20, TOPPAD=30, ROWH=250;
const PADX=8, chipW=CW-PADX*2;
const KMIN=0.15, KMAX=2.5;
const $=id=>document.getElementById(id);
const vp=$("vp"), world=$("world"), hdr=$("hdr"), rail=$("rail");
const yTop=y=>YEARS.indexOf(y)*ROWH+TOPPAD;
const regionVar=r=>`var(--${r.toLowerCase()})`;
const shortName=t=>t.label||t.code;
// Badge of a chip in "Other teams". A column carries its code. A club without a column carries
// the short code from `CLUB_SIGLES`, and **nothing at all** if it has none: its full name in a
// badge sized for three letters crushed the player's handle into an ellipsis, since `.t` does
// not compress and `.n` is the only one that does.
const tagDe=t=>t.club?t.tag:(t.tag||t.code);
let H=YEARS.length*ROWH+20;
// Ten curve lanes instead of five: two per role, otherwise the two threads of a shared chip
// would overlap.
const laneAt=(cx,ri,half)=>cx+14+(2*ri+half)*((chipW-28)/9);
// The lane is a **column corridor**: stable per (role, half), it guarantees that two lines of
// different roles never overlap along the vertical run between two years. So we do not move it.
// But the ten lanes are spread over the chip's *full* width, whereas a half-chip only occupies
// [0, 58] or [58, 116]: for top right, jungle right, bot left and support left, the lane falls
// outside the chip and the line seemed to come out from under the neighbouring name. We fix the
// anchor — start and end points move to the centre of the chip, reached by a short elbow — and
// the corridor stays intact.
const ELBOW=14;
// Gutter between two edition blocks: the free height above a block, the one the year rule
// already marks. It bounds the elbow below — beyond it, the elbow would reach into the
// neighbouring block.
const GOUTTIERE=70;
// Height of an elbow: a function of the lateral offset it has to cross, not a constant.
//
// A fixed height of 14 px would suit a thread with no offset, but a thread reaching the right
// half-chip of a shared role has 63 px to cross — a 4.5:1 ratio, that is, a flattened S stuck
// above the chip. The shared role merely creates the offset: what matters is that the elbow
// adapts to it, so this computation has no need to know about half-chips.
//
// The thread therefore starts its offset all the earlier as it has further to go, and the S
// spreads out instead of folding over itself. `ELBOW` stays the floor: a thread with no offset
// — the general case, a full chip, whose anchor **is** the corridor — keeps that minimal elbow,
// and its curve in fact stays a straight vertical.
const PENTE=0.9;
const coude=(dx,place)=>Math.min(Math.max(ELBOW,Math.abs(dx)*PENTE),Math.max(ELBOW,place));
// Half-width of the bar that closes both ends of the thread. Its stem has no length of its own:
// it runs to the junction between two editions (see `cap`).
const CAP=9;
// The bar stops **before** the separating line rather than on it. Otherwise an end and a start
// at the next edition land in the same place, in the same corridor if the role is the same, and
// the two marks merge into one — Dyrus stopping at TSM in 2015, Hauntzer arriving there in
// 2016. On either side of the line they read as two distinct facts, and the line keeps its role
// as a boundary.
const CAP_MARGE=8;
// Twenty ordered pairs of distinct roles, hence twenty gradients, laid down once for the whole
// map. A segment used to take the colour of `B.a.role`, the **arrival** role: the entire run of
// a jungler turned mid was painted in mid, and the colour stated the arrival instead of stating
// the change.
//
// In `objectBoundingBox`, coordinates are relative to each path's box: the same gradient serves
// every segment of the same pair, whatever its length, and there is nothing to compute per
// segment. Two hard stops at 50 % rather than a fade — the colour must say "here, they change
// role", not smear the uncertainty over the whole run.
//
// `stop-color` goes through `style` and not through a presentation attribute, which does not
// resolve `var()` everywhere; the path, for its part, carries its gradient in a `stroke`
// attribute rather than a class, so the twenty pairs need not be restated one by one in the
// stylesheet.
const ROLE_GRADS=ROLES.flatMap(a=>ROLES.filter(b=>b!==a).map(b=>
  `<linearGradient id="rg-${a}-${b}" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">`
  +`<stop offset="50%" style="stop-color:var(--${a})"/><stop offset="50%" style="stop-color:var(--${b})"/></linearGradient>`)).join("");
const attache=n=>n.lane>=n.x&&n.lane<=n.x+n.w?n.lane:n.x+n.w/2;
// Window of the organisation's existence, bounded by the displayed range.
const activeSpan=t=>[Math.max(YEARS[0],t.active[0]??YEARS[0]),Math.min(YEARS.at(-1),t.active[1]??Infinity)];

// The map opens on the **whole period**, so the "All" preset is the one active at start-up. It
// used to open on 2013 to spare the 500 px of near-empty rows of Season 1 and 2 — three and six
// teams tracked — but hiding two editions by default cost more than it saved: being exhaustive
// is the point of the tool, and it is up to the period filter to narrow down, just as it is up
// to the presence threshold to thin out.

// Number of Worlds appearances of each team: that is what the "Presence" filter measures.
const APPS=new Map(teams.map(t=>[t.code,Object.keys(t.years).length]));
// Steps of the filter, chosen on the real distribution: 120 columns in all, 54 from two
// appearances up, 33 from three, 19 from five. A continuous slider would run from 1 to 13 while
// 87 columns out of 120 sit at one or two appearances — it would spend half its travel moving
// nothing. The map opens on **every** column: being exhaustive is the point of the tool, and it
// is up to the filters to thin out.
const PRESENCE=[1,2,3,5];
const DEFAULT_MIN_APPS=1;

const state={roles:new Set(ROLES),regions:new Set(REGIONS),hiddenTeams:new Set(),minApps:DEFAULT_MIN_APPS,showNat:false,showSen:false,teamMode:"players",pinned:null,pinnedTeam:null,hover:null,
  yearFrom:ALL_YEARS[0],yearTo:ALL_YEARS.at(-1),
  // The two isolations. They do not replace the selection: hovering and plain clicking keep
  // exactly their former behaviour — highlighting, no reflow. They are two further gestures,
  // and each has its own control: the year axis for `annee`, a button in the detail panel for
  // `isole`.
  annee:null, isole:false};
// A column is displayed if its region is, **and** if it reaches the presence threshold, **and**
// if the team is not hidden one by one: the three filters compound, each acting inside the
// subset already kept by the previous ones. A team ruled out by any of the three spills into
// "Other teams" exactly like a hidden region — the same predicate decides, everywhere.
const visible=t=>state.regions.has(t.region)&&APPS.get(t.code)>=state.minApps&&!state.hiddenTeams.has(t.code);
// And a column is only drawn if the team has at least one edition within the period: it is that
// count, and not `visible` alone, that says whether anything is left on screen.
// Isolating an edition: that year's participants, **plus** the teams its players come from and
// go to the year before and the year after. An edition without its two neighbours merely lists
// rosters — the map is about transfers, and it is the neighbourhood that carries the movement.
// Measured: from 9 to 40 columns out of 120 depending on the edition, 40 in 2019.
const colonnesDeLEdition=N=>{
  const codes=new Set(teams.filter(t=>t.years[N]).map(t=>t.code));
  const surN=new Set(apps.filter(a=>a.year===N).map(a=>a.id));
  for(const a of apps) if(Math.abs(a.year-N)===1&&surN.has(a.id)) codes.add(a.team.code);
  return codes;
};
// Isolating the selection: the columns it went through. For a player, their clubs, steps
// outside Worlds included — 1 to 7 columns, median 1. For a team, the columns it exchanged
// players with, according to the click mode chosen in the filters: 27 columns at worst in "full
// careers" (TL), 16 in "arrivals and departures". It is not up to the shortcut to decide the
// mode.
const colonnesIsolees=()=>{
  if(state.pinned){
    const p=players.get(state.pinned);
    return new Set(p?p.apps.map(a=>a.team.code):[]);
  }
  if(!state.pinnedTeam) return null;
  const code=state.pinnedTeam, codes=new Set([code]), lin=state.teamMode==="lineage";
  players.forEach(p=>p.apps.forEach((a,k)=>{
    if(a.team.code!==code) return;
    if(lin){ if(p.apps[k-1]) codes.add(p.apps[k-1].team.code); if(p.apps[k+1]) codes.add(p.apps[k+1].team.code); }
    else p.apps.forEach(b=>codes.add(b.team.code));
  }));
  return codes;
};
// The two isolations **compound**, just as the three filters already compound with one another:
// each acts inside the subset kept by the previous ones, hence the intersection. `null` when
// neither is set, and that is what keeps `colonne()` at its former cost.
let reduction=null;
// The isolated edition's share alone, kept apart: a plain click leaves the selection isolation
// but **not** this one, which has its own control. Refusals judged against the map as it will be
// — a shortcut from the statistics drawer — refer to it.
let reductionAnnee=null;
const croiser=jeux=>jeux.length?jeux.reduce((a,b)=>new Set([...a].filter(c=>b.has(c)))):null;
const reduire=()=>{
  reductionAnnee=state.annee!=null?colonnesDeLEdition(state.annee):null;
  const jeux=[];
  if(reductionAnnee) jeux.push(reductionAnnee);
  if(state.isole){ const s=colonnesIsolees(); if(s) jeux.push(s); }
  return croiser(jeux);
};
// The columns an isolation **would leave**, without touching the state. Two reductions that
// compound may leave nothing — measured, more than half of the player × edition pairs — and
// that is what makes it possible to say so before the click, by greying the control out, rather
// than leaving a button that does nothing or emptying the map.
function colonnesSi({annee=state.annee,isole=state.isole}={}){
  const ys=ALL_YEARS.filter(y=>y>=state.yearFrom&&y<=state.yearTo&&(annee==null||Math.abs(y-annee)<=1));
  const jeux=[];
  if(annee!=null) jeux.push(colonnesDeLEdition(annee));
  if(isole){ const s=colonnesIsolees(); if(s) jeux.push(s); }
  const r=croiser(jeux);
  return teams.filter(t=>visible(t)&&(!r||r.has(t.code))&&ys.some(y=>t.years[y]));
}
// The displayed rows: the period, then the isolated edition and its two neighbours. Isolation
// **does not rewrite** the period — both reductions stay readable separately, and leaving the
// isolation gives the period back as it was. An edition at either end — 2011, 2026 — has only
// one neighbour, and the intersection with the period handles that with no special case.
const majYears=()=>{
  YEARS=ALL_YEARS.filter(y=>y>=state.yearFrom&&y<=state.yearTo);
  // Narrowing the period onto an isolated edition would take away its row: the isolation then
  // falls with it, rather than leaving the map with no row at all to draw.
  if(state.annee!=null&&!YEARS.includes(state.annee)) state.annee=null;
  if(state.annee!=null) YEARS=YEARS.filter(y=>Math.abs(y-state.annee)<=1);
};
const colonne=t=>visible(t)&&(!reduction||reduction.has(t.code))&&YEARS.some(y=>t.years[y]);
// Why the team has **no** column at this moment, or `null` if it has one: the negation of
// `colonne()`, spelled out cause by cause. A reading shortcut aiming at a missing column must
// say which of the four rules it out, and the vocabulary is that of the drawer's checklist — the
// two refusals state the same rule, in two places.
// `ignorerSelection`: judging against the map **as it will be** after the gesture. A reading
// shortcut changes the selection, hence leaves the selection isolation — a team the latter ruled
// out becomes reachable again, and refusing it would be refusing for a reason that will no
// longer exist.
const sansColonne=(t,ignorerSelection=false)=>{
  const red=ignorerSelection?reductionAnnee:reduction;
  if(!YEARS.some(y=>t.years[y])) return tr("refus.periode");
  if(APPS.get(t.code)<state.minApps) return trn("refus.seuil",APPS.get(t.code));
  if(!state.regions.has(t.region)) return tr("refus.region",{region:t.region});
  if(state.hiddenTeams.has(t.code)) return tr("refus.masquee");
  if(red&&!red.has(t.code)) return ignorerSelection?tr("refus.horsAnnee",{annee:state.annee}):tr("refus.horsIso");
  return null;
};
const view={x:0,y:0,k:1};
let nodesByPlayer=new Map(), hasOther=false, W=0, cols=[];

// ---------- map rendering ----------
function render(){
  // A team selection the filters have just ruled out falls, and the isolation that followed it
  // falls with it. **Before** computing the reduction: otherwise the map would be drawn once on
  // a selection that no longer exists, and the isolation would keep its columns.
  if(state.pinnedTeam){
    const t=byCode.get(state.pinnedTeam);
    if(!t||!visible(t)||!ALL_YEARS.some(y=>y>=state.yearFrom&&y<=state.yearTo&&t.years[y])) state.pinnedTeam=null;
  }
  if(state.isole&&!state.pinned&&!state.pinnedTeam) state.isole=false;
  majYears(); reduction=reduire();
  H=YEARS.length*ROWH+20;
  const vues=new Set(YEARS);
  const inRange=a=>vues.has(a.year);
  // On an isolated edition, the two neighbouring rows only show the **arrivals and
  // departures**: the players who are also on that edition. The rest of their roster teaches
  // nothing about the movement one came to read, and would drown it in the crowd.
  const surEdition=state.annee==null?null:new Set(apps.filter(a=>a.year===state.annee).map(a=>a.id));
  const garde=a=>!surEdition||a.year===state.annee||surEdition.has(a.id);

  // "Other teams" only takes in what is hidden — region or team. A team ruled out by the period
  // must not fall into it: the two tests stay separate.
  const vis=teams.filter(colonne);
  const visSet=new Set(vis);
  // The column only appears if it has something to show: a player present both in a visible
  // column **and** in a hidden team, over the displayed range. Without this test, hiding the LMS
  // over 2020–2026 would open an empty column, the region having no row there.
  hasOther=[...players.values()].some(p=>{
    const dans=p.apps.filter(a=>inRange(a)&&garde(a));
    return dans.some(a=>visSet.has(a.team))&&dans.some(a=>!visible(a.team));
  });
  const colX=new Map(); let x=0;
  vis.forEach(t=>{colX.set(t,x); x+=CW;});
  const otherX=x;

  // An appearance outside any column only informs if it touches the visible map: without this
  // filter, a player gone for good drags a chip across every following edition, linked to one
  // another without ever reaching a displayed column.
  //
  //  - Base: keep the appearance whose previous **or** next neighbour falls in a visible column.
  //  - Safeguard: inside a discarded block that is **bridged** — framed by two kept appearances,
  //    hence crossed by a line —, also keep one chip per club absent from the two bounds.
  //    Otherwise the line jumps over a club without saying a word: Peanut, with HLE alone
  //    visible, would go from `2017 T1` to `2023 GEN`, erasing his LGD year.
  //
  // A **trailing** block carries no line — the thread stops at the departure chip: we discard it
  // without distorting anything, and it is where the noise concentrates. The sequence of clubs
  // therefore stays exact, the duration approximate; the detail panel, which filters nothing,
  // keeps the exact years.
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

  // Placement of a step inside a column cell. It keeps the role of the appearance before it —
  // the thread stays in its corridor — but that role is sometimes already taken: Nagne was at
  // NaJin in 2014, the year Ggoong played Worlds there. Both are true, and the step is not a
  // role of the row.
  //
  // It then takes the **right half-chip**, flush against the starter, exactly like a shared role
  // — dotted, and only on focus. The starter only narrows at the moment the step appears: at
  // rest its chip is full, unchanged. `apply()` takes care of that, the step carrying in
  // `data-voisin` the chip to narrow.
  //
  // 18 cases out of 371, 4 of them between two steps — both are then half-chips. No saturation
  // to date: a step landing on a role **already** split in two would drop below the five, for
  // lack of room.
  const placeEtape=new Map();
  {
    const cle=(a)=>`${a.id}:${a.year}:${a.team.code}`;
    const tenu=new Map(); // "code:year:role" → occupants of the cell, starters included
    const occupantsDe=(code,year,ri)=>{
      const e=byCode.get(code)?.years[year];
      return e?e.all.filter(b=>b.ri===ri).map(b=>({worlds:b})):[];
    };
    const dansLaCase=stepApps.filter(a=>colX.has(a.team))
      .sort((m,n)=>m.year-n.year||m.team.code.localeCompare(n.team.code)||m.name.localeCompare(n.name));
    for(const a of dansLaCase){
      const k=`${a.team.code}:${a.year}:${a.ri}`;
      if(!tenu.has(k)) tenu.set(k,occupantsDe(a.team.code,a.year,a.ri));
      const occ=tenu.get(k);
      if(!occ.length){ occ.push({etape:a}); placeEtape.set(cle(a),{ri:a.ri,demi:false,droite:false,voisin:null}); continue; }
      if(occ.length===1){
        const g=occ[0];
        // Two steps on the same role: both are half-chips, nothing to narrow.
        if(g.etape) placeEtape.get(cle(g.etape)).demi=true;
        occ.push({etape:a});
        placeEtape.set(cle(a),{ri:a.ri,demi:true,droite:true,voisin:g.worlds?`${g.worlds.id}:${a.year}`:null});
        continue;
      }
      let i=5;
      while(tenu.get(`${a.team.code}:${a.year}:${i}`)?.length) i++;
      tenu.set(`${a.team.code}:${a.year}:${i}`,[{etape:a}]);
      placeEtape.set(cle(a),{ri:i,demi:false,droite:false,voisin:null});
    }
  }

  nodesByPlayer=new Map();
  const otherByYear={};
  players.forEach(p=>{
    const dans=retenues(p.apps.filter(a=>inRange(a)&&garde(a)));
    if(!dans.some(a=>colX.has(a.team))) return;
    nodesByPlayer.set(p.id,dans.map(a=>{
      if(colX.has(a.team)){
        const cx=colX.get(a.team)+PADX;
        if(a.step){
          // The corridor stays that of the inherited role: only the chip moves inside its cell.
          const pl=placeEtape.get(`${a.id}:${a.year}:${a.team.code}`)??{ri:a.ri,demi:false,droite:false,voisin:null};
          const w=pl.demi?chipW/2:chipW;
          return {a,x:cx+(pl.droite?w:0),w,y:yTop(a.year)+pl.ri*STEP,lane:laneAt(cx,a.ri,pl.droite?1:0),
            bottom:yTop(a.year)+Math.max(5,pl.ri+1)*STEP,demi:pl.demi,droite:pl.droite,voisin:pl.voisin};
        }
        const w=chipW/a.halves;
        return {a,x:cx+a.half*w,w,y:yTop(a.year)+a.ri*STEP,lane:laneAt(cx,a.ri,a.half),bottom:yTop(a.year)+5*STEP};
      }
      const n={a,other:true,w:chipW}; (otherByYear[a.year]??=[]).push(n); return n;
    }));
  });
  // Width of "Other": one sub-column per simultaneous chip of a same role, never fewer than
  // two. Since the five rows are indexed by role, it is that tally — and not the year's total —
  // that decides the width.
  const parPoste=l=>{const c={}; l.forEach(n=>c[n.a.ri]=(c[n.a.ri]||0)+1); return Math.max(0,...Object.values(c));};
  const otherCols=Math.max(2,...Object.values(otherByYear).map(parPoste));
  W=x+(hasOther?CW*otherCols:0);
  cols=vis.map(t=>({t,x:colX.get(t),w:CW}));
  if(hasOther) cols.push({other:true,x:otherX,w:CW*otherCols});

  Object.entries(otherByYear).forEach(([y,list])=>{
    // The row comes from the **role**, as in a team column, and not from a rank in the list:
    // without that the chip changed line from one year to the next depending on the number of
    // neighbours, and the thread zigzagged. Two players of the same role in the same year are
    // laid out in side-by-side sub-columns.
    // Worlds chips take the left sub-columns, steps the ones after: since steps only show on
    // focus, the column stays visually compact at rest.
    list.sort((m,n)=>m.a.ri-n.a.ri||(m.a.step?1:0)-(n.a.step?1:0)||m.a.half-n.a.half||m.a.name.localeCompare(n.a.name));
    const pris={};
    list.forEach(n=>{
      const cx=otherX+PADX+((pris[n.a.ri]=(pris[n.a.ri]??-1)+1))*CW;
      n.x=cx; n.y=yTop(+y)+n.a.ri*STEP; n.lane=laneAt(cx,n.a.ri,n.a.half);
      n.bottom=yTop(+y)+5*STEP;
    });
  });

  let html="";
  // The column background is bounded by the organisation's activity window: before its creation
  // and after its disappearance, the column is folded away.
  cols.forEach(c=>{
    if(c.other){ html+=`<div class="colbg other" style="left:${c.x}px;width:${c.w}px;height:${H}px"></div>`; return; }
    const [from,to]=activeSpan(c.t);
    const ys=YEARS.filter(y=>y>=from&&y<=to);
    if(!ys.length) return;
    const top=yTop(ys[0])-GOUTTIERE, bottom=yTop(ys.at(-1))+ROWH-GOUTTIERE;
    html+=`<div class="colbg" style="left:${c.x}px;top:${Math.max(0,top)}px;width:${c.w}px;height:${Math.min(H,bottom)-Math.max(0,top)}px"></div>`;
  });
  YEARS.forEach((y,j)=>{ if(j) html+=`<div class="yrule" style="top:${yTop(y)-GOUTTIERE}px;width:${W}px"></div>`; });
  let paths="";
  // Two threads, and only one visible at a time.
  //
  //  - the **shortcut** (`base`) jumps over the gap year from one Worlds appearance to the next,
  //    as the map did before steps existed. That is the one seen at rest: without it, hundreds
  //    of lines head for "Other teams", far right of 120 columns, and the map becomes unreadable
  //    for a piece of information one only reads one player at a time;
  //  - the **detail** (`deep`) goes through the steps, and only appears on focus, along with
  //    them.
  //
  // A segment touching no step is common to both: it is drawn only once.
  const segment=(A,B,cls)=>{
    const x1=A.lane,y1=A.y+CH/2,x2=B.lane,y2=B.y+CH/2,b0=A.bottom,t1=yTop(B.a.year)-6;
    const ax=attache(A), bx=attache(B);
    // Role change: the segment carries a gradient that switches hard at its middle, instead of
    // the arrival colour alone. The pair is chosen by position **on screen** and not by
    // chronology, the gradient running from the top of the box downwards: a `duo` segment going
    // back up would otherwise swap its two colours.
    const haut=A.y<=B.y?A:B, bas=haut===A?B:A;
    const meme=A.a.role===B.a.role;
    const teinte=meme?` ${B.a.role}`:"";
    const peint=meme?"":` stroke="url(#rg-${haut.a.role}-${bas.a.role})"`;
    if(A.a.year===B.a.year){
      // A `duo` segment is a short diagonal, and we hesitated to treat it differently: no, one
      // rule and one only. The middle of the path is the middle of the path.
      paths+=`<path class="l${teinte} move duo${cls}"${peint} data-p="${A.a.id}" data-de="${A.a.id}:${A.a.year}" data-vers="${B.a.id}:${B.a.year}" data-r="${B.a.role}" d="M${ax},${y1} L${bx},${y2}"/>`;
      return;
    }
    const creux=VOIDS.get(A.a.id);
    let vide=false;
    if(creux) for(let y=A.a.year+1;y<B.a.year;y++) if(creux.has(y)) vide=true;
    // Both elbows take their height from the lateral offset they cross, and their room from the
    // adjacent gutter: below A's block on departure, above B's on arrival. Both are corrected,
    // otherwise the same thread would carry two elbows of different makes — the departure one
    // merely has more room below it, so it showed less.
    const y0=A.y+CH;
    const yd=y0+coude(x1-ax,yTop(A.a.year)+ROWH-GOUTTIERE-y0), sd=(yd-y0)*.6;
    const yu=bx===x2?t1:B.y-coude(bx-x2,B.y-(yTop(B.a.year)-GOUTTIERE));
    const te=Math.min(t1,yu);
    // A tall enough departure elbow spills below the bottom of the block, into the gutter: that
    // is where the long inter-year curve then starts, and it cannot go below that curve's
    // arrival point.
    const bd=Math.min(Math.max(b0,yd),te), su=(B.y-yu)*.6, m=(te-bd)*.55;
    paths+=`<path class="l${teinte} ${A.a.team===B.a.team?"same":"move"}${vide?" void":""}${cls}"${peint} data-p="${A.a.id}" data-de="${A.a.id}:${A.a.year}" data-vers="${B.a.id}:${B.a.year}" data-r="${B.a.role}" d="M${ax},${y1} L${ax},${y0} C${ax},${y0+sd} ${x1},${yd-sd} ${x1},${yd} L${x1},${bd} C${x1},${bd+m} ${x2},${te-m} ${x2},${te} L${x2},${yu} C${x2},${yu+su} ${bx},${B.y-su} ${bx},${B.y} L${bx},${y2}"/>`;
  };
  nodesByPlayer.forEach((ns,id)=>{
    for(let k=1;k<ns.length;k++) segment(ns[k-1],ns[k],(ns[k-1].a.step||ns[k].a.step)?" deep":"");
    // Shortcut: only where the detail departs from it, that is, over a step.
    const mondiaux=ns.map((n,i)=>({n,i})).filter(x=>!x.n.a.step);
    for(let j=1;j<mondiaux.length;j++){
      if(mondiaux[j].i-mondiaux[j-1].i>1) segment(mondiaux[j-1].n,mondiaux[j].n," base");
    }
    // Start and end of the thread. The two ends are only laid down if the drawn chip **is** the
    // player's first or last appearance: the year range, like the blocks discarded by
    // `retenues`, cuts the thread without ending it, and a mark there would lie. They only show
    // on hover, as the note requires.
    //
    // The mark says where the **drawn** thread stops, that is, Worlds. What the source records
    // beyond that is another matter, and `seen` is what carries it, in the detail panel: 567
    // players have a game after their last Worlds.
    const suite=players.get(id).apps;
    // The bar sits on the **separating line between two editions** — the year rule itself — and
    // the stem runs up to it from the chip. It was first placed 9 px from the edge of the chip,
    // hence in the neighbouring role's row, where it read as the mark of the player above; then
    // at the edge of the five-row block, which still left it floating in the gutter. On the
    // line, it says without any possible ambiguity that the thread starts or stops **between
    // those two years**.
    //
    // The stem crosses the column's intermediate rows, as every line already does: the chips are
    // painted over the SVG. Above the first displayed row there is no line — we then stop at the
    // edge of the world, as the column background already does.
    const cap=(n,fin)=>{
      const x=attache(n), y=fin?n.y+CH:n.y;
      const ligne=fin?yTop(n.a.year)+ROWH-GOUTTIERE:Math.max(0,yTop(n.a.year)-GOUTTIERE);
      const b=ligne+(fin?-CAP_MARGE:CAP_MARGE);
      paths+=`<path class="l cap ${n.a.role}" data-p="${id}" data-c="${n.a.id}:${n.a.year}" data-r="${n.a.role}" d="M${x},${y} L${x},${b} M${x-CAP/2},${b} L${x+CAP/2},${b}"/>`;
    };
    if(ns[0].a===suite[0]) cap(ns[0],false);
    if(ns.at(-1).a===suite.at(-1)) cap(ns.at(-1),true);
  });
  html+=`<svg width="${W}" height="${H}" aria-hidden="true"><defs>${ROLE_GRADS}</defs>${paths}</svg>`;
  vis.forEach(t=>{
    const [from,to]=activeSpan(t);
    YEARS.forEach(y=>{
      const e=t.years[y], cx=colX.get(t)+PADX, top=yTop(y);
      // Outside the activity window nothing is drawn: the org did not exist yet, or no longer
      // did. "Not at Worlds" only holds while it exists.
      // The label stays: steps only show on focus, and it is `apply()` that silences it on the
      // sole cells where a step is actually being shown.
      if(!e){ if(y>=from&&y<=to) html+=`<div class="absent" data-cell="${t.code}:${y}" style="left:${cx}px;top:${top}px;width:${chipW}px;height:${5*STEP-4}px"><span>${tr("cell.absent")}</span></div>`; return; }
      const r=RES[y]?.[t.code];
      if(e.alias) html+=`<div class="alias" style="left:${cx}px;top:${top-16}px;width:${r?chipW-56:chipW}px">${e.alias}</div>`;
      if(r) html+=`<div class="res${r==="W"?" win":""}" style="left:${cx}px;top:${top-16}px;width:${chipW}px">${parcours(r)}</div>`;
    });
  });
  nodesByPlayer.forEach(ns=>ns.forEach(n=>{
    const a=n.a, label=a.alias||a.team.name, nat=NAT[a.id];
    // A step takes the right half-chip when its role is already held: the same shape as a
    // shared role, but it is not one — no "duo", no role at all.
    const demi=n.demi??(a.halves>1), droite=n.droite??(demi&&a.half);
    const duo=!a.step&&demi?a.team.years[a.year].all.find(b=>b.ri===a.ri&&b!==a):null;
    // What the source says of a step amounts to "at X that year": no role — the row has none —,
    // no seniority, no rotation.
    const marqueNat=nat?` (${nat})`:"";
    const tip=a.step
      ? tr("chip.etape",{nom:a.name,nat:marqueNat,club:label,annee:a.year})
      : tr("chip.worlds",{nom:a.name,alias:a.shown!==a.name?tr("chip.alias",{pseudo:a.shown}):"",
          nat:marqueNat,poste:ROLE_NAME[a.role],equipe:label,annee:a.year})
        +(a.sen>1?tr("chip.sen",{rang:ord(a.sen)}):"")
        +(duo?tr("chip.duo",{nom:duo.name}):"")+(a.alt?tr("chip.rotation",{nom:a.alt}):"")+(a.doubt?tr("chip.doute"):"");
    const tag=n.other?tagDe(a.team):null;
    const mark=n.other?(tag?`<span class="t">${tag}</span>`:""):(!a.step&&(a.alt||a.doubt)?`<span class="q">${a.doubt?"?":"*"}</span>`:"");
    html+=`<div class="chip${demi?" half":""}${droite?" right":""}${a.step?" step":""}" data-p="${a.id}" data-c="${a.id}:${a.year}" data-r="${a.role}" data-w="${n.w}"${a.step&&!n.other?` data-cell="${a.team.code}:${a.year}"`:""}${n.voisin?` data-voisin="${n.voisin}"`:""} style="left:${n.x}px;top:${n.y}px;width:${n.w}px;--s:${Math.min(a.sen-1,5)*11}%" title="${tip}"><span class="r ${a.role}"></span>${nat?`<span class="nat${isImport(a)?" imp":""}">${nat}</span>`:""}<span class="n">${a.shown}</span>${a.sen>1?`<span class="sen">${ord(a.sen)}</span>`:""}${mark}</div>`;
  }));
  // The two rows adjacent to the isolated edition pass under a veil, written **after** the
  // chips so as to cover them. A veil rather than an opacity on each chip: focus dimming already
  // plays on chip opacity, and the two would have fought over the same property. It captures
  // nothing, so the chips it covers stay hoverable.
  if(state.annee!=null) for(const y of YEARS){
    if(y===state.annee) continue;
    html+=`<div class="voile" style="top:${yTop(y)-GOUTTIERE}px;height:${ROWH}px;width:${W}px"></div>`;
  }
  world.style.width=W+"px"; world.style.height=H+"px";
  world.innerHTML=html;

  // Subtitle of the "Other teams" column: the hidden regions, then the number of teams hidden
  // one by one — those whose region is in fact displayed.
  const nMasquees=teams.filter(t=>state.regions.has(t.region)&&!visible(t)).length;
  const dehors=[...REGIONS.filter(r=>!state.regions.has(r)),...(nMasquees?[trn("hdr.dehors",nMasquees)]:[])].join(" · ");
  hdr.innerHTML=cols.map(c=>c.other
    ?`<div class="th other" data-x="${c.x}" data-w="${c.w}" title="${tr("hdr.autres.titre")}"><span class="rg">${dehors}</span><span class="tn">${tr("hdr.autres")}</span></div>`
    // The `×` hides the column; the rest of the header pins the team. Two distinct targets,
    // without which the two gestures would tread on each other. The drawer's checklist stays
    // the source of truth — this button is only a shortcut to it.
    :`<div class="th" data-team="${c.t.code}" data-x="${c.x}" data-w="${c.w}" title="${tr("hdr.equipe.titre",{nom:c.t.name})}"><span class="rg"><b style="background:${regionVar(c.t.region)}"></b>${c.t.region}</span><span class="tn">${shortName(c.t)}</span><button type="button" class="hide" data-hide="${c.t.code}" aria-label="${tr("hdr.masquer.aria",{nom:shortName(c.t)})}" title="${tr("hdr.masquer.titre")}">×</button></div>`).join("");
  // The year axis becomes clickable: a year isolates its edition. Clicking a **neighbour**
  // moves the isolation there — that is how one walks from edition to edition —, clicking the
  // isolated edition itself leaves it. It is the only way back from the axis, since once
  // isolated it carries no more than three years.
  rail.innerHTML=YEARS.map(y=>{
    const on=y===state.annee;
    // A year that would leave no column at all under the current selection isolation is greyed
    // out and inert, the reason in its `title`: the same rule as the team names in the
    // statistics drawer — we refuse, we say why, and we do not quietly undo the other
    // isolation. The test only costs anything when a selection is isolated.
    const mort=!on&&state.isole&&!colonnesSi({annee:y}).length;
    const aide=on?tr("rail.isolee")
      :mort?tr("rail.morte",{annee:y})
      :state.annee!=null?tr("rail.deplacer",{annee:y})
      :tr("rail.isoler",{annee:y});
    return `<button type="button" class="ylab${on?" iso":""}" data-y="${yTop(y)+2.5*STEP}" data-year="${y}" aria-pressed="${on}" aria-disabled="${mort}" title="${aide}">${y}${y===ONGOING_YEAR?`<small>${tr("rail.ongoing")}</small>`:""}</button>`;
  }).join("");
  // One case the entry check does not see is left: the isolated edition has taken the pinned
  // team's column away. The selection falls, and if an isolation followed it, the reduction just
  // applied is no longer the right one — we lay the page out again, once and not twice.
  if(state.pinnedTeam&&!vis.some(t=>t.code===state.pinnedTeam)){
    state.pinnedTeam=null;
    if(state.isole){ state.isole=false; return void render(); }
  }
  if(typeof majRegionPills==="function") majRegionPills();
  majStatsTeams();
  renderTeamList();
  applyView(); apply();
}

// ---------- navigation: panning and zooming ----------
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function clampView(){
  // Overscroll margin proportional to the viewport: one must be able to push the first column
  // past the filter drawer, which hides ~302 px (360 px minus the 58 px of the year rail). The
  // 320 px floor keeps that promise on a short window, where min(w,h)*0.5 would fall below the
  // threshold. The "fit to view" button acts as a safety net.
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

// ---------- selection ----------
// ---------- isolation: two reductions, two gestures ----------
// Until now selection only went through `apply()`: elements already in place were restyled,
// without ever laying the map out again. Isolation breaks that separation, because "keep only
// the columns that matter" is a layout decision, hence one for `render()`. It is the only place
// in this file where a selection triggers a render.
//
// The rule that bounds the damage: **the former mode is kept exactly as it was.** A hover and a
// plain click highlight, and nothing moves. Isolation is a distinct, visible gesture, and it is
// undone by an obvious one.
//
// Two reductions that compound may leave nothing — an isolated player who played no edition of
// the isolated year. We then refuse the **second** gesture instead of emptying the map: that is
// already the rule of `setHidden()`, which never hides the last column.
function essayer(modif){
  if(!colonnesSi(modif).length) return false;
  Object.assign(state,modif);
  return true;
}
// Recentring afterwards is not a finishing touch: the columns have closed up, so everything has
// moved, and the chip just clicked may be thousands of pixels from where the hand left it. We
// come back onto the selection — on the way out too, rather than onto the view from before the
// isolation: if the selection has changed meanwhile, returning to it would be wrong.
function recadrer(){
  if(state.pinned&&nodesByPlayer.has(state.pinned)) return void cadrerJoueur(state.pinned);
  if(state.pinnedTeam){ const c=cols.find(c=>c.t&&c.t.code===state.pinnedTeam); if(c) return void cadrerColonne(c.t,c); }
  if(state.annee!=null) return void centerOn(W/2,yTop(state.annee)+2.5*STEP,Math.min(1,Math.max(.2,(vp.clientWidth-80)/W)));
  fitAll();
}
function isolerAnnee(y){
  if(!essayer({annee:y})) return false;
  render(); recadrer(); return true;
}
function basculerIsolement(){
  // The button is a toggle, and it **keeps the selection** on the way out: seeing the whole map
  // again without losing the player one was reading is not the same as releasing everything.
  // The `×` is what releases, and that is the whole point of keeping them apart.
  if(!essayer({isole:!state.isole})) return false;
  render(); recadrer(); return true;
}
// Release everything in one gesture. Clicking empty space no longer suffices once isolated: the
// columns have closed up and empty space has all but vanished from the screen.
function toutMontrer(){
  if(!state.isole&&state.annee==null) return false;
  state.isole=false; state.annee=null;
  render(); recadrer(); return true;
}

// The chip is the only handle on a player, and the thread is not one. It was tried: the thread
// changes its path on focus — the shortcut gives way to the detail that goes through the steps
// —, so hovering it makes it vanish from under the cursor, focus drops, the shortcut comes back,
// and it loops forever. Making the thread hoverable would mean giving it a single geometry, that
// is, showing at rest the 189 detours through Worlds-less years, 64 of which run all the way to
// "Other teams". The price is too high for the gain.
function tap(target){
  const c=target.closest&&target.closest(".chip");
  if(c){ state.pinnedTeam=null; state.pinned=c.dataset.p; state.hover=null; }
  // Clicking empty space releases a **player**: they were picked up inside the map, the map is
  // their context, and clicking elsewhere there amounts to "no, not that one". It does **not
  // release a team**, which is picked up in the header, outside the area one drags: an unlucky
  // click must not lose it. It is released by clicking its header again, or through the panel's
  // × — two explicit exits, like the isolated edition which is only left by clicking its year
  // again. Once isolated, empty space has all but vanished from the screen anyway, the columns
  // having closed up: it was no longer a reliable exit.
  else if(state.pinnedTeam) return;
  else { state.pinned=null; state.hover=null; }
  apresSelection();
}
// During a **team isolation**, hovering a player goes one level down: the column layout stays
// the team's, and only the player's line lights up inside it. It is a sub-context, not a
// selection — it holds to the cursor and undoes itself when it leaves, without ever laying the
// map out again. The click keeps its meaning: it moves selection and isolation onto the player,
// and there the columns do move.
//
// Outside isolation the former rule holds, and that is deliberate: a pinned team ignores hover,
// otherwise sweeping the mouse over 120 columns would make the highlight flicker constantly.
// Isolated, a handful are left, and the gesture is manageable.
const survolPossible=()=>!state.pinned&&(!state.pinnedTeam||state.isole);
world.addEventListener("mouseover",e=>{const c=e.target.closest(".chip"); if(c&&!drag&&survolPossible()&&matchMedia("(hover:hover)").matches){state.hover=c.dataset.p;apply();}});
world.addEventListener("mouseout",e=>{if(e.target.closest(".chip")&&state.hover){state.hover=null;apply();}});
hdr.addEventListener("click",e=>{
  const x=e.target.closest(".hide");
  if(x) return void setHidden([x.dataset.hide],true);
  const th=e.target.closest(".th[data-team]"); if(!th) return;
  state.pinned=null; state.hover=null; state.pinnedTeam=state.pinnedTeam===th.dataset.team?null:th.dataset.team; apresSelection();
});
// The `×` releases everything, selection isolation included. The isolated edition has its own
// control — the year axis — and does not leave with the selection.
$("selClose").onclick=()=>{state.pinned=null; state.pinnedTeam=null; state.hover=null; $("q").value=""; apresSelection();};
$("selIso").onclick=basculerIsolement;
// `aria-disabled` greys out without blocking the click: the refusal is therefore restated here,
// for the mouse as for the keyboard.
rail.addEventListener("click",e=>{
  const l=e.target.closest(".ylab[data-year]"); if(!l) return;
  isolerAnnee(state.annee===+l.dataset.year?null:+l.dataset.year);
});

// The **chips** the "arrivals and departures" mode keeps: the team's own, plus the club just
// before the arrival and the club just after the departure. The mode no longer lists its
// segments: a segment is kept if both its chips are, and that is the only way to agree with the
// map. Listing them by career index made them miss as soon as an appearance was dropped from the
// render — by the period, by `retenues`, or by an isolation — and Maple arrived at PSG in 2021
// without a single thread, when that is where he joins TSM from.
function lineage(code){
  const chips=new Set(), from={}, to={}; let debut=0;
  players.forEach(p=>p.apps.forEach((a,k)=>{
    if(a.team.code!==code) return;
    chips.add(`${p.id}:${a.year}`);
    const prev=p.apps[k-1], next=p.apps[k+1];
    if(!prev) debut++;
    else if(prev.team.code!==code){ chips.add(`${p.id}:${prev.year}`); (from[shortName(prev.team)]??=[]).push(p.name); }
    if(next&&next.team.code!==code){ chips.add(`${p.id}:${next.year}`); (to[shortName(next.team)]??=[]).push(p.name); }
  }));
  return {chips,from,to,debut};
}
const fmtFlow=o=>Object.entries(o).sort((a,b)=>b[1].length-a[1].length).map(([t,l])=>`<span title="${l.join(", ")}">${t} <span class="hint">×${l.length}</span></span>`).join(", ")||`<span class="hint">${tr("detail.lineage.aucun")}</span>`;

function apply(){
  const {hover,pinned,pinnedTeam}=state;
  const lin=!hover&&!pinned&&pinnedTeam&&state.teamMode==="lineage"?lineage(pinnedTeam):null;
  // A step counts as a passage through the column: pinning T1 must highlight Faker's thread in
  // 2014, the year he was there without going to Worlds.
  const ids=hover?new Set([hover]):pinned?new Set([pinned]):(pinnedTeam&&!lin)?new Set([...apps,...stepApps].filter(a=>a.team.code===pinnedTeam).map(a=>a.id)):null;
  world.classList.toggle("focus",!!ids||!!lin);
  world.classList.toggle("showNat",state.showNat);
  world.classList.toggle("showSen",state.showSen);
  const parCase=new Map(); // data-c → chip, to find the starter to narrow
  world.querySelectorAll("[data-p]").forEach(el=>{
    const isPath=el.tagName==="path";
    if(!isPath&&el.dataset.c) parCase.set(el.dataset.c,el);
    // An end mark is highlighted **with its chip**, and never on its own: it has no `data-k`,
    // but it carries the `data-c` of the chip it hangs on. Highlighting it per player left
    // orphan marks in "arrivals and departures", where that mode only keeps some of the
    // player's chips — Zven carried one at ORI 2015 with his chip switched off.
    // Everything is highlighted through the **chips**: a segment when both its ends are, an end
    // mark when the chip it holds on to is. So nothing can stay lit with nothing to hang on to,
    // and the whole stays in agreement with what the map draws.
    const bout=isPath&&el.classList.contains("cap");
    el.classList.toggle("hl",lin
      ?(isPath&&!bout
        ?lin.chips.has(el.dataset.de)&&lin.chips.has(el.dataset.vers)
        :lin.chips.has(el.dataset.c))
      :(!!ids&&ids.has(el.dataset.p)));
    el.classList.toggle(isPath?"roff":"off",!state.roles.has(el.dataset.r));
  });
  // Three header states when a team is clicked: pinned, related, unrelated. The "related" set
  // is derived from the chips **actually highlighted**, and not from `lineage`, for two reasons:
  // it is the only way to agree with the map (year range, blocks discarded by `retenues`), and
  // it avoids matching a short label against a team code. The "Other teams" header follows the
  // same rule: related if it carries a highlighted chip.
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
  // A "Not at Worlds" cell whose step is actually shown falls silent: the label is centred, the
  // chip would run over it. Out of focus it stays, since nothing is displayed.
  const tues=new Set();
  world.querySelectorAll(".chip.step.hl[data-cell]").forEach(el=>tues.add(el.dataset.cell));
  world.querySelectorAll(".absent[data-cell]").forEach(el=>el.classList.toggle("muette",tues.has(el.dataset.cell)));

  // And a starter whose role receives a step narrows to a half-chip for as long as it shows. At
  // rest their chip is full: this is the Worlds row, and it must lose nothing for a piece of
  // information nobody asked for.
  world.querySelectorAll(".chip.serre").forEach(el=>{
    el.classList.remove("serre","half");
    el.style.width=`${el.dataset.w}px`;
  });
  world.querySelectorAll(".chip.step.hl[data-voisin]").forEach(el=>{
    const v=parCase.get(el.dataset.voisin);
    if(!v) return;
    v.classList.add("serre","half");
    v.style.width=`${+v.dataset.w/2}px`;
  });

  const sel=$("sel"), out=$("selText"), show=hover||pinned;
  if(show){
    const p=players.get(show), nat=NAT[p.id], creux=VOIDS.get(p.id)||new Set();
    // The panel filters nothing: it gives the sequence of clubs, steps outside Worlds included,
    // and the years the source does not record. A step merges into the spell at the club it
    // extends — it is the career one reads here, the map carrying the distinction.
    const items=[];
    p.apps.forEach(a=>{
      const dernier=[...items].reverse().find(i=>i.kind==="run");
      for(let y=(dernier?dernier.to+1:a.year);y<a.year;y++) if(creux.has(y)) items.push({kind:"void",year:y});
      const label=a.alias||a.team.name, last=items[items.length-1];
      if(last?.kind==="run"&&last.label===label&&last.role===a.role&&last.to===a.year-1) last.to=a.year;
      else items.push({kind:"run",label,role:a.role,from:a.year,to:a.year});
    });
    // "no professional game on record", never "no team": the source says it records nothing,
    // not that the player had no team.
    const chaine=items.map(i=>i.kind==="void"
      ?`<span class="hint">${tr("detail.void",{annee:i.year})}</span>`
      :`${i.label} <span class="hint">${i.from===i.to?i.from:i.from+"–"+i.to} · ${ROLE_NAME[i.role]}</span>`).join(" → ");
    // The two bounds of the thread. "Known" and not "start" or "end of career": a still-active
    // player may simply not have qualified again, and the source's coverage has its limits.
    const vu=SEEN.get(p.id);
    const bornes=vu?`<br><span class="hint">${tr("detail.bornes",{de:vu[0],a:vu[1]})}</span>`:"";
    out.innerHTML=`<b class="nm">${p.name}</b>${nat?`<span class="hint">${pays(nat)} · </span>`:""}${chaine}${bornes}`;
  } else if(lin){
    const t=teams.find(t=>t.code===pinnedTeam);
    out.innerHTML=`<b class="nm">${t.name}</b><span class="hint">${tr("mode.lineage")}</span><br>${tr("detail.lineage.depuis")}${fmtFlow(lin.from)}<br>${tr("detail.lineage.vers")}${fmtFlow(lin.to)} <span class="hint">${tr("detail.lineage.debut",{n:lin.debut})}</span>`;
  } else if(pinnedTeam){
    const t=teams.find(t=>t.code===pinnedTeam), n=new Set(apps.filter(a=>a.team===t).map(a=>a.id)).size;
    out.innerHTML=`<b class="nm">${t.name}</b><span class="hint">${tr("detail.equipe",{n,annee:ALL_YEARS[0]})}</span>`;
  }
  sel.hidden=!(show||pinnedTeam);
  // The × hides on a mere hover, which has nothing to release — but not when a team is pinned
  // underneath: the hover is then only a sub-context, and the control that releases the
  // selection must not vanish from under the cursor.
  $("selClose").hidden=!!hover&&!pinned&&!pinnedTeam;
  // The button only makes sense on a **settled** selection: isolating on hover would rearrange
  // the map as the mouse goes by. It is a toggle, hence `aria-pressed` and not an action.
  const iso=$("selIso"), pose=!!pinned||!!pinnedTeam;
  iso.hidden=!pose;
  sel.classList.toggle("avec-iso",pose);
  iso.setAttribute("aria-pressed",String(state.isole));
  iso.textContent=state.isole?tr("sel.tout"):tr("sel.iso");
  // Greyed out when the isolation would leave nothing — 35 players out of 749 have no column at
  // all in the period open by default, and an isolated edition narrows further. Saying why is
  // worth more than a button that does nothing.
  const mort=pose&&!state.isole&&!colonnesSi({isole:true}).length;
  iso.setAttribute("aria-disabled",String(mort));
  iso.title=state.isole?tr("sel.iso.titre.sortir")
    :mort?(state.annee!=null?tr("sel.iso.titre.morte.annee",{annee:state.annee}):tr("sel.iso.titre.morte.periode"))
    :tr("sel.iso.titre");
  renderLegend(!!lin);
}

function renderLegend(lin){
  const L=[];
  L.push(`<span><svg width="30" height="10"><line x1="2" y1="5" x2="28" y2="5" stroke="currentColor" stroke-width="1.8"/></svg> ${tr("leg.fil")}</span>`);
  L.push(`<span><span class="lg-half"><i></i><i></i></span> ${tr("leg.demi")}${apps.some(a=>a.doubt)?tr("leg.demi.doute"):""}</span>`);
  // The four run labels come from `results.json`, like those on the map: rewriting them here
  // would give two sources, and the legend would end up no longer naming what the rows show.
  L.push(`<span><span class="lg-res">${["QF","SF","F"].map(parcours).join(" · ")}</span> ${tr("leg.parcours")} · <b style="color:var(--bot)">${parcours("W")}</b></span>`);
  // Say "first" and "last Worlds", and not "start" or "end of career": the map only sees the
  // editions, and a still-active player may simply not have qualified again.
  L.push(`<span><svg width="30" height="12"><line x1="10" y1="2" x2="20" y2="2" stroke="currentColor" stroke-width="2"/><line x1="15" y1="2" x2="15" y2="10" stroke="currentColor" stroke-width="2"/></svg> ${tr("leg.bouts")}</span>`);
  if(state.showNat) L.push(`<span><span class="lg-nat">KR</span> ${tr("leg.nat")} · <span class="lg-nat" style="color:var(--accent);border-color:var(--accent)">KR</span> ${tr("leg.nat.imp")}</span>`);
  if(state.showSen) L.push(`<span><span class="senbar"></span> ${tr("leg.sen",{de:ord(1),a:ord(6)})}</span>`);
  L.push(`<span><span class="lg-step">${tr("leg.step.badge")}</span> ${tr("leg.step")}</span>`);
  L.push(`<span><svg width="30" height="10"><line x1="2" y1="5" x2="28" y2="5" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 4"/></svg> ${tr("leg.void")}</span>`);
  if(hasOther) L.push(`<span>${tr("leg.autres")}</span>`);
  if(lin) L.push(`<span>${tr("leg.lineage")}</span>`);
  if(state.annee!=null) L.push(`<span>${tr("leg.annee",{annee:state.annee})}</span>`);
  if(state.isole) L.push(`<span>${tr("leg.iso")}${state.pinnedTeam?tr("leg.iso.survol"):""}</span>`);
  L.push(`<span>${tr("leg.geste")}</span>`);
  $("legendBody").innerHTML=L.join("");
}

// ---------- search ----------
// Framings, pulled out of `selectPlayer` and `selectTeam` because isolation has to re-frame
// after a render, without going through a selection that has not changed.
function cadrerJoueur(id){
  const ns=nodesByPlayer.get(id);
  if(!ns?.length) return;
  const n=ns[0], bas=ns.at(-1).y;
  centerOn(n.x+chipW/2,n.y+(bas-n.y)/2,Math.min(1,Math.max(.45,vp.clientHeight/((bas-n.y)+300))));
}
function cadrerColonne(t,c){
  // Frame on the sole editions the team played within the displayed period: a column of two
  // rows out of sixteen would otherwise centre on empty space.
  const ys=YEARS.filter(y=>t.years[y]);
  if(!ys.length) return;
  const haut=yTop(ys[0]), bas=yTop(ys.at(-1))+5*STEP;
  centerOn(c.x+c.w/2,(haut+bas)/2,Math.min(1,Math.max(.45,vp.clientHeight/((bas-haut)+300))));
}
// Aftermath of a selection change, and of a click-mode change too: both change the set of
// columns the isolation keeps, without the isolation itself being called into question. A new
// selection **moves it onto itself** rather than leaving it — one stays within the same reading
// gesture, on somebody else.
//
// As long as nothing is isolated, it is `apply()` and nothing else, the former behaviour intact.
// Isolated, the page must be laid out again, but only if that set really changed: otherwise we
// would pay a full render on every hover.
function apresSelection(){
  if(!state.pinned&&!state.pinnedTeam) state.isole=false;
  const avant=reduction;
  majYears(); reduction=reduire();
  if(state.isole&&!teams.some(colonne)){ state.isole=false; majYears(); reduction=reduire(); }
  const cle=s=>s?[...s].sort().join(","):"";
  if(cle(avant)===cle(reduction)) return void apply();
  render(); recadrer();
}
function selectPlayer(id){
  state.pinned=id; state.pinnedTeam=null; state.hover=null;
  apresSelection();
  cadrerJoueur(id);
}
// The counterpart of `selectPlayer` for a team: set the selection, then recentre on the column.
// The click mode — "full careers" or "arrivals and departures" — stays the one the user chose in
// the filters; it is not up to the shortcut to decide.
//
// **Team without a column: we refuse.** No unhiding on the sly — a click in the statistics has
// no business changing the filters without saying so — and no dialog box, which would cost more
// than it gives for a reading shortcut. It is the entry itself that is greyed out and carries
// the reason (`majStatsTeams`), and this pre-emptive refusal states the same rule as the
// cleanup of `state.pinnedTeam` by `render()` when the column disappears.
function selectTeam(code){
  const t=byCode.get(code);
  if(!t||sansColonne(t,true)) return false;
  state.pinned=null; state.hover=null; state.pinnedTeam=code;
  apresSelection();
  const c=cols.find(c=>c.t===t);
  if(c) cadrerColonne(t,c);
  return true;
}
// The team names in "Unchanged rosters" are shortcuts whose state depends on the filters, not
// on the drawer's contents: it is refreshed on every render, like the region pills, instead of
// being frozen at build time.
function majStatsTeams(){
  document.querySelectorAll("#stats button[data-team]").forEach(b=>{
    const t=byCode.get(b.dataset.team), pourquoi=t?sansColonne(t,true):tr("stats.absente");
    // `aria-disabled` rather than the `disabled` attribute: a disabled button receives no mouse
    // event at all in several browsers, and would therefore not show the `title` that carries
    // the reason for the refusal — the whole point of greying out. `selectTeam` refuses on its
    // own side.
    b.setAttribute("aria-disabled",String(!!pourquoi));
    b.title=pourquoi?`${t?t.name:b.dataset.team} · ${pourquoi}`:tr("stats.voir",{nom:t.name});
  });
}

// ---------- search: players and teams ----------
// Hand-written combobox: the native `<datalist>` would fit in three lines, but it can neither
// present two categories — the bar searches teams as much as players —, nor display anything
// other than text, nor be styled.
const q=$("q"), qlist=$("qlist");
// Comparison form: lower case, diacritics stripped, so that "pain" finds `paiN Gaming` and
// "kabum" `KaBuM! e-Sports`. Only the **search** is forgiving — the spelling of a handle stays a
// data key, and nothing here touches it.
const pli=s=>String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
// One entry **per spelling** of a player: a renamed player is searched under both, and that is
// a data rule, not a convenience — the period-handle line then carries the canonical spelling as
// support, so that the link between the two can be seen. One entry per team, findable under its
// code, its full name and its short label.
const ENTREES=[];
players.forEach(p=>{
  ENTREES.push({kind:"j",id:p.id,nom:p.name,note:null,cles:[pli(p.name)]});
  const vus=new Set();
  p.apps.forEach(a=>{
    if(a.shown===a.name||vus.has(a.shown)) return;
    vus.add(a.shown);
    ENTREES.push({kind:"j",id:p.id,nom:a.shown,note:p.name,cles:[pli(a.shown)]});
  });
});
teams.forEach(t=>{
  const court=shortName(t);
  ENTREES.push({kind:"e",code:t.code,region:t.region,nom:court,
    note:court===t.name?t.region:`${t.name} · ${t.region}`,
    cles:[...new Set([pli(t.code),pli(t.name),pli(court)])]});
});
// Eight per group: beyond that the list stops helping, and the remaining count says one must be
// more specific. A match at the start of a word comes before a match in the middle, and a whole
// match before everything else — typing "t1" must put T1 first, not the twelve codes containing
// a 1.
const MAX_GROUPE=8;
function chercher(texte){
  const k=pli(texte.trim());
  if(!k) return [];
  const rang=e=>{
    let best=-1;
    for(const c of e.cles){
      const i=c.indexOf(k);
      if(i<0) continue;
      const r=i>0?2:(c.length===k.length?0:1);
      if(best<0||r<best) best=r;
    }
    return best;
  };
  return ENTREES.map(e=>({e,r:rang(e)})).filter(x=>x.r>=0)
    .sort((a,b)=>a.r-b.r||a.e.nom.length-b.e.nom.length||a.e.nom.localeCompare(b.e.nom,lang()))
    .map(x=>x.e);
}

let options=[], actif=-1;
const fermerListe=()=>{
  qlist.hidden=true; qlist.innerHTML=""; options=[]; actif=-1;
  q.setAttribute("aria-expanded","false"); q.removeAttribute("aria-activedescendant");
};
function majListe(){
  if(!q.value.trim()) return fermerListe();
  const res=chercher(q.value);
  let h="";
  options=[];
  // Two named groups rather than a flat list: a `listbox` only accepts `option` and `group`
  // elements, and the two categories are not read the same way — a handle is recognised, a team
  // code is guessed at.
  for(const [kind,titre] of [["j",tr("rech.joueurs")],["e",tr("rech.equipes")]]){
    const tout=res.filter(e=>e.kind===kind);
    if(!tout.length) continue;
    h+=`<div role="group" aria-label="${titre}"><div class="lbl" aria-hidden="true">${titre}</div>`;
    for(const e of tout.slice(0,MAX_GROUPE)){
      // A team with no column at this moment stays listed: finding it is already an answer. It
      // is inert, with its reason — we do not change the filters without saying so.
      const t=kind==="e"?byCode.get(e.code):null;
      const pourquoi=t?sansColonne(t,true):null;
      const i=options.length;
      options.push({...e,mort:!!pourquoi});
      h+=`<div class="opt" id="qo${i}" role="option" data-i="${i}" aria-selected="false"${pourquoi?` aria-disabled="true" title="${pourquoi}"`:""}>`
        +(kind==="e"?`<i style="background:${regionVar(e.region)}"></i>`:"")
        +`<b>${e.nom}</b>${e.note?`<span class="hint">${e.note}</span>`:""}`
        +(pourquoi?`<span class="hint">· ${pourquoi}</span>`:"")+`</div>`;
    }
    const reste=tout.length-MAX_GROUPE;
    if(reste>0) h+=`<div class="reste" role="presentation">${trn("rech.reste",reste)}</div>`;
    h+=`</div>`;
  }
  if(!options.length) h=`<div class="vide" role="presentation">${tr("rech.vide")}</div>`;
  qlist.innerHTML=h;
  qlist.hidden=false;
  q.setAttribute("aria-expanded","true");
  // The first possible choice is active straight away: Enter must work without an arrow key.
  actif=options.findIndex(o=>!o.mort);
  majActif();
}
function majActif(){
  qlist.querySelectorAll(".opt").forEach((el,i)=>el.setAttribute("aria-selected",String(i===actif)));
  if(actif<0) return void q.removeAttribute("aria-activedescendant");
  q.setAttribute("aria-activedescendant",`qo${actif}`);
  qlist.querySelector(`#qo${actif}`)?.scrollIntoView({block:"nearest"});
}
// Inert entries are skipped: stopping on a line where Enter will do nothing would give the
// impression that the keyboard is broken.
function bouger(pas){
  if(!options.length) return;
  let i=actif;
  for(let n=0;n<options.length;n++){
    i=(i+pas+options.length)%options.length;
    if(!options[i].mort){ actif=i; majActif(); return; }
  }
}
function choisir(i){
  const o=options[i];
  if(!o||o.mort) return;
  q.value=o.nom;
  fermerListe();
  q.blur();
  if(o.kind==="j") selectPlayer(o.id); else selectTeam(o.code);
}
q.addEventListener("input",majListe);
q.addEventListener("focus",()=>{ if(q.value.trim()) majListe(); });
q.addEventListener("keydown",e=>{
  if(e.key==="ArrowDown"){ e.preventDefault(); qlist.hidden?majListe():bouger(1); }
  else if(e.key==="ArrowUp"){ e.preventDefault(); bouger(-1); }
  else if(e.key==="Enter"){ if(actif>=0){ e.preventDefault(); choisir(actif); } }
  // Escape closes the list **and stops there**: the document's cascade undoes isolation and
  // drawers, which has nothing to do with a list open under the cursor.
  else if(e.key==="Escape"&&!qlist.hidden){ e.preventDefault(); e.stopPropagation(); fermerListe(); }
});
// `mousedown` rather than click, to keep the focus: without it the field loses focus before the
// click arrives, and the list closes under the finger.
qlist.addEventListener("mousedown",e=>e.preventDefault());
qlist.addEventListener("click",e=>{
  const el=e.target.closest(".opt[data-i]");
  if(el) choisir(+el.dataset.i);
});
document.addEventListener("click",e=>{ if(!(e.target.closest&&e.target.closest(".combo"))) fermerListe(); });

// ---------- drawers ----------
function setDrawer(id,open){
  const d=$(id); d.classList.toggle("open",open);
  // The search bar and the legend slide to the right of the filter drawer (CSS `.fopen`) so as
  // to stay readable instead of going under it.
  if(id==="filters") document.body.classList.toggle("fopen",open);
  $(id==="filters"?"openFilters":"openStats").setAttribute("aria-expanded",open);
  if(!open) closeTip();
}
$("openFilters").onclick=()=>{const o=!$("filters").classList.contains("open"); if(o&&innerWidth<900) setDrawer("statsDrawer",false); setDrawer("filters",o);};
$("openStats").onclick=()=>{const o=!$("statsDrawer").classList.contains("open"); if(o&&innerWidth<900) setDrawer("filters",false); setDrawer("statsDrawer",o);};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>setDrawer(b.dataset.close,false));
// Escape, at the head of the existing cascade: isolation first, then the tooltip, then the
// drawers. A single press gives back the whole map — two levels for two isolations would have to
// be guessed at, whereas "Escape undoes what I have just done" does not.
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape") return;
  if(toutMontrer()) return;
  if(!$("modeTip").hidden) return void closeTip();
  setDrawer("filters",false); setDrawer("statsDrawer",false);
});

function pill(container,label,color,on,onToggle,cls="pill"){
  const b=document.createElement("button"); b.type="button"; b.className=cls; b.setAttribute("aria-pressed",on);
  b.innerHTML=(color?`<i style="background:${color}"></i>`:"")+label;
  b.onclick=()=>b.setAttribute("aria-pressed",onToggle());
  container.appendChild(b); return b;
}
// The labels JavaScript writes once and for all — period, threshold and mode pills, and the two
// numbered note sentences — cannot go through `data-i18n`: they do not exist in the HTML. Each
// registers here along with what it takes to rewrite itself, and a language change replays the
// list. All the rest of the interface is already rebuilt by `render()` or by `apply()`, which go
// back through `tr()` every time.
const LIBELLES=[];
const libelle=fn=>{LIBELLES.push(fn); fn();};
const majLibelles=()=>LIBELLES.forEach(fn=>fn());

// ---------- period filter ----------
const yFrom=$("yFrom"), yTo=$("yTo");
// The split falls in 2020, the year the LMS stopped being a major region: it is the sharpest
// break in the data set after 2015 — 38 % of players in common between 2019 and 2020, and 7
// incoming organisations for 7 outgoing ones.
const ERAS=[
  ["ere.tout",ALL_YEARS[0],ALL_YEARS.at(-1)],
  ["ere.moderne",2020,ALL_YEARS.at(-1)],
  ["ere.historique",ALL_YEARS[0],2019],
];
function remplirAnnees(){
  // The upper bound only offers years ≥ the lower bound, and vice versa.
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
const eraBtns=ERAS.map(([cle,from,to])=>{
  const b=pill($("eras"),"",null,false,()=>{setPeriode(from,to); return true;},"pill mode");
  libelle(()=>{
    const label=tr(cle);
    b.innerHTML=from===ALL_YEARS[0]&&to===ALL_YEARS.at(-1)?label:`${label} <span class="hint">${from===ALL_YEARS[0]?"→ "+to:from+" →"}</span>`;
    b.title=tr(`${cle}.titre`,{n:ALL_YEARS.length,de:ALL_YEARS[0],a:ALL_YEARS.at(-1)});
  });
  return b;
});
yFrom.addEventListener("change",()=>setPeriode(+yFrom.value,state.yearTo));
yTo.addEventListener("change",()=>setPeriode(state.yearFrom,+yTo.value));

ROLES.forEach(r=>pill($("roles"),ROLE_NAME[r],`var(--${r})`,true,()=>{state.roles.has(r)?state.roles.delete(r):state.roles.add(r); apply(); return state.roles.has(r);}));
const regionBtns=new Map(REGIONS.map(r=>[r,pill($("regions"),r,regionVar(r),true,()=>{
  if(state.regions.has(r)){ if(state.regions.size===1) return true; state.regions.delete(r); } else state.regions.add(r);
  render(); return state.regions.has(r);
})]));
// The presence threshold can empty a whole region — the GPL as soon as "2+", four families at
// "3+". A ticked pill with no column behind it would be baffling: it therefore carries its
// count, and it is the count that says to lower the threshold.
//
// The `title` carries three things, one per line — a native `title` accepts line breaks: the
// name of the league, its geographic zone, then the column count. The code alone said neither
// what it is nor where it is played. A region with no collected name, or too wide and absent
// from `ZONES_ARBITREES`, simply skips its line: never an invented label.
function majRegionPills(){
  for(const [r,b] of regionBtns){
    const total=teams.filter(t=>t.region===r).length;
    const n=teams.filter(t=>t.region===r&&APPS.get(t.code)>=state.minApps).length;
    b.innerHTML=`<i style="background:${regionVar(r)}"></i>${r}`+(n<total?`<span class="cnt">${n}/${total}</span>`:"");
    const compte=n<total?trn("region.seuil",n,{total}):trn("region.compte",total);
    b.title=[LEAGUE_NAMES[r]||null,zoneDe(r),compte].filter(Boolean).join("\n");
  }
}
// ---------- hiding team columns ----------
// The checklist is the source of truth, the header's `×` a shortcut: a hidden column must be
// able to come back without guessing where to click. It is grouped by region and only lists the
// displayed regions, since hiding acts **inside** the subset kept by the region filter. A hidden
// team whose region is hidden afterwards stays hidden when that region comes back — "show all
// again" is the safety net that guarantees a one-gesture return.
// Presence threshold: "at least N Worlds appearances". One bound, not two — a period is an
// interval, a number of appearances is a threshold, and an upper bound would answer no question
// anybody asks.
const presenceBtns=PRESENCE.map(n=>{
  const b=pill($("presence"),`${n}+`,null,n===DEFAULT_MIN_APPS,()=>{
    state.minApps=n;
    presenceBtns.forEach(x=>x.setAttribute("aria-pressed",x===b));
    state.pinnedTeam=null; state.hover=null;
    render();
    return true;
  },"pill mode");
  const combien=teams.filter(t=>APPS.get(t.code)>=n).length;
  libelle(()=>{
    if(n===1){ b.textContent=tr("presence.toutes"); b.title=tr("presence.toutes.titre",{n:combien}); }
    else b.title=tr("presence.titre",{n:combien,total:teams.length,min:n});
  });
  return b;
});
// The two counts in the note under the filter: the number of columns with a single appearance,
// and the total. Computed, not written into the page — a collection run would move them.
libelle(()=>{
  $("presenceNote").textContent=tr("presence.note",{
    n:teams.filter(t=>APPS.get(t.code)===1).length,total:teams.length});
  $("statsNote").textContent=tr("stats.note",{
    n:teams.length,de:ALL_YEARS[0],a:ALL_YEARS.at(-1)});
});

const teamsList=$("teamsList"), teamsSum=$("teamsSum");
function renderTeamList(){
  const dedans=teams.filter(t=>state.regions.has(t.region)), n=dedans.filter(t=>state.hiddenTeams.has(t.code)).length;
  // Restore the focus: a full re-render of the list would wipe it on every ticked box.
  const actif=teamsList.contains(document.activeElement)?document.activeElement.dataset.team:null;
  const aff=dedans.length-n;
  teamsSum.textContent=n?trn("teams.affichees.sur",aff,{total:dedans.length}):trn("teams.affichees",dedans.length);
  let h="";
  REGIONS.filter(r=>state.regions.has(r)).forEach(r=>{
    const lot=dedans.filter(t=>t.region===r);
    h+=`<div class="tgrp"><div class="thd"><b><i style="background:${regionVar(r)}"></i>${r}</b>`
      +`<span><button type="button" data-rg="${r}" data-on="1">${tr("teams.toutes")}</button><button type="button" data-rg="${r}">${tr("teams.aucune")}</button></span></div><div class="labs">`
      +lot.map(t=>{
        // A team with no edition at all in the displayed period has no column: the box stays
        // useful but changes nothing until the period is widened.
        const vide=!YEARS.some(y=>t.years[y]);
        // A team under the presence threshold has no column either: its box stays ticked — it
        // is not what rules the team out — but the label says so.
        const sousSeuil=APPS.get(t.code)<state.minApps;
        // Both refusals state the same rule as `sansColonne()`, and therefore read in the same
        // terms: one string per cause, one single place where it is written.
        const pourquoi=vide?` · ${tr("refus.periode")}`:sousSeuil?` · ${trn("refus.seuil",APPS.get(t.code))}`:"";
        return `<label class="toggle tm${vide||sousSeuil?" vide":""}" title="${t.name}${pourquoi}"><input type="checkbox" data-team="${t.code}"${state.hiddenTeams.has(t.code)?"":" checked"}> ${shortName(t)}</label>`;
      }).join("")+`</div></div>`;
  });
  if(state.hiddenTeams.size) h+=`<button type="button" class="pill mode" data-showall="1">${tr("teams.reafficher",{n:state.hiddenTeams.size})}</button>`;
  teamsList.innerHTML=h;
  if(actif) teamsList.querySelector(`input[data-team="${actif}"]`)?.focus();
}
// Hiding the last column would empty the map: we stop short of that. Hence the test on every
// pass rather than once and for all — "None" on the only displayed region leaves one team
// standing instead of doing nothing.
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
  // Refusal (last column): the box returns to its state, `render` not having taken place.
  if(!setHidden([cb.dataset.team],!cb.checked)) cb.checked=!cb.checked;
});
teamsList.addEventListener("click",e=>{
  const b=e.target.closest("button"); if(!b) return;
  if(b.dataset.showall) return void setHidden([...state.hiddenTeams],false);
  if(b.dataset.rg) setHidden(teams.filter(t=>t.region===b.dataset.rg).map(t=>t.code),!b.dataset.on);
});

// The mode does not only decide the highlighting: with an isolation set, it also decides which
// columns are kept — all those the team's players went through, or only the clubs before and
// after, 27 columns at worst against 16. Hence `apresSelection()` and not `apply()`: changing
// mode changes the set of columns, and therefore calls for a new layout.
const modeBtns=["players","lineage"].map(m=>{
  const b=pill($("teamMode"),"",null,m==="players",()=>{state.teamMode=m; modeBtns.forEach(x=>x.setAttribute("aria-pressed",x===b)); apresSelection(); return true;},"pill mode");
  libelle(()=>{ b.textContent=tr(`mode.${m}`); b.title=tr(`mode.${m}.titre`); });
  return b;
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

// ---------- statistics ----------
// A function and no longer an immediate block: the seven tables carry titles and notes, and a
// language change must rewrite them. The measures are recomputed along with them — they depend
// on no filter, so the cost is a single pass over 749 players, once per toggle.
function renderStats(){
  const plist=[...players.values()];
  // All these measures count **Worlds**: "most Worlds", "from one Worlds to the next",
  // "starters". A step outside Worlds is not one, and the column it goes through does not always
  // have a region — `flow[null]` would crash the drawer.
  const mondiaux=p=>p.apps.filter(a=>!a.step);
  const btn=p=>`<button type="button" class="pl" data-id="${p.id}">${p.name}</button>`;
  const most=plist.map(p=>({p,n:mondiaux(p).length})).sort((a,b)=>b.n-a.n||a.p.name.localeCompare(b.p.name)).slice(0,10);
  const trav=plist.map(p=>({p,n:new Set(mondiaux(p).map(a=>a.team.code)).size})).filter(x=>x.n>=3).sort((a,b)=>b.n-a.n||mondiaux(b.p).length-mondiaux(a.p).length).slice(0,10);
  // Two different travellers, and confusing the two was the mistake: the first counts the teams
  // **one went to Worlds with**, the second every club passed through, steps outside Worlds and
  // columnless clubs included.
  const carr=plist.map(p=>({p,n:new Set(p.apps.map(a=>a.team.code)).size,w:new Set(mondiaux(p).map(a=>a.team.code)).size}))
    .filter(x=>x.n>=4).sort((a,b)=>b.n-a.n||a.p.name.localeCompare(b.p.name)).slice(0,10);
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
  plist.forEach(p=>{const w=mondiaux(p); w.forEach((a,k)=>{const b=w[k+1]; if(b&&b.team!==a.team) flow[a.team.region][b.team.region]++;});});
  const fmax=Math.max(...REGIONS.flatMap(a=>REGIONS.map(b=>flow[a][b])));
  const imp={}; REGIONS.forEach(r=>{imp[r]={}; ALL_YEARS.forEach(y=>{
    const s=apps.filter(a=>a.year===y&&a.team.region===r);
    imp[r][y]=s.length?{i:s.filter(isImport).length,n:s.length}:null;
  });});
  let h=`<div class="st"><h3>${tr("st.most")}</h3><ol>${most.map(x=>`<li>${btn(x.p)}<span class="v">${x.n}</span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>${tr("st.trav")}</h3><p class="note">${tr("st.trav.note")}</p><ol>${trav.map(x=>`<li>${btn(x.p)}<span class="v">${trn("st.trav.unite",x.n)}</span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>${tr("st.carr")}</h3><p class="note">${tr("st.carr.note")}</p><ol>${carr.map(x=>`<li>${btn(x.p)}<span class="v">${trn("st.carr.unite",x.n)} <small>${tr("st.carr.worlds",{n:x.w})}</small></span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>${tr("st.stable")}</h3><p class="note">${tr("st.stable.note")}</p><ol>${stable.map(s=>`<li><span><button type="button" class="pl tl" data-team="${s.t.code}">${shortName(s.t)}</button> ${s.from}–${s.to}<br><span class="note">${s.names}</span></span><span class="v">${trn("st.stable.unite",s.n)}</span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>${tr("st.flow")}</h3><p class="note">${tr("st.flow.note")}</p><div class="tw"><table class="fl"><tr><th></th>${REGIONS.map(r=>`<th>→ ${r}</th>`).join("")}</tr>${REGIONS.map(a=>`<tr><th>${a}</th>${REGIONS.map(b=>`<td style="--a:${Math.round(flow[a][b]/fmax*70)}%">${flow[a][b]||"·"}</td>`).join("")}</tr>`).join("")}</table></div></div>`;
  h+=`<div class="st"><h3>${tr("st.imp")}</h3><p class="note">${tr("st.imp.note")}</p><div class="tw"><table class="fl"><tr><th></th>${ALL_YEARS.map(y=>`<th>${String(y).slice(2)}</th>`).join("")}</tr>${REGIONS.map(r=>`<tr><th>${r}</th>${ALL_YEARS.map(y=>{const c=imp[r][y]; return c?`<td style="--a:${Math.round(c.i/c.n*90)}%">${c.i}<small>/${c.n}</small></td>`:`<td class="na">–</td>`;}).join("")}</tr>`).join("")}</table></div></div>`;
  $("stats").innerHTML=h;
  majStatsTeams();
}
// Two shortcuts on the same list: a player name, a team name. The `data-team` test comes first,
// the team button also carrying the `.pl` class. The listener is attached **once**, on the
// container `renderStats()` does not replace: without that, every language change would add
// one more.
$("stats").addEventListener("click",e=>{
  const te=e.target.closest("button[data-team]");
  // The drawer only closes if the selection actually took place: on a refusal, the greyed-out
  // entry must stay in sight with its reason.
  if(te){ if(selectTeam(te.dataset.team)&&innerWidth<900) setDrawer("statsDrawer",false); return; }
  const b=e.target.closest(".pl"); if(!b) return; if(innerWidth<900) setDrawer("statsDrawer",false); selectPlayer(b.dataset.id);
});

// ---------- language switching ----------
// The selector is only a toggle between two languages: it carries the code of the one being
// switched to.
$("lang").onclick=()=>setLang(LANGS.find(l=>l!==lang()));
// What the dictionary cannot reach on its own. `appliquer()` has already rewritten the static
// HTML by the time we get here; what is left is the labels JavaScript writes, the seven
// statistics tables, the whole map — headers, axis, tooltips, legend, detail panel —, and the
// search list if it is open under the cursor.
surChangement(()=>{
  majLibelles();
  renderStats();
  render();
  if(!qlist.hidden) majListe();
});

// ---------- start-up ----------
// The legend is closed by default at every width (the `open` attribute removed from the HTML):
// there is therefore no narrow case left to catch up on here.
remplirAnnees();
renderStats();
render();
view.k=innerWidth<700?.7:.9; view.x=16; view.y=70; applyView();

// Deep link: `?q=` opens the map on an already selected player or team. The scope stops there —
// serialising the filters, the period and the zoom into the URL is another feature, and it is
// not being asked for. The value goes through the **same** search as the bar, so a team code, a
// full name, a short label or a period handle all work, accents and case notwithstanding;
// nothing happens if it finds nothing.
{
  const cherche=new URLSearchParams(location.search).get("q");
  if(cherche?.trim()){
    const trouve=chercher(cherche)[0];
    if(trouve){
      q.value=trouve.nom;
      if(trouve.kind==="j") selectPlayer(trouve.id); else selectTeam(trouve.code);
    }
  }
}
