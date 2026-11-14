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

let TEAMS_DATA, RESULTS_DATA, PLAYERS_DATA, CAREERS_DATA;
try {
  [TEAMS_DATA, RESULTS_DATA, PLAYERS_DATA, CAREERS_DATA] = await Promise.all(["teams", "results", "players", "careers"].map(loadJSON));
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
// Nom de la ligue derrière chaque sigle de région, collecté dans `Leagues.League` (§ 15 du
// rapport de collecte). C'est le nom de la ligue **aujourd'hui**, alors qu'une famille de
// colonnes couvre seize ans : la LEC s'est appelée « EU LCS » la moitié de sa vie. Le sigle
// d'une pilule est donc un nom de famille de colonnes, pas la ligue d'une année donnée — la
// région d'une rangée, elle, se décide à l'année de son édition (docs/SOURCES.md,
// « Périmètre »). D'où un libellé sobre, qui ne s'énonce pas comme une vérité historique.
const LEAGUE_NAMES = TEAMS_DATA.leagueNames || {};
// Zone géographique d'une région, écrite au survol de sa pilule à côté du nom de ligue.
//
// Elle se **dérive de `homeCountries`**, et non de `Leagues.Region` qui arrive dans la même
// requête : sur LPL, la source dit « China » alors que la carte compte Taïwan et Hong Kong
// domestiques — l'infobulle contredirait le badge « importé » affiché à quelques pixels de
// là. `Leagues.Region` est par ailleurs circulaire sur LMS (« LMS ») et approximatif sur LCP.
// `homeCountries` est le territoire que la carte utilise réellement, déjà arbitré région par
// région avec sa justification écrite, et déjà dans /data : aucune collecte.
const ZONE_MAX = 3; // au-delà, la liste des pays est illisible dans une infobulle
// Les trois régions que `ZONE_MAX` écarte — LEC (25 pays), LCL (8), LLA (7) — reçoivent un
// libellé court, et ce sont les **seuls** textes nouveaux de l'entrée : le projet les écrit
// déjà ailleurs (« espace post-soviétique » est dans index.html et dans docs/SOURCES.md).
// Table arbitrée : on n'invente pas le nom d'un territoire, pas plus qu'on n'abrège un nom
// d'équipe de soi-même. Une région trop large qui n'y figure pas n'affiche **pas** de zone.
const ZONES_ARBITREES = {
  LEC: "Europe",
  LCL: "espace post-soviétique",
  LLA: "Amérique latine",
};
// « Thaïlande, Philippines et Singapour » — liste en français, le dernier séparé par « et ».
function zoneDe(region) {
  const pays = HOME[region] || [];
  if (!pays.length) return null;
  if (pays.length > ZONE_MAX) return ZONES_ARBITREES[region] || null;
  const noms = pays.map(c => COUNTRY[c] || c);
  return noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}` : noms[0];
}
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

// ---------- étapes de carrière hors Worlds (data/careers.json) ----------
// Une étape dit **où était le joueur** une année sans rangée, entre deux de ses apparitions.
// Elle entre dans le fil comme une apparition de plus, pour que la ligne ne saute plus le
// trou, mais elle reste grise : ce n'est pas une rangée de Worlds, et la distinction doit
// survivre à tout réglage.
//
// Le club traversé n'a pas toujours de colonne — il n'est jamais allé aux Worlds. Il reçoit
// alors une pseudo-équipe qu'aucun filtre ne peut rendre visible, et tombe donc dans
// « Autres équipes » par le prédicat existant, sans cas particulier ailleurs.
const CAREERS = CAREERS_DATA.careers || {};
// Sigle des clubs sans colonne, replié par le script depuis `Teams.Short` comme un code de
// colonne. Un club que la source ne sait pas abréger n'y figure pas : sa case restera sans
// badge plutôt que de porter une abréviation inventée.
const CLUB_SIGLES = CAREERS_DATA.clubs || {};
const byCode = new Map(teams.map(t => [t.code, t]));
const clubTeams = new Map();
const clubTeam = name => {
  if (!clubTeams.has(name)) clubTeams.set(name, { code: `@${name}`, name, label: name, tag: CLUB_SIGLES[name] || null, region: null, i: -1, active: [], years: {}, club: true });
  return clubTeams.get(name);
};
// Première et dernière année où une partie est recensée au joueur : les deux bornes que les
// marques de bout affichent. Elles ne disent **pas** une carrière — un joueur encore actif
// n'a peut-être pas requalifié, et la source ne couvre pas tout.
const SEEN = new Map();
// Années-trous sans la moindre partie recensée. Le mot s'arrête là : « aucune partie
// professionnelle recensée », jamais « sans club ».
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
      // `offLevel` : le joueur a joué, mais rien qui soit de niveau Primary. On n'en dit rien
      // — surtout pas qu'il n'a pas joué.
      if (!entry.offLevel) {
        if (!VOIDS.has(p.id)) VOIDS.set(p.id, new Set());
        VOIDS.get(p.id).add(year);
      }
      continue;
    }
    // Le poste est celui de la dernière apparition d'avant : le fil garde son couloir de
    // colonne au lieu de changer de voie sur une année dont la source ne dit pas le poste.
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

// Une étape n'a pas de région propre : elle hérite de celle de sa colonne, qui est un
// emplacement sur la carte et non une affirmation sur la ligue jouée cette année-là. Un club
// sans colonne n'en a aucune, d'où la garde — `HOME[null]` ferait planter la carte.
const isImport = a => !a.step && NAT[a.id] && !HOME[a.team.region].includes(NAT[a.id]);
// ancienneté : n-ième Worlds du joueur avec cette équipe. Une étape n'en est pas un.
players.forEach(p => { const c = {}; p.apps.forEach(a => { if (a.step) { a.sen = 0; return; } c[a.team.code] = (c[a.team.code] || 0) + 1; a.sen = c[a.team.code]; }); });

// ---------- rendu ----------
const CW=132, STEP=24, CH=20, TOPPAD=30, ROWH=250;
const PADX=8, chipW=CW-PADX*2;
const KMIN=0.15, KMAX=2.5;
const $=id=>document.getElementById(id);
const vp=$("vp"), world=$("world"), hdr=$("hdr"), rail=$("rail");
const yTop=y=>YEARS.indexOf(y)*ROWH+TOPPAD;
const regionVar=r=>`var(--${r.toLowerCase()})`;
const shortName=t=>t.label||t.code;
// Badge d'une case de « Autres équipes ». Une colonne porte son code. Un club sans colonne
// porte le sigle de `CLUB_SIGLES`, et **rien du tout** s'il n'en a pas : son nom entier dans un
// badge taillé pour trois lettres écrasait le pseudo du joueur en ellipse, puisque `.t` ne se
// comprime pas et que `.n` est le seul à le faire.
const tagDe=t=>t.club?t.tag:(t.tag||t.code);
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
// Gouttière entre deux blocs d'éditions : la hauteur libre au-dessus d'un bloc, celle que
// marque déjà le trait d'année. Elle borne le coude ci-dessous — au-delà, il viendrait
// chercher le bloc voisin.
const GOUTTIERE=70;
// Hauteur d'un coude, désormais fonction de l'écart latéral qu'il doit franchir.
//
// Elle valait `ELBOW`, 14 px, quel que soit le déport. Pour un fil qui rejoint la demi-case
// de droite d'un poste partagé, c'est 63 px à franchir en 14 px de hauteur — un rapport de
// 4,5:1, d'où le S écrasé collé au-dessus de la case. Le poste partagé ne faisait que créer
// le décalage ; le défaut était que le coude ne s'y adaptait pas, et le correctif n'a donc
// pas à connaître les demi-cases.
//
// Le fil commence maintenant son déport d'autant plus tôt qu'il a plus de chemin à faire, et
// le S s'étale au lieu de se replier. `ELBOW` reste le plancher : un fil sans déport — le cas
// général, une case pleine, dont l'attache **est** le couloir — garde exactement son coude
// d'avant, et sa courbe reste d'ailleurs une verticale droite.
const PENTE=0.9;
const coude=(dx,place)=>Math.min(Math.max(ELBOW,Math.abs(dx)*PENTE),Math.max(ELBOW,place));
// Demi-largeur de la barre qui ferme les deux bouts du fil (#7a). Sa hampe, elle, n'a pas de
// longueur propre : elle court jusqu'à la jonction entre deux éditions (voir `cap`).
const CAP=9;
// La barre s'arrête **avant** la ligne de séparation plutôt que dessus. Une fin de carrière et
// un début à l'édition suivante tombent sinon au même endroit, dans le même couloir si c'est
// le même poste, et les deux marques se confondent en une seule — Dyrus s'arrêtant chez TSM en
// 2015, Hauntzer y arrivant en 2016. De part et d'autre de la ligne, elles se lisent comme
// deux faits distincts, et la ligne garde son rôle de frontière.
const CAP_MARGE=8;
// Vingt couples ordonnés de postes distincts, donc vingt dégradés, posés une fois pour toute
// la carte. Un segment prenait la couleur de `B.a.role`, le poste **d'arrivée** : le trajet
// entier d'un jungler devenu mid était peint en mid, et la couleur disait l'arrivée au lieu
// de dire le changement.
//
// En `objectBoundingBox`, les coordonnées sont relatives à la boîte de chaque tracé : le même
// dégradé sert tous les segments du même couple, quelle que soit leur longueur, et il n'y a
// rien à calculer par segment. Deux arrêts francs à 50 % et non un fondu — la couleur doit
// dire « ici, il change de poste », pas étaler l'incertitude sur tout le trajet.
//
// `stop-color` passe par `style` et non par un attribut de présentation, qui ne résout pas
// `var()` partout ; le tracé, lui, porte son dégradé en attribut `stroke` plutôt qu'en classe,
// pour que les vingt couples n'aient pas à être redits un à un dans la feuille de style.
const ROLE_GRADS=ROLES.flatMap(a=>ROLES.filter(b=>b!==a).map(b=>
  `<linearGradient id="rg-${a}-${b}" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">`
  +`<stop offset="50%" style="stop-color:var(--${a})"/><stop offset="50%" style="stop-color:var(--${b})"/></linearGradient>`)).join("");
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
  yearFrom:Math.max(ALL_YEARS[0],DEFAULT_FROM),yearTo:ALL_YEARS.at(-1),
  // Les deux isolements. Ils ne remplacent pas la sélection : le survol et le clic simple
  // gardent exactement le comportement d'avant — surbrillance, aucune remise en page. Ce sont
  // deux gestes de plus, et chacun a son propre contrôle : l'axe des années pour `annee`, un
  // bouton du panneau de détail pour `isole`.
  annee:null, isole:false};
