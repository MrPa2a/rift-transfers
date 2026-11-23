/*
 * Rift Transfers — the landing page's live hero.
 *
 * The map, framed by index.html with `?demo`, plays three travelling shots in a loop, close to the
 * graph: down a team's column, along a player's career, across an edition. The scene is drawn as
 * the camera goes — each thread traces itself, each lit chip and thread end appears, at the moment
 * the camera passes over it.
 *
 * Subjects: the guided tour's own `choisirSujets` — the anchor team, the career subject, the
 * isolated edition —, checked against the data in the same way. No name is written here, and a
 * collection run that breaks a subject's promise hands the scene a computed fallback, as it does
 * for the tour. The tour's cards and veil are never loaded. The map is driven through the tour's
 * `pilote` and nothing else.
 *
 * The zoom never changes during a shot: the camera only translates, on whole pixels. A zoom
 * animated frame after frame resamples every one-pixel line and border of the map, and they
 * shimmer — all the more as the zoom is far. Shots are joined by a cut instead.
 *
 * The camera also has an angle: each shot opens low and from one side — left and right in turn —
 * and comes round to face the map as it travels. The whole page tilts as one plane, headers and
 * year axis with the map, through a single CSS transition per shot that the compositor runs: the
 * angle is never set frame by frame from script.
 *
 * It talks to the landing page through `postMessage`, same origin only:
 *  → { type: "rift-demo", pret?, scene, params } a shot starts (`pret` on the first: fade the
 *                                               poster out); the landing page writes its caption
 *  ← { type: "rift-demo", pause: boolean }   the hero has left / come back into view
 *  ← { type: "rift-demo", lang: "fr" | "en" } the landing page switched languages
 */
import { setLang } from "./i18n.js";
import { choisirSujets } from "./tour.js";

const calme = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const VITESSE = 250;         // map pixels per second along the path, on average — eased at both ends
const DUREE = [5000, 15000]; // a shot's bounds, in ms: the speed gives way to them
const AVANCE = 500;         // ms: an element starts appearing this long before the camera is on it
const FONDU = 300;          // ms: the cut between two shots, through the page's background (styles.css)
const TENUE = 500;          // ms: held still at the end of a shot
// Camera angle at the start and at the end of a shot, in degrees, and the scale that keeps the
// tilted page filling the frame.
const ANGLE = { debut: { x: 13, y: 15 }, fin: { x: 5, y: 3 } };
const ECHELLE = 1.2;
// Share of the frame the landing page leaves fully visible: it fades the rest into the page. The
// first and last points of a shot are kept inside it.
const VISIBLE = 0.6;

