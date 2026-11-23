/*
 * Rift Transfers — landing page (index.html).
 *
 * What the HTML cannot do on its own: switching languages, the figures, the live hero and its
 * depth. Everything here is an improvement on a page that already works without it — the text is
 * in the HTML, the buttons and the search form reach the map by plain links, and the poster stands
 * in for the live map.
 *
 * Importing i18n.js already translates the page, as on the map. No displayed text is written here:
 * every string goes through `t()`, and names arrive as parameters read from the data.
 */
import { t, tn, lang, setLang, LANGS, surChangement } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;
const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);

// ---------- language ----------
// The same two-state toggle as the map's, revealed only now: without the script, there is nothing
// to switch.
const bascule = $("lang");
bascule.hidden = false;
bascule.addEventListener("click", () => setLang(LANGS.find((l) => l !== lang())));

// Links to the map carry the language only when this page's URL does — a shared `?lang=` link, or
// the toggle, which writes it into the URL. Otherwise the map resolves the language on its own, from
// the saved choice or the browser, exactly as this page just did: no need to pin it.
function liensCarte() {
  const demande = new URLSearchParams(location.search).get("lang");
  const fixe = LANGS.includes(demande) ? demande : null;
  document.querySelectorAll("a[data-carte]").forEach((a) => { a.href = fixe ? `map/?lang=${fixe}` : "map/"; });
  const champ = document.querySelector('.search input[name="lang"]');
  champ.disabled = !fixe;
  champ.value = fixe || "";
}
liensCarte();

// ---------- figures ----------
// Computed from data/teams.json with the map's own definitions (app.js): a player is an identity in
// lower case; a starter and the second player of a split role each have a thread, a rotation kept
// under the 20 % threshold has none but is still on the map; a team change is two consecutive Worlds
// appearances of a player under two different columns — what the statistics drawer's flow table
// adds up. "Most Worlds" and "most teams" are its two first tables. Nothing is written down: a
// figure in the HTML would go stale at the next collection run.
const ROLES = ["top", "jungle", "mid", "bot", "support"];
async function calculerChiffres() {
  const res = await fetch("data/teams.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`data/teams.json: HTTP ${res.status}`);
  const d = await res.json();
  const presents = new Set(), fils = new Map(), noms = new Set();
  for (const equipe of d.teams) {
    noms.add(equipe.name);
    for (const [annee, e] of Object.entries(equipe.worlds)) {
      Object.values(e.aliases || {}).forEach((a) => noms.add(a));
      for (const r of ROLES) {
        const titulaire = e.lineup[r], second = e.shared?.[r] || null;
        presents.add(titulaire.toLowerCase());
        if (second) presents.add(second.toLowerCase());
        for (const nom of (e.split || []).includes(r) && second ? [titulaire, second] : [titulaire]) {
          const id = nom.toLowerCase();
          if (!fils.has(id)) fils.set(id, { nom, apps: [] });
          fils.get(id).apps.push({ annee: Number(annee), equipe: equipe.code });
          noms.add(nom);
        }
      }
    }
  }
  let changements = 0;
  for (const p of fils.values()) {
    p.apps.sort((a, b) => a.annee - b.annee);
    for (let i = 1; i < p.apps.length; i++) if (p.apps[i].equipe !== p.apps[i - 1].equipe) changements++;
  }
  // A record shared by several players names them all, rather than electing one by sort order.
  const record = (mesure) => {
    const v = [...fils.values()].map((p) => ({ p, n: mesure(p) }));
    const n = Math.max(...v.map((x) => x.n));
    return { n, noms: v.filter((x) => x.n === n).map((x) => x.p.nom).sort((a, b) => a.localeCompare(b)) };
  };
  return {
    editions: d.years.length, de: d.years[0], a: d.years.at(-1),
    equipes: d.teams.length, regions: d.regions.length,
    joueurs: presents.size, changements,
    plus: record((p) => p.apps.length),
    voyageur: record((p) => new Set(p.apps.map((a) => a.equipe)).size),
    noms: [...noms].sort((a, b) => a.localeCompare(b)),
  };
}

let chiffres = null;
function afficherChiffres() {
  if (!chiffres) return;
  const c = chiffres, nombre = new Intl.NumberFormat(lang());
  $("stats").innerHTML = [
    [c.editions, "landing.chiffres.editions", t("landing.chiffres.periode", { de: c.de, a: c.a })],
    [c.equipes, "landing.chiffres.equipes", tn("landing.chiffres.regions", c.regions)],
    [c.joueurs, "landing.chiffres.joueurs", t("landing.chiffres.joueurs.detail")],
    [c.changements, "landing.chiffres.changements", t("landing.chiffres.changements.detail")],
  ].map(([n, cle, detail]) => `<div class="stat"><dt>${tn(cle, n)}</dt><dd class="num">${nombre.format(n)}</dd><dd class="sub">${detail}</dd></div>`).join("");
  const gras = (r) => `<b>${echapper(r.noms.join(", "))}</b>`;
  $("records").innerHTML = `<span>${t("landing.chiffres.record.plus", { noms: gras(c.plus), n: c.plus.n })}</span>`
    + `<span>${t("landing.chiffres.record.equipes", { noms: gras(c.voyageur), n: c.voyageur.n })}</span>`;
  $("figures").hidden = false;
}

// The search field suggests the names the map knows — teams, players, period handles —; the map
// accepts more than that (codes, short labels, any case or accent), and the field takes anything.
function remplirSuggestions() {
  const liste = $("lqNoms");
  liste.replaceChildren(...chiffres.noms.map((nom) => Object.assign(document.createElement("option"), { value: nom })));
}

const donnees = calculerChiffres().then((c) => { chiffres = c; afficherChiffres(); remplirSuggestions(); }).catch(() => {
  // No figures, and nothing else lost: the section simply stays hidden.
});

// ---------- live hero ----------
// The poster is the map as a link preview shows it; the live map takes over on a wide screen that
// has asked neither for reduced motion nor for reduced data, once the page has loaded and gone idle.
// Below 700 px the poster suffices: loading 120 columns to decorate a phone screen would be the
// opposite of the point.
const stage = $("stage"), ecran = $("screen");
const permis = () => !calme && !navigator.connection?.saveData && matchMedia("(min-width: 701px)").matches;
let cadre = null, scene = null;

const parler = (msg) => cadre?.contentWindow?.postMessage({ type: "rift-demo", ...msg }, location.origin);

function lancer() {
  if (cadre || !permis()) return;
  cadre = document.createElement("iframe");
  cadre.className = "hero-live";
  cadre.src = `map/?demo&lang=${lang()}`;
  // Decoration for assistive technologies and the keyboard alike: the poster's `alt` already says
  // what it shows, and the buttons above are the way in.
  cadre.setAttribute("aria-hidden", "true");
  cadre.tabIndex = -1;
  cadre.inert = true;
  ecran.insertBefore(cadre, ecran.querySelector(".hero-link"));
}

// The caption under the screen: what the shot shows, its subject read from the data.
function legende(fondu = true) {
  if (!scene) return;
  const el = $("captionText");
  const texte = t(`landing.scene.${scene.scene}`, scene.params);
  if (!fondu || calme) { el.textContent = texte; return; }
  el.classList.add("change");
  setTimeout(() => { el.textContent = texte; el.classList.remove("change"); }, 300);
}

addEventListener("message", (e) => {
  if (!cadre || e.source !== cadre.contentWindow || e.origin !== location.origin || e.data?.type !== "rift-demo") return;
  if (e.data.scene) {
    scene = e.data;
    legende(!e.data.pret);
  }
  if (e.data.pret) {
    stage.classList.add("vivant");
    $("caption").hidden = false;
    suivreVisibilite();
  }
});

// The shots stop whenever nobody can see them: the hero scrolled out of view, or the tab hidden.
function suivreVisibilite() {
  let visible = true;
  const maj = () => parler({ pause: !visible || document.hidden });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; maj(); }, { threshold: 0.1 }).observe(ecran);
  document.addEventListener("visibilitychange", maj);
}