// Une colonne est affichée si sa région l'est, **et** si elle atteint le seuil de présence,
// **et** si l'équipe n'est pas masquée une à une : les trois filtres se cumulent, chacun
// agissant à l'intérieur du sous-ensemble déjà retenu par les précédents. Une équipe écartée
// par l'un des trois se déverse dans « Autres équipes » exactement comme une région masquée —
// c'est le même prédicat qui décide, partout.
const visible=t=>state.regions.has(t.region)&&APPS.get(t.code)>=state.minApps&&!state.hiddenTeams.has(t.code);
// Et une colonne n'est dessinée que si l'équipe a au moins une édition dans la période : c'est
// ce compte-là, et non `visible` seul, qui dit s'il reste quelque chose à l'écran.
// Isolement d'une édition (#5) : les participants de l'année, **plus** les équipes d'où
// viennent ses joueurs et où ils vont l'année d'avant et l'année d'après. Une édition sans ses
// deux voisines n'énumère que des rosters — la carte parle de transferts, et c'est le voisinage
// qui porte le mouvement. Mesuré : de 9 à 40 colonnes sur 120 selon l'édition, 40 en 2019.
const colonnesDeLEdition=N=>{
  const codes=new Set(teams.filter(t=>t.years[N]).map(t=>t.code));
  const surN=new Set(apps.filter(a=>a.year===N).map(a=>a.id));
  for(const a of apps) if(Math.abs(a.year-N)===1&&surN.has(a.id)) codes.add(a.team.code);
  return codes;
};
// Isolement de la sélection (#9) : les colonnes par lesquelles elle est passée. Pour un
// joueur, ses clubs, étapes hors Worlds comprises — 1 à 7 colonnes, médiane 1. Pour une
// équipe, les colonnes avec lesquelles elle a échangé des joueurs, selon le mode de clic
// choisi dans les filtres : 27 colonnes au pire en « carrières complètes » (TL), 16 en
// « arrivées et départs ». Ce n'est pas au raccourci de décider du mode.
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
// Les deux isolements **se cumulent**, comme les trois filtres se cumulent déjà entre eux :
// chacun agit à l'intérieur du sous-ensemble retenu par les précédents, donc l'intersection.
// `null` quand aucun n'est posé, et c'est ce qui garde `colonne()` à son coût d'avant.
let reduction=null;
// La seule part de l'édition isolée, tenue à part : un clic simple sort de l'isolement de
// sélection mais **pas** de celui-là, qui a son propre contrôle. Les refus qui se jugent sur
// la carte d'après — un raccourci du tiroir de statistiques — s'y réfèrent.
let reductionAnnee=null;
const croiser=jeux=>jeux.length?jeux.reduce((a,b)=>new Set([...a].filter(c=>b.has(c)))):null;
const reduire=()=>{
  reductionAnnee=state.annee!=null?colonnesDeLEdition(state.annee):null;
  const jeux=[];
  if(reductionAnnee) jeux.push(reductionAnnee);
  if(state.isole){ const s=colonnesIsolees(); if(s) jeux.push(s); }
  return croiser(jeux);
};
// Les colonnes que **laisserait** un isolement, sans toucher à l'état. Deux réductions qui se
// cumulent peuvent ne rien laisser — mesuré, plus de la moitié des couples joueur × édition —
// et c'est ce qui permet de le dire avant le clic, en grisant le contrôle, plutôt que de
// laisser un bouton qui ne fait rien ou de vider la carte.
function colonnesSi({annee=state.annee,isole=state.isole}={}){
  const ys=ALL_YEARS.filter(y=>y>=state.yearFrom&&y<=state.yearTo&&(annee==null||Math.abs(y-annee)<=1));
  const jeux=[];
  if(annee!=null) jeux.push(colonnesDeLEdition(annee));
  if(isole){ const s=colonnesIsolees(); if(s) jeux.push(s); }
  const r=croiser(jeux);
  return teams.filter(t=>visible(t)&&(!r||r.has(t.code))&&ys.some(y=>t.years[y]));
}
// Les rangées affichées : la période, puis l'édition isolée et ses deux voisines. L'isolement
// **ne réécrit pas** la période — les deux réductions restent lisibles séparément, et sortir de
// l'isolement rend la période telle qu'elle était. Une édition de bout — 2011, 2026 — n'a
// qu'une voisine, et l'intersection avec la période s'en charge sans cas particulier.
const majYears=()=>{
  YEARS=ALL_YEARS.filter(y=>y>=state.yearFrom&&y<=state.yearTo);
  // Resserrer la période sur une édition isolée lui retirerait sa rangée : l'isolement tombe
  // alors avec elle, plutôt que de laisser la carte sans aucune rangée à dessiner.
  if(state.annee!=null&&!YEARS.includes(state.annee)) state.annee=null;
  if(state.annee!=null) YEARS=YEARS.filter(y=>Math.abs(y-state.annee)<=1);
};
const colonne=t=>visible(t)&&(!reduction||reduction.has(t.code))&&YEARS.some(y=>t.years[y]);
// Pourquoi l'équipe n'a **pas** de colonne à cet instant, ou `null` si elle en a une : la
// négation de `colonne()`, détaillée cause par cause. Un raccourci de lecture qui viserait une
// colonne absente doit dire laquelle des quatre l'écarte, et le vocabulaire est celui de la
// liste à cocher du tiroir — les deux refus énoncent la même règle, à deux endroits.
// `ignorerSelection` : juger sur la carte **d'après** le geste. Un raccourci de lecture change
// la sélection, donc sort de l'isolement de sélection — une équipe que celui-ci écartait
// redevient atteignable, et la refuser serait refuser pour une raison qui n'existera plus.
const sansColonne=(t,ignorerSelection=false)=>{
  const red=ignorerSelection?reductionAnnee:reduction;
  if(!YEARS.some(y=>t.years[y])) return "aucune édition dans la période affichée";
  if(APPS.get(t.code)<state.minApps) return `${APPS.get(t.code)} apparition${APPS.get(t.code)>1?"s":""}, sous le seuil de présence`;
  if(!state.regions.has(t.region)) return `région ${t.region} décochée`;
  if(state.hiddenTeams.has(t.code)) return "colonne masquée";
  if(red&&!red.has(t.code)) return ignorerSelection?`aucune rangée sur l'édition ${state.annee} isolée ni ses voisines`:"hors de l'isolement en cours";
  return null;
};
const view={x:0,y:0,k:1};
let nodesByPlayer=new Map(), hasOther=false, W=0, cols=[];

