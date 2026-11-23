/*
 * Rift Transfers — guided tour.
 *
 * Three layers, kept apart on purpose:
 *  1. the **subjects** — which team and which players each step shows, checked against the data
 *     at load time (`choisirSujets`);
 *  2. the **scenario** — eight steps in three acts, each one driving the real map through the
 *     `pilote` object app.js hands over (`ETAPES`);
 *  3. the **dressing** — the card, the veil with its cut-outs, the closing banner.
 * The landing page's looping hero is meant to reuse 1 and the pilot, never 3.
 *
 * No displayed text is written here: every string lives in i18n.js, and the names of the
 * subjects arrive as parameters read from the data — never in the dictionary, where they would
 * drift away from the subject the day a fallback kicks in.
 */
import { t, surChangement } from "./i18n.js";

// ---------- 1. subjects ----------
// Editorial choices, settled in the plan, not roster data: the anchor column of act 1, the
// player whose thread shows the signs, the player whose career shows the gestures. What a
// collection run can break is the **promise of the step** — so each one is checked against what
// its step announces, and replaced by a computed fallback when the check fails.
const SUJETS = { ancre: "FNC", signes: "bwipo", carriere: "impact" };

const mondiaux = (p) => p.apps.filter((a) => !a.step);
const nbEditions = (team) => Object.keys(team.years).length;
// First pair of consecutive Worlds appearances with two different roles: the place where the
// thread switches colour.
function bascule(p) {
  const w = mondiaux(p);
  for (let i = 1; i < w.length; i++) if (w[i].role !== w[i - 1].role) return [w[i - 1].role, w[i].role];
  return null;
}
// "At least three columns, at least one gap year with a step, at least one club without a
// column": what step 3 says about the career it shows.
function carriereDemonstrative(p) {
  const w = mondiaux(p);
  const etapes = p.apps.filter((a) => a.step);
  return new Set(w.map((a) => a.team.code)).size >= 3 && etapes.length > 0 && etapes.some((a) => a.team.club);
}

export function choisirSujets({ teams, players }) {
  // Anchor: the longest column, or within one edition of it. Fallback: the longest.
  const plusLongue = Math.max(...teams.map(nbEditions));
  let ancre = teams.find((x) => x.code === SUJETS.ancre);
  if (!ancre || nbEditions(ancre) < plusLongue - 1) ancre = teams.find((x) => nbEditions(x) === plusLongue);

  // Signs: a player who changed role. Fallback: the most senior role changer — seniority in the
  // map's own sense, the highest rank of Worlds with one same team —, a half-chip breaking ties,
  // then the number of Worlds and the name so the choice never depends on iteration order.
  let signes = players.get(SUJETS.signes);
  if (!signes || !bascule(signes)) {
    const rang = (p) => Math.max(...mondiaux(p).map((a) => a.sen));
    const demi = (p) => (mondiaux(p).some((a) => a.halves > 1) ? 1 : 0);
    signes = [...players.values()].filter(bascule)
      .sort((a, b) => rang(b) - rang(a) || demi(b) - demi(a) || mondiaux(b).length - mondiaux(a).length || a.name.localeCompare(b.name))[0] || null;
  }

  // Career: the same predicate, the fallback ranked by number of Worlds.
  let carriere = players.get(SUJETS.carriere);
  if (!carriere || !carriereDemonstrative(carriere)) {
    carriere = [...players.values()].filter(carriereDemonstrative)
      .sort((a, b) => mondiaux(b).length - mondiaux(a).length || a.name.localeCompare(b.name))[0] || null;
  }

  // Edition of step 4: the first Worlds of the career subject that has a Worlds next door at
  // another team — the isolated edition then shows one of their own moves. Without a career
  // subject, the anchor's last edition.
  let annee = null;
  if (carriere) {
    const w = mondiaux(carriere);
    annee = w.find((a) => w.some((b) => Math.abs(b.year - a.year) === 1 && b.team !== a.team))?.year ?? w.at(-1).year;
  } else annee = Math.max(...Object.keys(ancre.years).map(Number));

  const club = carriere && carriere.apps.find((a) => a.step && a.team.club);
  return {
    ancre,
    signes: signes && {
      p: signes,
      poste: bascule(signes),
      // The fallback may not have played for the anchor: the camera then moves, and the step
      // says so rather than pretending to stay put.
      ailleurs: !mondiaux(signes).some((a) => a.team === ancre),
    },
    carriere: carriere && {
      p: carriere,
      n: mondiaux(carriere).length,
      k: new Set(mondiaux(carriere).map((a) => a.team.code)).size,
      club: club.team.name,
      anneeClub: club.year,
    },
    annee,
  };
}