// After the page's own load — the poster first, it is the largest paint —, then the figures, then
// an idle moment.
addEventListener("load", () => donnees.finally(() => {
  if (window.requestIdleCallback) requestIdleCallback(lancer, { timeout: 2500 });
  else setTimeout(lancer, 600);
}));

// ---------- depth ----------
// CSS does the 3D — `perspective` on the scene, a rotation on the stage —, this only feeds it, and
// on scroll alone: the zone lies back while it sits low on the screen, flat once it has risen into
// view; the glow behind drifts more slowly than the page. The stage's own transition smooths the steps. Nothing follows the pointer and nothing sways
// on its own any more: every change of the stage's transform resamples the live map, and its thin
// lines shimmered. Nothing at all when the visitor asks for reduced motion.
if (!calme) {
  const decor = stage.closest(".hero-scene");
  const halo = decor.querySelector(".hero-glow");
  let raf = 0;
  const peindre = () => {
    raf = 0;
    const r = decor.getBoundingClientRect();
    const recul = Math.min(1, Math.max(0, (r.top - innerHeight * 0.12) / (innerHeight * 0.55)));
    stage.style.setProperty("--rx", `${(recul * 22).toFixed(2)}deg`);
    stage.style.setProperty("--sc", (0.92 + (1 - recul) * 0.08).toFixed(4));
    halo.style.setProperty("--par", `${Math.round((innerHeight / 2 - (r.top + r.height / 2)) * 0.14)}px`);
  };
  const demander = () => { raf ||= requestAnimationFrame(peindre); };
  addEventListener("scroll", demander, { passive: true });
  addEventListener("resize", demander);
  peindre();
}

// ---------- language switches ----------
// No reload, as on the map: the dictionary has already rewritten the static text; what is left is
// what this module writes — the figures, the caption — and the links, which follow the URL. The live
// map switches with the page.
surChangement(() => {
  liensCarte();
  afficherChiffres();
  legende(false);
  parler({ lang: lang() });
});