// ---------- rendu de la carte ----------
function render(){
  // Une sélection d'équipe que les filtres viennent d'écarter tombe, et l'isolement qui la
  // suivait tombe avec elle. **Avant** de calculer la réduction : sinon la carte se dessinerait
  // une fois sur une sélection qui n'existe plus, et l'isolement garderait ses colonnes.
  if(state.pinnedTeam){
    const t=byCode.get(state.pinnedTeam);
    if(!t||!visible(t)||!ALL_YEARS.some(y=>y>=state.yearFrom&&y<=state.yearTo&&t.years[y])) state.pinnedTeam=null;
  }
  if(state.isole&&!state.pinned&&!state.pinnedTeam) state.isole=false;
  majYears(); reduction=reduire();
  H=YEARS.length*ROWH+20;
  const vues=new Set(YEARS);
  const inRange=a=>vues.has(a.year);
  // Sur une édition isolée, les deux rangées voisines ne montrent que les **arrivées et les
  // sorties** : les joueurs qui sont aussi sur l'édition. Le reste de leur roster n'apprend
  // rien sur le mouvement qu'on est venu lire, et le ferait disparaître dans la masse.
  const surEdition=state.annee==null?null:new Set(apps.filter(a=>a.year===state.annee).map(a=>a.id));
  const garde=a=>!surEdition||a.year===state.annee||surEdition.has(a.id);

  // « Autres équipes » n'accueille que ce qui est masqué — région ou équipe. Une équipe
  // écartée par la période ne doit pas y tomber : les deux tests restent séparés.
  const vis=teams.filter(colonne);
  const visSet=new Set(vis);
  // La colonne n'apparaît que si elle a quelque chose à montrer : un joueur présent dans une
  // colonne visible **et** dans une équipe masquée, sur la plage affichée. Sans ce test, masquer
  // la LMS sur 2020–2026 ouvrirait une colonne vide, la région n'y ayant aucune rangée.
  hasOther=[...players.values()].some(p=>{
    const dans=p.apps.filter(a=>inRange(a)&&garde(a));
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

  // Place d'une étape dans une case de colonne. Elle garde le poste de l'apparition d'avant —
  // le fil reste dans son couloir — mais ce poste est parfois déjà tenu : Nagne était chez
  // NaJin en 2014, l'année où Ggoong y a joué les Worlds. Les deux sont vrais, et l'étape
  // n'est pas un poste de la rangée.
  //
  // Elle prend alors la **demi-case de droite**, collée au titulaire, exactement comme un
  // poste partagé — en pointillé, et seulement au focus. Le titulaire ne se resserre qu'au
  // moment où l'étape paraît : au repos sa case est pleine, inchangée. C'est `apply()` qui
  // s'en charge, l'étape portant dans `data-voisin` la case à resserrer.
  //
  // 18 cas sur 371, dont 4 entre deux étapes — les deux sont alors des demi-cases. Aucune
  // saturation à ce jour : une étape tombant sur un poste **déjà** coupé en deux descendrait
  // sous les cinq, faute de place.
  const placeEtape=new Map();
  {
    const cle=(a)=>`${a.id}:${a.year}:${a.team.code}`;
    const tenu=new Map(); // « code:année:poste » → occupants de la case, titulaires compris
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
        // Deux étapes sur le même poste : les deux sont des demi-cases, rien à resserrer.
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
          // Le couloir reste celui du poste hérité : seule la case bouge dans sa cellule.
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
    // Les chips de Worlds prennent les sous-colonnes de gauche, les étapes celles d'après :
    // les étapes ne se montrant qu'au focus, la colonne reste compacte à l'œil au repos.
    list.sort((m,n)=>m.a.ri-n.a.ri||(m.a.step?1:0)-(n.a.step?1:0)||m.a.half-n.a.half||m.a.name.localeCompare(n.a.name));
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
    const top=yTop(ys[0])-GOUTTIERE, bottom=yTop(ys.at(-1))+ROWH-GOUTTIERE;
    html+=`<div class="colbg" style="left:${c.x}px;top:${Math.max(0,top)}px;width:${c.w}px;height:${Math.min(H,bottom)-Math.max(0,top)}px"></div>`;
  });
  YEARS.forEach((y,j)=>{ if(j) html+=`<div class="yrule" style="top:${yTop(y)-GOUTTIERE}px;width:${W}px"></div>`; });
  let paths="";
  // Deux fils, et un seul visible à la fois.
  //
  //  - le **raccourci** (`base`) saute l'année-trou d'une apparition de Worlds à la suivante,
  //    comme la carte le faisait avant les étapes. C'est lui qu'on voit au repos : sans cela,
  //    des centaines de lignes partent vers « Autres équipes », tout à droite de 120 colonnes,
  //    et la carte devient illisible pour une information qu'on ne lit qu'un joueur à la fois ;
  //  - le **détail** (`deep`) passe par les étapes, et ne paraît qu'au focus, avec elles.
  //
  // Un segment qui ne touche aucune étape est commun aux deux : il n'est tracé qu'une fois.
  const segment=(A,B,cls)=>{
    const x1=A.lane,y1=A.y+CH/2,x2=B.lane,y2=B.y+CH/2,b0=A.bottom,t1=yTop(B.a.year)-6;
    const ax=attache(A), bx=attache(B);
    // Changement de poste : le segment porte un dégradé qui bascule net en son milieu, au
    // lieu de la seule couleur d'arrivée. Le couple est choisi par la position **à l'écran**
    // et non par la chronologie, le dégradé descendant du haut de la boîte vers le bas : un
    // segment `duo` qui remonte inverserait sinon ses deux couleurs.
    const haut=A.y<=B.y?A:B, bas=haut===A?B:A;
    const meme=A.a.role===B.a.role;
    const teinte=meme?` ${B.a.role}`:"";
    const peint=meme?"":` stroke="url(#rg-${haut.a.role}-${bas.a.role})"`;
    if(A.a.year===B.a.year){
      // Un segment `duo` est une diagonale courte, et on a hésité à lui donner un autre
      // traitement : non, une règle et une seule. Le milieu du tracé est le milieu du tracé.
      paths+=`<path class="l${teinte} move duo${cls}"${peint} data-p="${A.a.id}" data-de="${A.a.id}:${A.a.year}" data-vers="${B.a.id}:${B.a.year}" data-r="${B.a.role}" d="M${ax},${y1} L${bx},${y2}"/>`;
      return;
    }
    const creux=VOIDS.get(A.a.id);
    let vide=false;
    if(creux) for(let y=A.a.year+1;y<B.a.year;y++) if(creux.has(y)) vide=true;
    // Les deux coudes prennent leur hauteur de l'écart latéral qu'ils franchissent, et leur
    // place de la gouttière voisine : sous le bloc de A au départ, au-dessus de celui de B à
    // l'arrivée. Les corriger tous les deux, sinon le même fil porterait deux coudes de
    // factures différentes — celui du départ a seulement plus de place sous lui, donc il se
    // voyait moins.
    const y0=A.y+CH;
    const yd=y0+coude(x1-ax,yTop(A.a.year)+ROWH-GOUTTIERE-y0), sd=(yd-y0)*.6;
    const yu=bx===x2?t1:B.y-coude(bx-x2,B.y-(yTop(B.a.year)-GOUTTIERE));
    const te=Math.min(t1,yu);
    // Un coude de départ assez haut déborde sous le bas du bloc, dans la gouttière : c'est là
    // que commence alors la grande courbe inter-années, et elle ne peut pas descendre sous le
    // point d'arrivée de celle-ci.
    const bd=Math.min(Math.max(b0,yd),te), su=(B.y-yu)*.6, m=(te-bd)*.55;
    paths+=`<path class="l${teinte} ${A.a.team===B.a.team?"same":"move"}${vide?" void":""}${cls}"${peint} data-p="${A.a.id}" data-de="${A.a.id}:${A.a.year}" data-vers="${B.a.id}:${B.a.year}" data-r="${B.a.role}" d="M${ax},${y1} L${ax},${y0} C${ax},${y0+sd} ${x1},${yd-sd} ${x1},${yd} L${x1},${bd} C${x1},${bd+m} ${x2},${te-m} ${x2},${te} L${x2},${yu} C${x2},${yu+su} ${bx},${B.y-su} ${bx},${B.y} L${bx},${y2}"/>`;
  };
  nodesByPlayer.forEach((ns,id)=>{
    for(let k=1;k<ns.length;k++) segment(ns[k-1],ns[k],(ns[k-1].a.step||ns[k].a.step)?" deep":"");
    // Raccourci : seulement là où le détail s'en écarte, c'est-à-dire par-dessus une étape.
    const mondiaux=ns.map((n,i)=>({n,i})).filter(x=>!x.n.a.step);
    for(let j=1;j<mondiaux.length;j++){
      if(mondiaux[j].i-mondiaux[j-1].i>1) segment(mondiaux[j-1].n,mondiaux[j].n," base");
    }
    // Amorce et terminaison du fil. Les deux bouts ne sont posés que si la chip dessinée
    // **est** la première ou la dernière apparition du joueur : la plage d'années comme les
    // blocs écartés par `retenues` coupent le fil sans le terminer, et une marque y
    // mentirait. Elles ne paraissent qu'au survol, comme la note le demande.
    //
    // La marque dit où s'arrête le fil **dessiné**, c'est-à-dire les Worlds. Ce que la source
    // recense au-delà est une autre chose, et c'est `seen` qui la porte, dans le panneau de
    // détail : 567 joueurs ont une partie après leur dernier Worlds.
    const suite=players.get(id).apps;
    // La barre se pose sur la **ligne de séparation entre deux éditions** — le trait d'année
    // lui-même — et la hampe court jusqu'à elle depuis la case. Elle a d'abord été posée à
    // 9 px du bord de la chip, donc dans la rangée du poste voisin, où elle se lisait comme la
    // marque du joueur du dessus ; puis au bord du bloc de cinq rangées, ce qui la laissait
    // encore flotter dans la gouttière. Sur la ligne, elle dit sans ambiguïté possible que le
    // fil commence ou s'arrête **entre ces deux années-là**.
    //
    // La hampe croise les rangées intermédiaires de la colonne, comme le fait déjà toute
    // ligne : les chips sont peintes par-dessus le SVG. Au-dessus de la première rangée
    // affichée il n'y a pas de ligne — on s'arrête alors au bord du monde, comme le fait déjà
    // le fond de colonne.
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
      // Hors de la fenêtre d'activité, rien n'est dessiné : l'org n'existait pas encore,
      // ou plus. « Pas aux Worlds » ne vaut que pendant son existence.
      // Le libellé reste : les étapes ne s'affichent qu'au focus, et c'est `apply()` qui le
      // fait taire sur les seules cases dont une étape est effectivement montrée.
      if(!e){ if(y>=from&&y<=to) html+=`<div class="absent" data-cell="${t.code}:${y}" style="left:${cx}px;top:${top}px;width:${chipW}px;height:${5*STEP-4}px"><span>Pas aux Worlds</span></div>`; return; }
      const r=RES[y]?.[t.code];
      if(e.alias) html+=`<div class="alias" style="left:${cx}px;top:${top-16}px;width:${r?chipW-56:chipW}px">${e.alias}</div>`;
      if(r) html+=`<div class="res${r==="W"?" win":""}" style="left:${cx}px;top:${top-16}px;width:${chipW}px">${RES_LABEL[r]}</div>`;
    });
  });
  nodesByPlayer.forEach(ns=>ns.forEach(n=>{
    const a=n.a, label=a.alias||a.team.name, nat=NAT[a.id];
    // Une étape prend la demi-case de droite quand son poste est déjà tenu : même forme
    // qu'un poste partagé, mais elle n'en est pas un — pas de « duo », pas de poste du tout.
    const demi=n.demi??(a.halves>1), droite=n.droite??(demi&&a.half);
    const duo=!a.step&&demi?a.team.years[a.year].all.find(b=>b.ri===a.ri&&b!==a):null;
    // Ce que la source dit d'une étape se limite à « chez X cette année-là » : ni poste —
    // la rangée n'en a pas —, ni ancienneté, ni rotation.
    const tip=a.step
      ? `${a.name}${nat?" ("+nat+")":""} · chez ${label} en ${a.year} · pas aux Worlds cette année-là`
      : `${a.name}${a.shown!==a.name?` (${a.shown} à l'époque)`:""}${nat?" ("+nat+")":""} · ${ROLE_NAME[a.role]} · ${label} ${a.year}`
        +(a.sen>1?` · ${a.sen}e Worlds avec l'équipe`:"")
        +(duo?` · poste partagé avec ${duo.name}`:"")+(a.alt?` · rotation avec ${a.alt}`:"")+(a.doubt?" · à vérifier":"");
    const tag=n.other?tagDe(a.team):null;
    const mark=n.other?(tag?`<span class="t">${tag}</span>`:""):(!a.step&&(a.alt||a.doubt)?`<span class="q">${a.doubt?"?":"*"}</span>`:"");
    html+=`<div class="chip${demi?" half":""}${droite?" right":""}${a.step?" step":""}" data-p="${a.id}" data-c="${a.id}:${a.year}" data-r="${a.role}" data-w="${n.w}"${a.step&&!n.other?` data-cell="${a.team.code}:${a.year}"`:""}${n.voisin?` data-voisin="${n.voisin}"`:""} style="left:${n.x}px;top:${n.y}px;width:${n.w}px;--s:${Math.min(a.sen-1,5)*11}%" title="${tip}"><span class="r ${a.role}"></span>${nat?`<span class="nat${isImport(a)?" imp":""}">${nat}</span>`:""}<span class="n">${a.shown}</span>${a.sen>1?`<span class="sen">${a.sen}e</span>`:""}${mark}</div>`;
  }));
  // Les deux rangées voisines de l'édition isolée passent sous un voile, écrit **après** les
  // cases pour les recouvrir. Un voile plutôt qu'une opacité sur chaque case : l'estompe du
  // focus se joue déjà sur l'opacité des cases, et les deux se seraient disputé la même
  // propriété. Il ne capture rien, donc les cases qu'il recouvre restent survolables.
  if(state.annee!=null) for(const y of YEARS){
    if(y===state.annee) continue;
    html+=`<div class="voile" style="top:${yTop(y)-GOUTTIERE}px;height:${ROWH}px;width:${W}px"></div>`;
  }
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
  // L'axe des années devient cliquable : une année isole son édition. Cliquer une **voisine**
  // y déplace l'isolement — on avance ainsi d'édition en édition —, cliquer l'édition isolée
  // elle-même en sort. C'est le seul chemin de retour depuis l'axe, puisqu'une fois isolé il ne
  // porte plus que trois années.
  rail.innerHTML=YEARS.map(y=>{
    const on=y===state.annee;
    // Une année qui ne laisserait aucune colonne avec l'isolement de sélection en cours est
    // grisée et inerte, la raison dans son `title` : même règle que les noms d'équipe du
    // tiroir de statistiques — on refuse, on dit pourquoi, et on ne défait pas l'autre
    // isolement en douce. Le test ne coûte que quand une sélection est isolée.
    const mort=!on&&state.isole&&!colonnesSi({annee:y}).length;
    const aide=on?"Édition isolée · cliquer pour revenir à la carte entière"
      :mort?`La sélection isolée n'a aucune colonne sur ${y} ni ses voisines`
      :state.annee!=null?`Déplacer l'isolement sur ${y}`
      :`N'afficher que les équipes de ${y}, et celles d'où viennent ses joueurs et où ils vont`;
    return `<button type="button" class="ylab${on?" iso":""}" data-y="${yTop(y)+2.5*STEP}" data-year="${y}" aria-pressed="${on}" aria-disabled="${mort}" title="${aide}">${y}${y===ONGOING_YEAR?"<small>EN COURS</small>":""}</button>`;
  }).join("");
  // Reste le cas que le contrôle d'entrée ne voit pas : l'édition isolée a retiré sa colonne
  // à l'équipe épinglée. La sélection tombe, et si un isolement la suivait, la réduction qu'on
  // vient d'appliquer n'est plus la bonne — on refait la page, une fois et pas deux.
  if(state.pinnedTeam&&!vis.some(t=>t.code===state.pinnedTeam)){
    state.pinnedTeam=null;
    if(state.isole){ state.isole=false; return void render(); }
  }
  if(typeof majRegionPills==="function") majRegionPills();
  majStatsTeams();
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
// ---------- isolement : deux réductions, deux gestes ----------
// Jusqu'ici la sélection ne passait que par `apply()` : on restylait des éléments déjà en
// place, sans jamais remettre la carte en page. L'isolement casse cette séparation, parce que
// « ne garder que les colonnes qui comptent » est une décision de mise en page, donc de
// `render()`. C'est le seul endroit du fichier où une sélection déclenche un rendu.
//
// La règle qui borne le dégât : **le mode d'avant est conservé tel quel.** Un survol et un
// clic simple surlignent, et rien ne bouge. L'isolement est un geste distinct, visible, et il
// se défait d'un geste évident.
//
// Deux réductions qui se cumulent peuvent ne rien laisser — un joueur isolé qui n'a joué
// aucune édition de l'année isolée. On refuse alors le **second** geste au lieu de vider la
// carte : c'est déjà la règle de `setHidden()`, qui ne masque jamais la dernière colonne.
function essayer(modif){
  if(!colonnesSi(modif).length) return false;
  Object.assign(state,modif);
  return true;
}
// Recentrer après coup n'est pas une finition : les colonnes se sont resserrées, donc tout a
// bougé, et la chip qu'on vient de cliquer peut être à des milliers de pixels de là où la main
// l'a laissée. On revient sur la sélection — et au retour aussi, plutôt que sur la vue d'avant
// l'isolement : si la sélection a changé entre-temps, y revenir serait faux.
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
  // Le bouton est une bascule, et il **garde la sélection** en sortant : revoir la carte
  // entière sans perdre le joueur qu'on lisait n'est pas la même chose que tout relâcher.
  // C'est le `×` qui relâche, et c'est tout l'intérêt de les séparer.
  if(!essayer({isole:!state.isole})) return false;
  render(); recadrer(); return true;
}
// Tout relâcher d'un geste. Le clic dans le vide ne suffit plus une fois isolé : les colonnes
// sont resserrées et le vide a presque disparu de l'écran.
function toutMontrer(){
  if(!state.isole&&state.annee==null) return false;
  state.isole=false; state.annee=null;
  render(); recadrer(); return true;
}