// ---------- 2. scenario ----------
// Every step starts from the map as it opens (`reinitialiser`), then performs its gesture: going
// back, skipping an act or resuming lands on the same state as walking through. No step waits for
// the right click — on 120 columns, demanding the exact gesture creates dead ends.
//
// `trous`: what the veil leaves uncovered. A plain rectangle gets an accent ring, and the first
// one anchors the card. `nu()` uncovers without a ring, and hides any ring running across it.
// `fond()` is for the whole map as a backdrop: uncovered, but rings inside it stay visible.
// Holes follow the **live** state, not the subject the step started on: when a step invites the
// visitor to redo the gesture — another player, another year, a search —, the light goes where
// they went. `cote`: the card's preferred side.
const calme = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rectDe = (sel) => {
  const el = typeof sel === "string" ? document.querySelector(sel) : sel;
  if (!el || el.hidden || !el.offsetParent && getComputedStyle(el).position !== "fixed") return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? r : null;
};
const nu = (r) => r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, nu: true };
const fond = (r) => r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, fond: true };
// The current selection on the map — a pinned team, else the pinned or hovered player, else the
// step's subject.
const rectSelection = (p, defaut) => {
  const e = p.etat();
  return e.equipe ? p.rectColonne(e.equipe) : p.rectJoueur(e.joueur || defaut);
};