export function installerDemo(pilote) {
  const s = choisirSujets(pilote.donnees);
  const plans = [
    {
      // Down the anchor's column, pinned and isolated: its players arrive, leave, and their threads
      // run out to the teams they went to.
      id: "equipe", params: () => ({ equipe: s.ancre.name }),
      k: 0.9,
      jouer() { pilote.reinitialiser(); pilote.selectionnerEquipe(s.ancre.code); pilote.basculerIsolement(); },
      chemin: () => pilote.pointsEquipe(s.ancre.code),
    },
    s.carriere && {
      // Along one career, isolated: the camera follows the thread from team to team.
      id: "carriere", params: () => ({ joueur: s.carriere.p.name, n: s.carriere.n, k: s.carriere.k }),
      k: 0.9,
      jouer() { pilote.reinitialiser(); pilote.selectionnerJoueur(s.carriere.p.id); pilote.basculerIsolement(); },
      chemin: () => pilote.pointsJoueur(s.carriere.p.id),
    },
    {
      // Across one edition, isolated: its teams, and every move that came in or went out — nobody
      // selected, so that all of them draw. Wider than the others, hence a little further out —
      // still a fixed zoom for the whole shot.
      id: "annee", params: () => ({ annee: s.annee }),
      k: 0.75,
      jouer() { pilote.reinitialiser(); pilote.isolerAnnee(s.annee); },
      chemin: () => pilote.pointsAnnee(s.annee).sort((a, b) => a.x - b.x),
    },
  ].filter(Boolean);

  const parent = window.parent;
  const dire = (msg) => parent.postMessage({ type: "rift-demo", ...msg }, location.origin);
  const rideau = document.createElement("div");
  rideau.className = "demo-rideau on";
  document.body.append(rideau);
  const attendre = (ms) => new Promise((r) => { minuterie = setTimeout(r, ms); });

  let i = 0, jeton = 0, minuterie = 0, raf = 0, pause = false;

  // A shot: the path as a polyline, run at constant speed, eased at both ends. The camera does not
  // centre the first and last points but keeps them near the edge of the frame — centring them would
  // open and close every shot on half a screen of empty map.
  function trajet(points, k) {
    const brut = points.length > 1 ? points : [points[0], { x: points[0].x, y: points[0].y + 1 }];
    const longueurs = (l) => l.reduce((acc, p, j) => (j ? [...acc, acc[j - 1] + Math.hypot(p.x - l[j - 1].x, p.y - l[j - 1].y)] : [0]), []);
    const pointA = (l, c, d) => {
      let j = 1;
      while (j < c.length - 1 && c[j] < d) j++;
      const a = l[j - 1], b = l[j], u = (d - c[j - 1]) / ((c[j] - c[j - 1]) || 1);
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    };
    const cBrut = longueurs(brut), LB = cBrut.at(-1) || 1;
    // How far in, along the direction of travel: half the frame, less a margin.
    const marge = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy) || 1;
      const etendue = (Math.abs(dx) / n) * ((innerWidth - 58) / k) + (Math.abs(dy) / n) * ((innerHeight - 46) / k);
      return Math.max(0, (etendue * VISIBLE) / (2 * ECHELLE) - 60 / k);
    };
    const d0 = Math.min(LB / 2, marge(brut[0], brut[1])), d1 = Math.max(LB / 2, LB - marge(brut.at(-2), brut.at(-1)));
    const pts = [pointA(brut, cBrut, d0), ...brut.filter((p, j) => cBrut[j] > d0 && cBrut[j] < d1), pointA(brut, cBrut, d1)];
    const cumul = longueurs(pts);
    const L = cumul.at(-1) || 1;
    const T = Math.min(DUREE[1], Math.max(DUREE[0], (L / VITESSE) * 1000));
    const doux = (u) => u * u * (3 - 2 * u);
    const position = (t) => pointA(pts, cumul, doux(Math.min(1, Math.max(0, t / T))) * L);
    // When the camera passes closest to a map point: sampled every 40 ms of the shot.
    const echantillons = [];
    for (let t = 0; t <= T; t += 40) echantillons.push({ t, ...position(t) });
    const instant = (x, y) => {
      let mieux = echantillons[0], dmin = Infinity;
      for (const e of echantillons) { const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < dmin) { dmin = d; mieux = e; } }
      return mieux.t;
    };
    return { T, position, instant };
  }

  // Everything the shot lights up starts hidden, and is timed to the camera: a thread draws from
  // whichever end the camera meets first to the other — backwards when its path runs against the
  // camera, or it would start drawing off screen, before the chips it leaves from have appeared —;
  // a chip or a thread end fades in.
  // With a selection, what it lights up; without one, every thread and chip on show. `--t` and
  // `--d` feed the CSS of demo mode (styles.css).
  function minuter(tr, decalage) {
    const monde = document.getElementById("world");
    const focus = monde.classList.contains("focus");
    const visible = (el) => getComputedStyle(el).display !== "none";
    const quand = (x, y) => Math.max(0, tr.instant(x, y) - AVANCE) + decalage;
    [...monde.querySelectorAll(focus ? "path.l.hl" : "path.l")].filter(visible).forEach((p) => {
      const debut = p.getPointAtLength(0), fin = p.getPointAtLength(p.getTotalLength());
      const tDebut = quand(debut.x, debut.y), tFin = quand(fin.x, fin.y);
      const a = Math.min(tDebut, tFin), b = Math.max(tDebut, tFin);
      if (p.classList.contains("cap") || p.classList.contains("void")) {
        p.style.setProperty("--t", `${a}ms`);
        p.classList.add("apparait");
        return;
      }
      p.setAttribute("pathLength", "1");
      p.style.setProperty("--t", `${a}ms`);
      p.style.setProperty("--d", `${Math.max(600, b - a + AVANCE)}ms`);
      p.classList.toggle("inverse", tFin < tDebut);
      p.classList.add("trace");
    });
    [...monde.querySelectorAll(focus ? ".chip.hl" : ".chip")].filter(visible).forEach((c) => {
      c.style.setProperty("--t", `${quand(c.offsetLeft + c.offsetWidth / 2, c.offsetTop + c.offsetHeight / 2)}ms`);
      c.classList.add("apparait");
    });
  }

  // The angle of a shot: set at once at its opening — during the cut, so the jump never shows —,
  // then one transition over the whole travel, eased like the camera.
  const vue = (a, cote) => `perspective(1100px) rotateX(${a.x}deg) rotateY(${cote * a.y}deg) scale(${ECHELLE})`;
  function orienter(cote, duree) {
    const b = document.body;
    b.style.transition = "none";
    b.style.transform = vue(ANGLE.debut, cote);
    void b.offsetWidth;
    b.style.transition = `transform ${duree}ms cubic-bezier(.45,0,.55,1)`;
    b.style.transform = vue(ANGLE.fin, cote);
  }

  function filmer(tr, k, depart) {
    const tourner = (now) => {
      raf = 0;
      if (pause) return;
      const p = tr.position(Math.max(0, now - depart));
      pilote.viser(p.x, p.y, k);
      if (now - depart < tr.T) raf = requestAnimationFrame(tourner);
    };
    raf = requestAnimationFrame(tourner);
  }

  // One shot, from one cut to the next. `premier`: the very first, which the poster cross-fades into —
  // the landing page is told once it is set up, and the camera waits for the fade to be under way.
  async function plan(premier = false) {
    const mien = ++jeton;
    if (!premier) { rideau.classList.add("on"); await attendre(FONDU); }
    if (mien !== jeton) return;
    const p = plans[i];
    p.jouer();
    const points = p.chemin();
    if (!points.length) { i = (i + 1) % plans.length; return void plan(); }
    const tr = trajet(points, p.k);
    const depart = tr.position(0);
    pilote.viser(depart.x, depart.y, p.k);
    const decalage = premier ? 700 : 150;
    minuter(tr, decalage);
    if (!calme()) orienter(i % 2 ? 1 : -1, decalage + tr.T);
    rideau.classList.remove("on");
    dire({ pret: premier, scene: p.id, params: p.params() });
    filmer(tr, p.k, performance.now() + decalage);
    await attendre(decalage + tr.T + TENUE);
    if (mien !== jeton) return;
    i = (i + 1) % plans.length;
    plan();
  }

  function arreter() {
    jeton++;
    clearTimeout(minuterie);
    cancelAnimationFrame(raf);
    raf = 0;
  }

  addEventListener("message", (e) => {
    if (e.source !== parent || e.origin !== location.origin || e.data?.type !== "rift-demo") return;
    // A language switch redraws the whole map, timings lost: the shot starts over.
    if (typeof e.data.lang === "string") { setLang(e.data.lang); if (!pause) { arreter(); plan(); } }
    if (typeof e.data.pause === "boolean" && e.data.pause !== pause) {
      pause = e.data.pause;
      // Out of sight the shot is dropped, and replayed from its start on the way back: CSS
      // animations would have run on without the camera.
      arreter();
      if (!pause) plan();
    }
  });

  (document.fonts?.ready || Promise.resolve()).then(() => requestAnimationFrame(() => plan(true)));
}