// La case est la seule prise sur un joueur, et le fil n'en est pas une. L'essai a été fait :
// le fil change de tracé au focus — le raccourci cède la place au détail qui passe par les
// étapes —, donc le survoler le fait disparaître de sous le curseur, le focus retombe, le
// raccourci revient, et on boucle sans fin. Rendre le fil survolable demanderait de lui donner
// une géométrie unique, c'est-à-dire d'afficher au repos les 189 détours par les années sans
// Worlds, dont 64 traversent jusqu'à « Autres équipes ». Le prix est trop haut pour le gain.
function tap(target){
  const c=target.closest&&target.closest(".chip");
  if(c){ state.pinnedTeam=null; state.pinned=c.dataset.p; state.hover=null; }
  else { state.pinned=null; state.pinnedTeam=null; state.hover=null; }
  apresSelection();
}
// Pendant un **isolement d'équipe**, survoler un joueur descend d'un cran : la disposition des
// colonnes reste celle de l'équipe, et seule la ligne du joueur s'allume dedans. C'est un
// sous-contexte, pas une sélection — il tient au curseur et se défait en le retirant, sans
// jamais remettre la carte en page. Le clic, lui, garde son sens : il reporte la sélection et
// l'isolement sur le joueur, et là les colonnes bougent.
//
// Hors isolement la règle d'avant tient, et c'est délibéré : une équipe épinglée ignore le
// survol, sans quoi promener la souris sur 120 colonnes ferait battre la surbrillance en
// permanence. Isolé, il en reste une poignée, et le geste est maîtrisable.
const survolPossible=()=>!state.pinned&&(!state.pinnedTeam||state.isole);
world.addEventListener("mouseover",e=>{const c=e.target.closest(".chip"); if(c&&!drag&&survolPossible()&&matchMedia("(hover:hover)").matches){state.hover=c.dataset.p;apply();}});
world.addEventListener("mouseout",e=>{if(e.target.closest(".chip")&&state.hover){state.hover=null;apply();}});
hdr.addEventListener("click",e=>{
  const x=e.target.closest(".hide");
  if(x) return void setHidden([x.dataset.hide],true);
  const th=e.target.closest(".th[data-team]"); if(!th) return;
  state.pinned=null; state.hover=null; state.pinnedTeam=state.pinnedTeam===th.dataset.team?null:th.dataset.team; apresSelection();
});
// Le `×` relâche tout, isolement de la sélection compris. L'édition isolée, elle, a son propre
// contrôle — l'axe des années — et ne part pas avec la sélection.
$("selClose").onclick=()=>{state.pinned=null; state.pinnedTeam=null; state.hover=null; $("q").value=""; apresSelection();};
$("selIso").onclick=basculerIsolement;
// `aria-disabled` grise sans bloquer le clic : le refus se redit donc ici, pour la souris
// comme pour le clavier.
rail.addEventListener("click",e=>{
  const l=e.target.closest(".ylab[data-year]"); if(!l) return;
  isolerAnnee(state.annee===+l.dataset.year?null:+l.dataset.year);
});