const ETAPES = [
  {
    id: 1, acte: 1, cle: "s1", etroit: true,
    entrer(p, s) { p.reinitialiser(); p.cadrerEquipe(s.ancre.code); },
    params: (p, s, d) => ({ equipe: s.ancre.name, n: nbEditions(s.ancre), de: d.annees[0], a: d.annees.at(-1) }),
    trous: (p, s) => [p.rectColonne(s.ancre.code), rectDe("#rail")],
    cote: "droite",
  },
  {
    // The thread on the map, and only what this player shows: the colour switch and the two ends.
    id: 2, acte: 1, cle: "s2", etroit: true,
    requiert: (s) => !!s.signes,
    entrer(p, s) { p.reinitialiser(); p.selectionnerJoueur(s.signes.p.id); },
    params: (p, s, d) => ({ joueur: s.signes.p.name, de: d.nomPoste(s.signes.poste[0]), vers: d.nomPoste(s.signes.poste[1]), equipe: s.ancre.name }),
    suite: (s) => (s.signes.ailleurs ? "s2.ailleurs" : null),
    trous: (p, s) => [rectSelection(p, s.signes.p.id), nu(rectDe("#sel"))],
    cote: "droite",
  },
  {
    // The other signs, in the legend that will stay one click away. Same selection as step 2, so
    // the map does not move.
    id: 3, acte: 1, cle: "s3", etroit: true,
    requiert: (s) => !!s.signes,
    entrer(p, s) { p.reinitialiser(); p.selectionnerJoueur(s.signes.p.id); p.ouvrirLegende(true); },
    trous: (p, s) => [rectDe("#legend"), nu(rectSelection(p, s.signes.p.id)), nu(rectDe("#sel"))],
    cote: "droite",
  },
  {
    // Hover, then click: the step performs both, a beat apart, so the difference between the two
    // can be seen. The panel is the subject; the map stays uncovered, since the step invites one to
    // click another player or a header. No touch equivalent for hovering — hence its absence below
    // 700 px.
    id: 4, acte: 2, cle: "s4", etroit: false,
    requiert: (s) => !!s.carriere,
    entrer(p, s, plusTard) {
      p.reinitialiser();
      const id = s.carriere.p.id;
      if (calme()) return void p.selectionnerJoueur(id);
      p.survoler(id); p.cadrerJoueur(id);
      plusTard(() => p.selectionnerJoueur(id), 1400);
    },
    params: (p, s) => ({ joueur: s.carriere.p.name, n: s.carriere.n, k: s.carriere.k, club: s.carriere.club, annee: s.carriere.anneeClub }),
    trous: (p) => [rectDe("#sel"), fond(p.rectCarte())],
    cote: "haut",
  },
  {
    // The career subject stays selected where it exists: step 6 isolates that very selection.
    // The light follows the isolated edition, wherever the visitor moves it.
    id: 5, acte: 2, cle: "s5", etroit: true,
    entrer(p, s, plusTard, etroit) {
      p.reinitialiser();
      if (s.carriere && !etroit) p.selectionnerJoueur(s.carriere.p.id);
      p.isolerAnnee(s.annee);
    },
    params: (p, s) => ({ annee: s.annee }),
    // The year in the text follows the isolation when the visitor moves it.
    vivant: (p) => ({ annee: p.etat().annee }),
    trous: (p) => {
      const a = p.etat().annee;
      if (a == null) return [rectDe("#rail"), nu(rectDe("#sel"))];
      return [rectDe(`#rail .ylab[data-year="${a}"]`), nu(p.rectAnnee(a)), nu(rectDe("#sel"))];
    },
    cote: "bas",
  },
  {
    // Isolating rearranges the whole map: the map stays uncovered, only the button is pointed at.
    id: 6, acte: 2, cle: "s6", etroit: false,
    requiert: (s) => !!s.carriere,
    entrer(p, s) { p.reinitialiser(); p.selectionnerJoueur(s.carriere.p.id); p.basculerIsolement(); },
    params: (p, s) => ({ joueur: s.carriere.p.name, n: p.nbColonnes() }),
    trous: (p) => [rectDe("#sel"), fond(p.rectCarte())],
    cote: "haut",
  },
  {
    // "Other teams" is not a step of its own: it shows up by itself, as the consequence — hence
    // the map left uncovered.
    id: 7, acte: 3, cle: "s7", etroit: true,
    entrer(p, s) {
      p.reinitialiser();
      p.ouvrirTiroir("filters", true);
      p.fixerPresence(Math.max(...p.donnees.presence));
      p.toutCadrer();
      document.getElementById("presence")?.closest(".grp")?.scrollIntoView({ block: "nearest" });
    },
    params: (p, s, d) => ({ n: p.nbColonnes(), total: d.teams.length, min: Math.max(...d.presence) }),
    trous: (p) => [rectDe(document.getElementById("presence")?.closest(".grp")), rectDe("#hdr .th.other"), fond(p.rectCarte())],
    cote: "droite",
  },
  {
    // The map goes where the search says: it must be seen, so it stays uncovered.
    id: 8, acte: 3, cle: "s8", etroit: true,
    entrer(p, s, plusTard) {
      p.reinitialiser();
      const nom = s.ancre.name;
      if (calme()) p.saisir(nom);
      else for (let i = 1; i <= nom.length; i++) plusTard(() => p.saisir(nom.slice(0, i)), 250 + i * 110);
      plusTard(() => p.valider(s.ancre.code), 250 + (calme() ? 0 : nom.length * 110) + 900);
    },
    params: (p, s) => ({ cible: s.ancre.name }),
    trous: (p) => [rectDe("#bar"), rectDe("#qlist"), rectDe("#sel"), fond(p.rectCarte())],
    cote: "droite",
  },
];
const INTRO = { cle: "intro" };
const RECAP = { cle: "recap" };

// The gestures with no affordance that are not worth a step of their own. Written to be reused as
// is by the "About" panel: everything it needs is in this call, and the mode names come from the
// same keys as the drawer's pills, so the two cannot drift apart.
export const recapitulatif = () => t("recap.html", { modeA: t("mode.players"), modeB: t("mode.lineage") });

// ---------- 3. dressing ----------
const CLE_STOCKAGE = "rift-transfers:tour";
// Stored value: absent → first visit, the tour opens by itself; "vue" → seen, nothing to resume;
// "fin" → completed; a step id → closed at that step, `?` offers to resume there.
const lire = () => { try { return localStorage.getItem(CLE_STOCKAGE); } catch { return null; } };
const ecrire = (v) => { try { localStorage.setItem(CLE_STOCKAGE, String(v)); } catch { /* private browsing */ } };
// Two Escape presses closer than this release the isolation and do **not** leave: a quick double
// press reads as one gesture, two distinct presses as an intention.
const GARDE_ECHAP = 400;
const DUREE_BANDEAU = 5000;
const MARGE = 12;