// Les **cases** que le mode « arrivées et départs » garde : celles de l'équipe, plus le club
// juste avant l'arrivée et le club juste après le départ. Le mode ne liste plus ses segments :
// un segment est gardé si ses deux cases le sont, et c'est le seul moyen d'être d'accord avec
// la carte. Les lister par index de carrière les faisait rater dès qu'une apparition était
// écartée du rendu — par la période, par `retenues`, ou par un isolement — et Maple arrivait
// chez PSG en 2021 sans le moindre fil, alors que c'est de là qu'il rejoint TSM.
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
const fmtFlow=o=>Object.entries(o).sort((a,b)=>b[1].length-a[1].length).map(([t,l])=>`<span title="${l.join(", ")}">${t} <span class="hint">×${l.length}</span></span>`).join(", ")||`<span class="hint">aucun</span>`;

function apply(){
  const {hover,pinned,pinnedTeam}=state;
  const lin=!hover&&!pinned&&pinnedTeam&&state.teamMode==="lineage"?lineage(pinnedTeam):null;
  // Une étape compte comme passage par la colonne : épingler T1 doit surligner le fil de
  // Faker en 2014, année où il y était sans aller aux Worlds.
  const ids=hover?new Set([hover]):pinned?new Set([pinned]):(pinnedTeam&&!lin)?new Set([...apps,...stepApps].filter(a=>a.team.code===pinnedTeam).map(a=>a.id)):null;
  world.classList.toggle("focus",!!ids||!!lin);
  world.classList.toggle("showNat",state.showNat);
  world.classList.toggle("showSen",state.showSen);
  const parCase=new Map(); // data-c → chip, pour retrouver le titulaire à resserrer
  world.querySelectorAll("[data-p]").forEach(el=>{
    const isPath=el.tagName==="path";
    if(!isPath&&el.dataset.c) parCase.set(el.dataset.c,el);
    // Un bout de fil se surligne **avec sa case**, et jamais seul : il n'a pas de `data-k`,
    // mais il porte le `data-c` de la case à laquelle il est accroché. Le surligner par joueur
    // laissait des marques orphelines en « arrivées et départs », là où ce mode ne garde que
    // certaines cases du joueur — Zven en portait une à ORI 2015, sa case étant éteinte.
    // Tout se surligne par les **cases** : un segment quand ses deux extrémités le sont, un
    // bout de fil quand la case à laquelle il tient l'est. Rien ne peut donc rester allumé
    // sans de quoi s'accrocher, et l'ensemble reste d'accord avec ce que la carte dessine.
    const bout=isPath&&el.classList.contains("cap");
    el.classList.toggle("hl",lin
      ?(isPath&&!bout
        ?lin.chips.has(el.dataset.de)&&lin.chips.has(el.dataset.vers)
        :lin.chips.has(el.dataset.c))
      :(!!ids&&ids.has(el.dataset.p)));
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
  // Une case « Pas aux Worlds » dont l'étape est effectivement montrée se tait : le libellé
  // est centré, la chip lui passerait dessus. Hors focus il reste, puisque rien ne s'affiche.
  const tues=new Set();
  world.querySelectorAll(".chip.step.hl[data-cell]").forEach(el=>tues.add(el.dataset.cell));
  world.querySelectorAll(".absent[data-cell]").forEach(el=>el.classList.toggle("muette",tues.has(el.dataset.cell)));

  // Et un titulaire dont le poste reçoit une étape se resserre en demi-case le temps qu'elle
  // paraisse. Au repos sa case est pleine : c'est la rangée des Worlds, elle ne doit rien
  // perdre pour une information qu'on n'a pas demandée.
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
    // Le panneau ne filtre rien : il donne la suite des clubs, étapes hors Worlds comprises,
    // et les années que la source ne recense pas. Une étape se fond dans la période du club
    // qu'elle prolonge — c'est la carrière qu'on lit ici, la carte portant la distinction.
    const items=[];
    p.apps.forEach(a=>{
      const dernier=[...items].reverse().find(i=>i.kind==="run");
      for(let y=(dernier?dernier.to+1:a.year);y<a.year;y++) if(creux.has(y)) items.push({kind:"void",year:y});
      const label=a.alias||a.team.name, last=items[items.length-1];
      if(last?.kind==="run"&&last.label===label&&last.role===a.role&&last.to===a.year-1) last.to=a.year;
      else items.push({kind:"run",label,role:a.role,from:a.year,to:a.year});
    });
    // « aucune partie professionnelle recensée », jamais « sans club » : la source dit qu'elle
    // ne recense rien, pas que le joueur n'avait pas d'équipe.
    const chaine=items.map(i=>i.kind==="void"
      ?`<span class="hint">${i.year} · aucune partie professionnelle recensée</span>`
      :`${i.label} <span class="hint">${i.from===i.to?i.from:i.from+"–"+i.to} · ${ROLE_NAME[i.role]}</span>`).join(" → ");
    // Les deux bornes du fil. « Connue » et pas « début » ni « fin de carrière » : un joueur
    // encore actif peut n'avoir pas requalifié, et la couverture de la source a ses limites.
    const vu=SEEN.get(p.id);
    const bornes=vu?`<br><span class="hint">première apparition connue : ${vu[0]} · dernière apparition connue : ${vu[1]}</span>`:"";
    out.innerHTML=`<b class="nm">${p.name}</b>${nat?`<span class="hint">${COUNTRY[nat]||nat} · </span>`:""}${chaine}${bornes}`;
  } else if(lin){
    const t=teams.find(t=>t.code===pinnedTeam);
    out.innerHTML=`<b class="nm">${t.name}</b><span class="hint">Arrivées et départs</span><br>Arrivées depuis : ${fmtFlow(lin.from)}<br>Départs vers : ${fmtFlow(lin.to)} <span class="hint">· ${lin.debut} premiers Worlds ici</span>`;
  } else if(pinnedTeam){
    const t=teams.find(t=>t.code===pinnedTeam), n=new Set(apps.filter(a=>a.team===t).map(a=>a.id)).size;
    out.innerHTML=`<b class="nm">${t.name}</b><span class="hint">${n} joueurs titulaires aux Worlds depuis ${ALL_YEARS[0]}, carrières complètes surlignées.</span>`;
  }
  sel.hidden=!(show||pinnedTeam);
  // Le × se cache sur un simple survol, qui n'a rien à relâcher — mais pas quand une équipe
  // est épinglée dessous : le survol n'est alors qu'un sous-contexte, et le contrôle qui
  // relâche la sélection ne doit pas s'évanouir sous le curseur.
  $("selClose").hidden=!!hover&&!pinned&&!pinnedTeam;
  // Le bouton n'a de sens que sur une sélection **posée** : isoler au survol réorganiserait la
  // carte en passant la souris. C'est une bascule, donc `aria-pressed` et non une action.
  const iso=$("selIso"), pose=!!pinned||!!pinnedTeam;
  iso.hidden=!pose;
  sel.classList.toggle("avec-iso",pose);
  iso.setAttribute("aria-pressed",String(state.isole));
  iso.textContent=state.isole?"Tout afficher":"Isoler";
  // Grisé quand l'isolement ne laisserait rien — 35 joueurs sur 749 n'ont aucune colonne dans
  // la période ouverte par défaut, et l'édition isolée resserre encore. Dire pourquoi vaut
  // mieux qu'un bouton qui ne fait rien.
  const mort=pose&&!state.isole&&!colonnesSi({isole:true}).length;
  iso.setAttribute("aria-disabled",String(mort));
  iso.title=state.isole?"Revoir toutes les colonnes, sans perdre la sélection"
    :mort?(state.annee!=null?`Aucune colonne de la sélection sur l'édition ${state.annee} isolée ni ses voisines`:"Aucune colonne de la sélection dans la période affichée")
    :"N'afficher que les colonnes par lesquelles la sélection est passée";
  renderLegend(!!lin);
}

function renderLegend(lin){
  const L=[];
  L.push(`<span><svg width="30" height="10"><line x1="2" y1="5" x2="28" y2="5" stroke="currentColor" stroke-width="1.8"/></svg> changement d'équipe, coloré par poste — le fil bascule en son milieu quand le joueur change de poste</span>`);
  L.push(`<span><span class="lg-half"><i></i><i></i></span> poste tenu par deux joueurs, chacun ciblable · <b>*</b> rotation ponctuelle (survol pour le nom)${apps.some(a=>a.doubt)?" · <b>?</b> à vérifier":""}</span>`);
  L.push(`<span><span class="lg-res">Quarts · Demi · Finale</span> parcours de l'équipe · <b style="color:var(--bot)">★ Vainqueur</b></span>`);
  // Dire « premier » et « dernier Worlds », et pas « début » ni « fin de carrière » : la
  // carte ne voit que les éditions, et un joueur encore actif n'a peut-être pas requalifié.
  L.push(`<span><svg width="30" height="12"><line x1="10" y1="2" x2="20" y2="2" stroke="currentColor" stroke-width="2"/><line x1="15" y1="2" x2="15" y2="10" stroke="currentColor" stroke-width="2"/></svg> au survol d'un joueur ou au clic sur une équipe, les deux bouts du fil, posés sur la ligne entre deux éditions : premier et dernier Worlds du joueur</span>`);
  if(state.showNat) L.push(`<span><span class="lg-nat">KR</span> nationalité · <span class="lg-nat" style="color:var(--accent);border-color:var(--accent)">KR</span> joueur importé</span>`);
  if(state.showSen) L.push(`<span><span class="senbar"></span> 1er → 6e Worlds avec l'équipe</span>`);
  L.push(`<span><span class="lg-step">Club</span> au survol d'un joueur ou au clic sur une équipe : où il était les années sans Worlds, et le fil passe par là</span>`);
  L.push(`<span><svg width="30" height="10"><line x1="2" y1="5" x2="28" y2="5" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 4"/></svg> au survol, fil en pointillé : aucune partie professionnelle recensée sur l'intervalle</span>`);
  if(hasOther) L.push(`<span>Autres équipes : joueurs des régions et des équipes masquées, et les clubs traversés qui n'ont pas de colonne</span>`);
  if(lin) L.push(`<span>Arrivées et départs : club d'avant et club d'après</span>`);
  if(state.annee!=null) L.push(`<span><b>Édition ${state.annee} isolée</b> : ses équipes, plus celles d'où viennent ses joueurs et où ils vont. Les deux rangées voisines sont estompées et ne montrent que ces arrivées et ces sorties. Cliquer une voisine y déplace l'isolement, cliquer ${state.annee} en sort.</span>`);
  if(state.isole) L.push(`<span><b>Sélection isolée</b> : seules les colonnes par lesquelles elle est passée. « Tout afficher » revient à la carte entière en gardant la sélection ; le × la relâche ; Échap fait les deux. Sélectionner quelqu'un d'autre reporte l'isolement sur lui.${state.pinnedTeam?" Survoler un joueur n'allume que sa ligne, sans toucher aux colonnes.":""}</span>`);
  L.push(`<span>Glisser pour se déplacer · molette ou pincer pour zoomer</span>`);
  $("legendBody").innerHTML=L.join("");
}

// ---------- recherche ----------
// Cadrages, extraits de `selectPlayer` et `selectTeam` parce que l'isolement doit recadrer
// après un rendu, sans repasser par la sélection qui n'a pas changé.
function cadrerJoueur(id){
  const ns=nodesByPlayer.get(id);
  if(!ns?.length) return;
  const n=ns[0], bas=ns.at(-1).y;
  centerOn(n.x+chipW/2,n.y+(bas-n.y)/2,Math.min(1,Math.max(.45,vp.clientHeight/((bas-n.y)+300))));
}
function cadrerColonne(t,c){
  // Cadrer sur les seules éditions que l'équipe a jouées dans la période affichée : une
  // colonne de deux rangées sur seize se centrerait sinon sur du vide.
  const ys=YEARS.filter(y=>t.years[y]);
  if(!ys.length) return;
  const haut=yTop(ys[0]), bas=yTop(ys.at(-1))+5*STEP;
  centerOn(c.x+c.w/2,(haut+bas)/2,Math.min(1,Math.max(.45,vp.clientHeight/((bas-haut)+300))));
}
// Suite d'un changement de sélection, et aussi de mode de clic : les deux changent l'ensemble
// des colonnes que garde l'isolement, sans que l'isolement lui-même soit remis en cause. Une
// sélection nouvelle **le reporte sur elle** plutôt que d'en sortir — on reste dans le même
// geste de lecture, sur quelqu'un d'autre.
//
// Tant que rien n'est isolé, c'est `apply()` et rien d'autre, le comportement d'avant intact.
// Isolé, il faut remettre en page, mais seulement si cet ensemble a réellement changé : sinon
// on paierait un rendu complet à chaque survol.
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
// Le pendant de `selectPlayer` pour une équipe : poser la sélection, puis recentrer sur la
// colonne. Le mode de clic — « carrières complètes » ou « arrivées et départs » — reste celui
// que l'utilisateur a choisi dans les filtres, ce n'est pas au raccourci d'en décider.
//
// **Équipe sans colonne : on refuse.** Pas de démasquage d'office — un clic dans les
// statistiques n'a pas à modifier les filtres sans le dire — et pas de boîte de dialogue, qui
// coûterait plus qu'elle ne rend pour un raccourci de lecture. C'est l'entrée elle-même qui
// est grisée et porte la raison (`majStatsTeams`), et ce refus préventif dit la même règle que
// le nettoyage de `state.pinnedTeam` par `render()` quand la colonne disparaît.
function selectTeam(code){
  const t=byCode.get(code);
  if(!t||sansColonne(t,true)) return false;
  state.pinned=null; state.hover=null; state.pinnedTeam=code;
  apresSelection();
  const c=cols.find(c=>c.t===t);
  if(c) cadrerColonne(t,c);
  return true;
}
// Les noms d'équipe de « Rosters inchangés » sont des raccourcis dont l'état dépend des
// filtres, pas du contenu du tiroir : il se rafraîchit à chaque rendu, comme les pilules de
// région, au lieu d'être figé à la construction.
function majStatsTeams(){
  document.querySelectorAll("#stats button[data-team]").forEach(b=>{
    const t=byCode.get(b.dataset.team), pourquoi=t?sansColonne(t,true):"équipe absente du jeu de données";
    // `aria-disabled` plutôt que l'attribut `disabled` : un bouton désactivé ne reçoit aucun
    // événement de souris dans plusieurs navigateurs, et n'afficherait donc pas le `title` qui
    // porte la raison du refus — tout l'intérêt du grisé. `selectTeam` refuse de son côté.
    b.setAttribute("aria-disabled",String(!!pourquoi));
    b.title=pourquoi?`${t?t.name:b.dataset.team} · ${pourquoi}`:`Voir la colonne ${t.name} sur la carte`;
  });
}

// ---------- recherche : joueurs et équipes ----------
// Le `<datalist>` natif a rendu trois lignes de service, mais il ne sait ni présenter deux
// catégories, ni afficher autre chose que du texte, ni être stylé. La barre cherchant
// désormais des équipes autant que des joueurs, c'est une combobox écrite à la main.
const q=$("q"), qlist=$("qlist");
// Forme de comparaison : minuscules, diacritiques retirés, pour que « pain » trouve
// `paiN Gaming` et « kabum » `KaBuM! e-Sports`. Seule la **recherche** est tolérante — la
// graphie d'un pseudo reste une clé de données, et rien ici ne la touche.
const pli=s=>String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
// Une entrée **par graphie** de joueur : un joueur renommé se cherche sous les deux, et c'est
// une règle de données, pas une commodité — la ligne du pseudo d'époque porte alors la graphie
// canonique en appui, pour que le lien entre les deux se voie. Une entrée par équipe, trouvable
// sous son code, son nom complet et son libellé court.
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
// Huit par groupe : au-delà, la liste cesse d'aider et le compte restant dit qu'il faut
// préciser. Un début de mot passe avant un milieu de mot, et une correspondance entière avant
// tout le reste — taper « t1 » doit donner T1 en tête, pas les douze codes qui contiennent 1.
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
    .sort((a,b)=>a.r-b.r||a.e.nom.length-b.e.nom.length||a.e.nom.localeCompare(b.e.nom,"fr"))
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
  // Deux groupes nommés plutôt qu'une liste plate : un `listbox` n'accepte que des `option`
  // et des `group`, et les deux catégories ne se lisent pas de la même façon — un pseudo se
  // reconnaît, un code d'équipe se devine.
  for(const [kind,titre] of [["j","Joueurs"],["e","Équipes"]]){
    const tout=res.filter(e=>e.kind===kind);
    if(!tout.length) continue;
    h+=`<div role="group" aria-label="${titre}"><div class="lbl" aria-hidden="true">${titre}</div>`;
    for(const e of tout.slice(0,MAX_GROUPE)){
      // Une équipe sans colonne à cet instant reste listée : la trouver est déjà une réponse.
      // Elle est inerte, avec sa raison — on ne modifie pas les filtres sans le dire.
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
    if(reste>0) h+=`<div class="reste" role="presentation">+ ${reste} autre${reste>1?"s":""} — précisez la recherche</div>`;
    h+=`</div>`;
  }
  if(!options.length) h=`<div class="vide" role="presentation">Aucun joueur ni aucune équipe de ce nom.</div>`;
  qlist.innerHTML=h;
  qlist.hidden=false;
  q.setAttribute("aria-expanded","true");
  // Le premier choix possible est actif d'emblée : Entrée doit marcher sans flèche.
  actif=options.findIndex(o=>!o.mort);
  majActif();
}
function majActif(){
  qlist.querySelectorAll(".opt").forEach((el,i)=>el.setAttribute("aria-selected",String(i===actif)));
  if(actif<0) return void q.removeAttribute("aria-activedescendant");
  q.setAttribute("aria-activedescendant",`qo${actif}`);
  qlist.querySelector(`#qo${actif}`)?.scrollIntoView({block:"nearest"});
}
// Les entrées inertes sont sautées : s'arrêter sur une ligne dont Entrée ne fera rien
// donnerait l'impression que le clavier est cassé.
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
  // Échap ferme la liste **et s'arrête là** : la cascade du document défait l'isolement et
  // les tiroirs, ce qui n'a rien à voir avec une liste ouverte sous le curseur.
  else if(e.key==="Escape"&&!qlist.hidden){ e.preventDefault(); e.stopPropagation(); fermerListe(); }
});
// `mousedown` plutôt que le clic pour garder le focus : sans ça le champ perd le focus avant
// que le clic n'arrive, et la liste se referme sous le doigt.
qlist.addEventListener("mousedown",e=>e.preventDefault());
qlist.addEventListener("click",e=>{
  const el=e.target.closest(".opt[data-i]");
  if(el) choisir(+el.dataset.i);
});
document.addEventListener("click",e=>{ if(!(e.target.closest&&e.target.closest(".combo"))) fermerListe(); });

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
// Échap, en tête de la cascade existante : l'isolement d'abord, puis l'infobulle, puis les
// tiroirs. Une seule pression rend la carte entière — deux niveaux pour deux isolements
// seraient à deviner, alors que « Échap annule ce que je viens de faire » ne l'est pas.
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
//
// Le `title` porte trois choses, une par ligne — un `title` natif accepte les retours à la
// ligne : le nom de la ligue, sa zone géographique, puis le compte de colonnes. Le sigle seul
// ne disait ni ce que c'est, ni où ça se joue. Une région sans nom collecté, ou trop large et
// absente de `ZONES_ARBITREES`, saute simplement sa ligne : jamais de libellé inventé.
function majRegionPills(){
  for(const [r,b] of regionBtns){
    const total=teams.filter(t=>t.region===r).length;
    const n=teams.filter(t=>t.region===r&&APPS.get(t.code)>=state.minApps).length;
    b.innerHTML=`<i style="background:${regionVar(r)}"></i>${r}`+(n<total?`<span class="cnt">${n}/${total}</span>`:"");
    const compte=n<total?`${n} colonne${n>1?"s":""} sur ${total} au seuil de présence actuel`:`${total} colonne${total>1?"s":""}`;
    b.title=[LEAGUE_NAMES[r]||null,zoneDe(r),compte].filter(Boolean).join("\n");
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
// Le mode ne décide pas que de la surbrillance : isolement posé, il décide aussi des colonnes
// gardées — toutes celles qu'ont traversées les joueurs de l'équipe, ou seulement les clubs
// d'avant et d'après, 27 colonnes au pire contre 16. D'où `apresSelection()` et non `apply()` :
// changer de mode change l'ensemble des colonnes, donc demande une remise en page.
const modeBtns=[["players","Carrières complètes"],["lineage","Arrivées et départs"]].map(([m,l])=>{
  const b=pill($("teamMode"),l,null,m==="players",()=>{state.teamMode=m; modeBtns.forEach(x=>x.setAttribute("aria-pressed",x===b)); apresSelection(); return true;},"pill mode");
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
  // Toutes ces mesures comptent des **Worlds** : « le plus de Worlds », « d'un Worlds à
  // l'autre », « titulaires ». Une étape hors Worlds n'en est pas un, et la colonne qu'elle
  // traverse n'a pas toujours de région — `flow[null]` ferait planter le tiroir.
  const mondiaux=p=>p.apps.filter(a=>!a.step);
  const btn=p=>`<button type="button" class="pl" data-id="${p.id}">${p.name}</button>`;
  const most=plist.map(p=>({p,n:mondiaux(p).length})).sort((a,b)=>b.n-a.n||a.p.name.localeCompare(b.p.name)).slice(0,10);
  const trav=plist.map(p=>({p,n:new Set(mondiaux(p).map(a=>a.team.code)).size})).filter(x=>x.n>=3).sort((a,b)=>b.n-a.n||mondiaux(b.p).length-mondiaux(a.p).length).slice(0,10);
  // Deux voyageurs différents, et la confusion entre les deux était la faute : le premier
  // compte les équipes **avec lesquelles on est allé aux Worlds**, le second tous les clubs
  // traversés, étapes hors Worlds et clubs sans colonne compris.
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
  let h=`<div class="st"><h3>Le plus de Worlds</h3><ol>${most.map(x=>`<li>${btn(x.p)}<span class="v">${x.n}</span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>Plus grands voyageurs aux Worlds</h3><p class="note">Nombre d'équipes différentes <b>avec lesquelles le joueur est allé aux Worlds</b></p><ol>${trav.map(x=>`<li>${btn(x.p)}<span class="v">${x.n} équipes</span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>Plus grands voyageurs, carrière entière</h3><p class="note">Tous les clubs traversés, Worlds ou non — les étapes hors Worlds et les clubs sans colonne compris. Entre parenthèses, la part faite aux Worlds.</p><ol>${carr.map(x=>`<li>${btn(x.p)}<span class="v">${x.n} clubs <small>(${x.w} aux Worlds)</small></span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>Rosters inchangés</h3><p class="note">Même cinq titulaires sur des Worlds consécutifs</p><ol>${stable.map(s=>`<li><span><button type="button" class="pl tl" data-team="${s.t.code}">${shortName(s.t)}</button> ${s.from}–${s.to}<br><span class="note">${s.names}</span></span><span class="v">${s.n} ans</span></li>`).join("")}</ol></div>`;
  h+=`<div class="st"><h3>Flux entre régions</h3><p class="note">Changements d'équipe d'un Worlds à l'autre. Ligne : région quittée, colonne : région rejointe.</p><div class="tw"><table class="fl"><tr><th></th>${REGIONS.map(r=>`<th>→ ${r}</th>`).join("")}</tr>${REGIONS.map(a=>`<tr><th>${a}</th>${REGIONS.map(b=>`<td style="--a:${Math.round(flow[a][b]/fmax*70)}%">${flow[a][b]||"·"}</td>`).join("")}</tr>`).join("")}</table></div></div>`;
  h+=`<div class="st"><h3>Joueurs importés</h3><p class="note">Titulaires dont la nationalité n'est pas celle de la région de l'équipe</p><div class="tw"><table class="fl"><tr><th></th>${ALL_YEARS.map(y=>`<th>${String(y).slice(2)}</th>`).join("")}</tr>${REGIONS.map(r=>`<tr><th>${r}</th>${ALL_YEARS.map(y=>{const c=imp[r][y]; return c?`<td style="--a:${Math.round(c.i/c.n*90)}%">${c.i}<small>/${c.n}</small></td>`:`<td class="na">–</td>`;}).join("")}</tr>`).join("")}</table></div></div>`;
  const box=$("stats"); box.innerHTML=h;
  // Deux raccourcis sur la même liste : un nom de joueur, un nom d'équipe. Le test sur
  // `data-team` passe d'abord, le bouton d'équipe portant aussi la classe `.pl`.
  box.addEventListener("click",e=>{
    const te=e.target.closest("button[data-team]");
    // Le tiroir ne se referme que si la sélection a bien eu lieu : sur un refus, l'entrée
    // grisée doit rester sous les yeux avec sa raison.
    if(te){ if(selectTeam(te.dataset.team)&&innerWidth<900) setDrawer("statsDrawer",false); return; }
    const b=e.target.closest(".pl"); if(!b) return; if(innerWidth<900) setDrawer("statsDrawer",false); selectPlayer(b.dataset.id);
  });
  majStatsTeams();
})();

// ---------- démarrage ----------
// La légende est fermée par défaut à toutes les largeurs (attribut `open` retiré du HTML) :
// il n'y a donc plus de cas étroit à rattraper ici.
remplirAnnees();
render();
view.k=innerWidth<700?.7:.9; view.x=16; view.y=70; applyView();