let pilote, sujets;
let actif = false, sequence = [], courant = 0, etroit = false;
let sauvegarde = null, focusAvant = null, reprise = null;
let jeton = 0, minuteries = [], derniereLiberation = -Infinity, raf = 0, cleVoile = "", cleVivant = "", paramsCache = null;
let carte, voile, bandeau, minuterieBandeau = 0;

const numerotees = () => sequence.filter((e) => e.id);
const plusTard = (fn, ms) => {
  const j = jeton;
  minuteries.push(setTimeout(() => { if (actif && j === jeton) fn(); }, ms));
};

function construire() {
  voile = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  voile.id = "tourVoile";
  voile.setAttribute("class", "tour-voile");
  voile.setAttribute("aria-hidden", "true");
  voile.setAttribute("hidden", ""); // an SVG element has no `hidden` property
  document.body.appendChild(voile);

  carte = document.createElement("div");
  carte.id = "tour";
  carte.className = "tour";
  carte.setAttribute("role", "dialog");
  carte.setAttribute("aria-modal", "false");
  carte.setAttribute("aria-labelledby", "tourTitre");
  carte.setAttribute("aria-describedby", "tourCorps");
  carte.hidden = true;
  carte.innerHTML = `<button type="button" class="tour-x" data-a="fermer">×</button>
    <p class="tour-prog" id="tourProg"></p>
    <h2 id="tourTitre"></h2>
    <div class="tour-corps" id="tourCorps" aria-live="polite"></div>
    <p class="tour-geste" id="tourGeste"></p>
    <div class="tour-actions">
      <button type="button" class="tbtn lien" data-a="passer"></button>
      <span class="esp"></span>
      <button type="button" class="tbtn" data-a="secondaire"></button>
      <button type="button" class="tbtn primaire" data-a="primaire"></button>
    </div>
    <p class="tour-pied" id="tourPied"></p>`;
  document.body.appendChild(carte);
  carte.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-a]");
    if (!b || !actif) return;
    ({ fermer: () => fermer(), passer: passerActe, secondaire: () => actions.secondaire?.(), primaire: () => actions.primaire?.() })[b.dataset.a]();
  });

  bandeau = document.createElement("div");
  bandeau.className = "tour-bandeau float";
  bandeau.setAttribute("role", "status");
  bandeau.hidden = true;
  bandeau.innerHTML = `<span></span><button type="button" class="tbtn"></button>`;
  document.body.appendChild(bandeau);
  bandeau.querySelector("button").addEventListener("click", () => {
    cacherBandeau();
    ouvrir(lire());
  });
}

// ---------- opening, moving, closing ----------
function ouvrir(depuis = null) {
  if (actif) return;
  actif = true;
  cacherBandeau();
  sauvegarde = pilote.capturer();
  focusAvant = document.activeElement;
  etroit = matchMedia("(max-width: 700px)").matches;
  sequence = [INTRO, ...ETAPES.filter((e) => (!etroit || e.etroit) && (!e.requiert || e.requiert(sujets))), RECAP];
  if (lire() === null) ecrire("vue");
  document.addEventListener("keydown", surTouche, true);
  document.body.classList.add("en-visite");
  voile.removeAttribute("hidden"); carte.hidden = false;
  // `depuis`: a step id to resume at directly (the banner). Otherwise the opening card, which
  // offers to resume if a step was left half-way.
  const n = Number(depuis);
  reprise = /^\d+$/.test(lire() || "") ? indexDe(Number(lire())) : null;
  aller(depuis != null && n ? indexDe(n) : 0);
  carte.querySelector('[data-a="primaire"]').focus({ preventScroll: true });
  boucle();
}
// A stored step may not exist in this sequence — step 3 or 5 below 700 px, a step retired for
// want of a subject: resume at the next one that does.
function indexDe(id) {
  const i = sequence.findIndex((e) => e.id && e.id >= id);
  return i < 0 ? sequence.length - 1 : i;
}

function aller(i) {
  jeton++;
  minuteries.forEach(clearTimeout); minuteries = [];
  courant = Math.max(0, Math.min(i, sequence.length - 1));
  const e = sequence[courant];
  if (e.entrer) e.entrer(pilote, sujets, plusTard, etroit);
  // Parameters are computed once, right after the gesture: a later Escape or click changes the
  // map, and must not rewrite what the card said about the state it set up.
  paramsCache = e.params ? e.params(pilote, sujets, pilote.donnees) : {};
  if (e.id) ecrire(e.id);
  if (e === RECAP) ecrire("fin");
  afficher();
  cleVoile = "";
}

function suivant() {
  if (courant < sequence.length - 1) aller(courant + 1);
  else fermer({ fini: true });
}
function precedent() {
  const e = sequence[courant];
  if (e.id && e !== numerotees()[0]) aller(courant - 1);
  else if (e === RECAP) aller(courant - 1);
}
// "Skip this act": to the first step of the next act, or to the summary.
function passerActe() {
  const acte = sequence[courant].acte;
  const i = sequence.findIndex((e, k) => k > courant && (!e.acte || e.acte > acte));
  aller(i < 0 ? sequence.length - 1 : i);
}

function fermer({ fini = false } = {}) {
  if (!actif) return;
  const e = sequence[courant];
  jeton++;
  minuteries.forEach(clearTimeout); minuteries = [];
  cancelAnimationFrame(raf);
  actif = false;
  document.removeEventListener("keydown", surTouche, true);
  document.body.classList.remove("en-visite");
  voile.setAttribute("hidden", ""); voile.innerHTML = ""; cleVoile = ""; carte.hidden = true;
  // Everything comes back as it was: filters, selection, isolation, drawers, zoom.
  pilote.restaurer(sauvegarde);
  sauvegarde = null;
  if (focusAvant && document.contains(focusAvant)) focusAvant.focus({ preventScroll: true });
  if (fini || e === RECAP) return void ecrire("fin");
  // Closed half-way: no confirmation box — undoing beats confirming. The step is remembered, and
  // a banner offers to resume for five seconds.
  if (e.id) montrerBandeau();
}

// ---------- the card ----------
let actions = {};
function afficher() {
  const e = sequence[courant];
  const nums = numerotees();
  const $ = (id) => document.getElementById(id);
  const bouton = (a) => carte.querySelector(`[data-a="${a}"]`);
  // The labels of other controls are quoted through their own keys, so the card always names
  // them as the interface does.
  const vivant = Object.fromEntries(Object.entries(e.vivant?.(pilote, sujets) || {}).filter(([, v]) => v != null));
  const p = {
    ...paramsCache,
    ...vivant,
    iso: t("sel.iso"), tout: t("sel.tout"), filtre: t("grp.presence"), autres: t("hdr.autres"),
  };
  let prog = "", titre, corps, geste = "";
  actions = {};
  bouton("passer").hidden = true;
  bouton("secondaire").hidden = false;
  if (e === INTRO && reprise != null && sequence[reprise]?.id) {
    const i = nums.indexOf(sequence[reprise]) + 1;
    titre = t("tour.reprise.titre");
    corps = t("tour.reprise.corps", { i, total: nums.length });
    bouton("primaire").textContent = t("tour.reprendre.etape", { i });
    bouton("secondaire").textContent = t("tour.recommencer");
    actions = { primaire: () => aller(reprise), secondaire: () => aller(1) };
  } else if (e === INTRO) {
    titre = t("tour.intro.titre");
    corps = t("tour.intro.corps", { n: nums.length });
    bouton("primaire").textContent = t("tour.commencer");
    bouton("secondaire").textContent = t("tour.plusTard");
    actions = { primaire: () => aller(1), secondaire: () => fermer() };
  } else if (e === RECAP) {
    titre = t("recap.titre");
    corps = recapitulatif();
    bouton("primaire").textContent = t("tour.terminer");
    bouton("secondaire").textContent = t("tour.precedent");
    actions = { primaire: () => fermer({ fini: true }), secondaire: precedent };
  } else {
    const i = nums.indexOf(e) + 1;
    prog = t("tour.progres", { acte: e.acte, nom: t(`tour.acte.${e.acte}`), i, total: nums.length });
    titre = t(`tour.${e.cle}.titre`, p);
    corps = t(`tour.${e.cle}.corps`, p);
    const suite = e.suite?.(sujets);
    if (suite) corps += t(`tour.${suite}`, p);
    geste = t(`tour.${e.cle}.geste`, p);
    bouton("primaire").textContent = t("tour.suivant");
    bouton("secondaire").textContent = t("tour.precedent");
    // "Back" from step 2 on; acts 2 and 3 can be skipped by construction.
    bouton("secondaire").hidden = i === 1;
    bouton("passer").hidden = e.acte === 1;
    bouton("passer").textContent = t("tour.passer");
    actions = { primaire: suivant, secondaire: precedent };
  }
  $("tourProg").textContent = prog;
  $("tourProg").hidden = !prog;
  $("tourTitre").textContent = titre;
  $("tourCorps").innerHTML = corps;
  $("tourGeste").textContent = geste;
  $("tourGeste").hidden = !geste;
  $("tourPied").innerHTML = t("tour.pied");
  carte.setAttribute("aria-label", t("tour.aria"));
  carte.querySelector(".tour-x").setAttribute("aria-label", t("tour.fermer"));
  carte.querySelector(".tour-x").title = t("tour.fermer");
  // A button that just went hidden cannot keep the focus.
  if (carte.contains(document.activeElement) && document.activeElement.hidden) bouton("primaire").focus();
  placer(true);
}

// ---------- the veil and the card's position ----------
// Recomputed every frame while the tour is open: the camera animates, the drawer slides, the
// visitor drags the map — the cut-outs must follow without each gesture having to report itself.
// The SVG is only rewritten when a rectangle has actually moved.
function boucle() {
  if (!actif) return;
  placer(false);
  raf = requestAnimationFrame(boucle);
}
const PAD = 6;
function placer(force) {
  const e = sequence[courant];
  const trous = (e.trous?.(pilote, sujets) || []).filter(Boolean)
    .map((r) => ({ x: Math.round(r.left - PAD), y: Math.round(r.top - PAD), w: Math.round(r.right - r.left + 2 * PAD), h: Math.round(r.bottom - r.top + 2 * PAD), nu: !!r.nu, fond: !!r.fond }));
  // A step whose text depends on the live state is rewritten when that state changes.
  if (e.vivant) {
    const v = JSON.stringify(e.vivant(pilote, sujets));
    if (v !== cleVivant) { cleVivant = v; if (!force) afficher(); }
  }
  const cle = JSON.stringify(trous) + innerWidth + "x" + innerHeight;
  if (!force && cle === cleVoile) return;
  cleVoile = cle;
  const dessin = (liste) => liste.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8"/>`).join("");
  const cernes = trous.filter((r) => !r.nu && !r.fond);
  const coupes = trous.filter((r) => !r.fond);
  // Two masks. The shade is cut by every hole. The rings are cut by every hole but the backdrop,
  // and drawn twice as thick: each keeps the half lying outside its own zone, and the part of a
  // ring that runs inside another lit zone disappears — overlapping zones read as one outline
  // instead of borders crossing the panel.
  voile.innerHTML = `<defs><mask id="tourMasque"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${dessin(trous)}</g></mask>`
    + `<mask id="tourCernes"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${dessin(coupes)}</g></mask></defs>`
    + `<rect class="ombre" width="100%" height="100%" mask="url(#tourMasque)"/><g class="anneau" mask="url(#tourCernes)">${dessin(cernes)}</g>`;
  const c = cernes[0];
  const a = c && { left: c.x, top: c.y, right: c.x + c.w, bottom: c.y + c.h };
  const { x, y } = position(a, e.cote);
  carte.style.left = `${Math.round(x)}px`;
  carte.style.top = `${Math.round(y)}px`;
}
// Next to the anchor, on the preferred side if the card fits there, else the first side that
// fits, else the top right corner. Below 700 px there is no "next to": the card docks at the top
// or the bottom of the screen, on the side opposite the anchor.
function position(a, cote) {
  const W = innerWidth, H = innerHeight, w = carte.offsetWidth, h = carte.offsetHeight;
  if (!a) return { x: (W - w) / 2, y: Math.max(MARGE, (H - h) / 2) };
  if (W <= 700) {
    const ancreEnHaut = (a.top + a.bottom) / 2 < H / 2;
    return { x: (W - w) / 2, y: ancreEnHaut ? H - h - MARGE : MARGE + 42 };
  }
  const borne = (v, min, max) => Math.max(min, Math.min(max, v));
  const essais = {
    droite: () => ({ x: a.right + MARGE, y: borne(a.top, MARGE, H - h - MARGE), ok: a.right + MARGE + w <= W - MARGE }),
    gauche: () => ({ x: a.left - MARGE - w, y: borne(a.top, MARGE, H - h - MARGE), ok: a.left - MARGE - w >= MARGE }),
    bas: () => ({ x: borne(a.left, MARGE, W - w - MARGE), y: a.bottom + MARGE, ok: a.bottom + MARGE + h <= H - MARGE }),
    haut: () => ({ x: borne(a.left, MARGE, W - w - MARGE), y: a.top - MARGE - h, ok: a.top - MARGE - h >= MARGE }),
  };
  for (const c of [cote, "droite", "bas", "haut", "gauche"]) {
    const p = c && essais[c]?.();
    if (p?.ok) return p;
  }
  return { x: W - w - MARGE, y: MARGE + 46 };
}

// ---------- keyboard ----------
const champ = (el) => !!el && (el.matches("input, select, textarea, [contenteditable]") || !!el.closest("#qlist"));
function surTouche(e) {
  const el = document.activeElement;
  if (e.key === "Escape") {
    // Caught in the capture phase, so the map's own cascade — isolation, tooltip, drawers —
    // never sees it: the filter drawer opened by step 6 is part of what the step shows.
    e.preventDefault();
    e.stopImmediatePropagation();
    if (pilote.toutMontrer()) { derniereLiberation = performance.now(); return; }
    if (e.repeat || performance.now() - derniereLiberation < GARDE_ECHAP) return;
    return void fermer();
  }
  if (e.key === "Tab") {
    // Focus trap: Tab cycles inside the card. Only the keyboard is held — the mouse keeps the map,
    // the drawers and the search bar, which the steps invite one to use.
    const pris = [...carte.querySelectorAll("button")].filter((b) => !b.hidden);
    if (!pris.length) return;
    const i = pris.indexOf(el);
    e.preventDefault();
    const j = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + pris.length) % pris.length;
    pris[j].focus();
    return;
  }
  const libre = carte.contains(el) || el === document.body || el === null;
  if (e.key === "ArrowRight" && libre) { e.preventDefault(); actions.primaire?.(); }
  else if (e.key === "ArrowLeft" && libre) { e.preventDefault(); if (sequence[courant].id || sequence[courant] === RECAP) precedent(); }
  else if (e.key === "Enter" && !champ(el) && !(el && el.matches("button, a, summary"))) { e.preventDefault(); actions.primaire?.(); }
}

// ---------- closing banner ----------
function montrerBandeau() {
  bandeau.querySelector("span").textContent = t("tour.ferme");
  bandeau.querySelector("button").textContent = t("tour.ferme.reprendre");
  bandeau.hidden = false;
  clearTimeout(minuterieBandeau);
  minuterieBandeau = setTimeout(cacherBandeau, DUREE_BANDEAU);
}
function cacherBandeau() {
  clearTimeout(minuterieBandeau);
  if (bandeau) bandeau.hidden = true;
}

// ---------- installation ----------
export function installerVisite(p) {
  pilote = p;
  sujets = choisirSujets(p.donnees);
  construire();
  document.getElementById("tourBtn")?.addEventListener("click", () => ouvrir());
  // A language switch mid-tour replays the card's strings; the map, for its part, is redrawn by
  // app.js's own subscriber, registered before this one.
  surChangement(() => {
    if (actif) afficher();
    if (!bandeau.hidden) montrerBandeau();
  });
  // First visit: after the first render and framing, never on an empty screen — the fonts, then
  // two frames so the framing has been painted.
  if (lire() === null) {
    (document.fonts?.ready || Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(() => ouvrir())));
  }
}
