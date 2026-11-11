#!/usr/bin/env node
// Collecte les titulaires des Worlds sur Leaguepedia (Special:CargoExport) et applique
// les règles de sélection de docs/PLAN-2013-2016.md : seuil de 20 %, poste majoritaire,
// deux joueurs par poste au maximum.
//
// Usage : node scripts/fetch-worlds.mjs [année…] [--refresh] [--out <dossier>]
//   Sans année : les 14 éditions 2013–2026. La règle 4 — une graphie par personne — se
//   décidant sur l'ensemble des éditions, une exécution partielle peut proposer une autre
//   graphie qu'une exécution complète : n'y recourir que pour un contrôle ponctuel.
//   --refresh : ignore le cache de réponses brutes et réinterroge l'API.
//
// Sorties, dans un dossier ignoré par git (.fetch-worlds/ par défaut) :
//   raw/<année>.json        réponse CargoExport brute, réutilisée comme cache
//   raw/people.json         résolution des titres de page joueur, réutilisée comme cache
//   fragments/<année>.json  fragment au format data/teams.json, à recopier dans worlds[<année>]
//   detail/<année>.json     parties par joueur et par poste, pourcentages, noms complets
//   people.json             une fiche par personne : page canonique, graphie, nom complet, pays
//   report.md               cas à trancher à la main
//
// Ce script lit /data mais ne le modifie jamais.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://lol.fandom.com/wiki/Special:CargoExport";
const UA = "rift-transfers/1.0 (+https://github.com/MrPa2a/rift-transfers)";
const PAGE_SIZE = 2000;
const THROTTLE_MS = 400;
const THRESHOLD = 0.2;
const HORIZON = [2013, 2026];
const ROLES = ["top", "jungle", "mid", "bot", "support"];
const ROLE_OF = { Top: "top", Jungle: "jungle", Mid: "mid", Bot: "bot", Support: "support" };

// --- année → préfixe d'OverviewPage.
// De 2013 à 2016 l'édition tient sur une seule page ; à partir de 2017 elle se répartit entre
// « …/Play-In » et « …/Main Event », la page parente ne portant alors aucune ligne de scoreboard.
// Le préfixe couvre les deux cas. `checkPages()` revérifie cette table à chaque exécution.
const PAGES = {
  2013: "Season 3 World Championship",
  2014: "2014 Season World Championship",
  2015: "2015 Season World Championship",
  2016: "2016 Season World Championship",
  2017: "2017 Season World Championship",
  2018: "2018 Season World Championship",
  2019: "2019 Season World Championship",
  2020: "2020 Season World Championship",
  2021: "2021 Season World Championship",
  2022: "2022 Season World Championship",
  2023: "2023 Season World Championship",
  2024: "2024 Season World Championship",
  2025: "2025 Season World Championship",
  2026: "2026 Season World Championship",
};
const ALL_YEARS = Object.keys(PAGES).map(Number).sort((a, b) => a - b);

// --- nom d'équipe Leaguepedia → code de colonne (les 32 colonnes visées par le plan).
// Une équipe absente de cette table est hors périmètre : le rapport la liste plutôt que
// de l'écarter en silence.
const TEAM_CODE = {
  // LCK
  "SK Telecom T1": "T1", "T1": "T1",
  "Samsung Ozone": "GEN", "Samsung White": "GEN", "Samsung Galaxy": "GEN", "Gen.G": "GEN",
  "KOO Tigers": "HLE", "ROX Tigers": "HLE", "Hanwha Life Esports": "HLE",
  "DAMWON Gaming": "DK", "DWG KIA": "DK", "Dplus Kia": "DK", "Dplus KIA": "DK",
  "KT Rolster": "KT",
  "Longzhu Gaming": "DRX", "DRX": "DRX",
  "NaJin Black Sword": "NJN", "NaJin White Shield": "NJN",
  "Samsung Blue": "SSB",
  // LPL
  "EDward Gaming": "EDG",
  "Royal Club": "RNG", "Star Horn Royal Club": "RNG", "Royal Never Give Up": "RNG",
  "Invictus Gaming": "IG",
  "FunPlus Phoenix": "FPX",
  "Top Esports": "TES",
  "JD Gaming": "JDG",
  "Bilibili Gaming": "BLG",
  "Anyone's Legend": "AL",
  "Oh My God": "OMG",
  "LGD Gaming": "LGD",
  // LEC
  "G2 Esports": "G2",
  "Fnatic": "FNC",
  "Splyce": "MKOI", "MAD Lions": "MKOI", "MAD Lions KOI": "MKOI", "Movistar KOI": "MKOI",
  "Karmine Corp": "KC",
  "H2k-Gaming": "H2K",
  "Origen": "ORI",
  // LCS
  "Cloud9": "C9",
  "Team Liquid": "TL",
  "FlyQuest": "FLY",
  "TSM": "TSM",
  "Counter Logic Gaming": "CLG",
  // LMS
  "ahq eSports Club": "AHQ",
  "Flash Wolves": "FW",
  "Taipei Assassins": "TPA", "J Team": "TPA",
};

// Ordre de colonnes du plan, pour que les fragments sortent dans l'ordre de teams.json.
const COLUMN_ORDER = [
  "T1", "GEN", "HLE", "DK", "KT", "DRX", "NJN", "SSB",
  "EDG", "RNG", "IG", "FPX", "TES", "JDG", "BLG", "AL", "OMG", "LGD",
  "G2", "FNC", "MKOI", "KC", "H2K", "ORI",
  "C9", "TL", "FLY", "TSM", "CLG",
  "AHQ", "FW", "TPA",
];

// --- arbitrages actés. Le script les applique et cesse de les signaler : seules les
// divergences nouvelles remontent dans le rapport.
//
// Clé : page canonique Leaguepedia en minuscules. Valeur : graphie à écrire dans /data.
const GRAPHIES_ARBITREES = {
  // Graphies de /data conservées contre Leaguepedia (arbitrage du 11/11/2026).
  jiejie: "Jiejie",
  xun: "Xun",
  mithy: "mithy",
  "bean (louis schmitz)": "Bean",
  kyeahoo: "Kyeahoo",
  // Égalité stricte 6-6 entre `ZionSpartan` (2015) et `Darshan` (2016) : page canonique retenue.
  darshan: "Darshan",
  // Joueurs de 2013–2016 absents de /data : la casse du titre de page l'emporte sur la
  // fréquence, les scoreboards de ces années transcrivant volontiers tout en minuscules.
  cool: "Cool",
  "san (guo jun-liang)": "San",
  dandy: "DanDy",
  huhi: "Huhi",
};

// Départages d'égalité stricte imposés à la main, quand la règle 2 ne tranche pas.
// Clé : « <année> <code> <poste> ». Valeur : la page canonique du joueur de gauche.
const EGALITES_ARBITREES = {
  "2016 T1 jungle": "bengi", // Bengi 10 / Blank 10, tous deux jusqu'en finale
  "2019 C9 jungle": "svenskeren", // Blaber 3 / Svenskeren 3 : titulaire actuel conservé
};

// Pseudos réellement portés à une édition donnée, quand ils diffèrent de la graphie retenue.
// La rangée affiche ce pseudo, l'identité du joueur restant la graphie canonique : le fil de
// carrière demeure continu (décision du 11/11/2026).
//
// Table volontairement explicite : aucun alias n'est déduit. Leaguepedia mêle vrais
// renommages et coquilles (`Kkramer` sur une ligne, `Broken Blade`, `0N`, `Argonavtt`), et
// une simple différence de casse ne doit surtout pas devenir un alias — la règle 4 vise
// justement à l'unifier. Le rapport liste les candidats non repris ici.
//
// Clé : page canonique en minuscules, puis année → pseudo de l'époque.
const PSEUDOS_EPOQUE = {
  jensen: { 2015: "Incarnati0n" },
  zven: { 2015: "Niels" },
  darshan: { 2015: "ZionSpartan" },
  da7: { 2013: "comA" },
  clearlove: { 2017: "Clearlove7" }, // le 7 ajouté le temps de la saison 2017
  loveling: { 2013: "LoveLin" },
};

// Graphies d'année examinées puis écartées comme coquilles Leaguepedia : la graphie retenue
// s'applique, et le script ne les propose plus. Clé « <page en minuscules> <année> ».
const COQUILLES_ECARTEES = {
  "kramer 2015": "Kkramer", // une seule ligne, un K doublé
};

// Noms de colonne arrêtés par le plan. Le `name` d'une rangée n'est écrit que s'il en diffère.
const PLAN_TEAM_NAMES = {
  T1: "T1", GEN: "Gen.G", HLE: "Hanwha Life", DK: "Dplus KIA", KT: "KT Rolster", DRX: "DRX",
  NJN: "NaJin e-mFire", SSB: "Samsung Blue",
  EDG: "EDG", RNG: "RNG", IG: "Invictus Gaming", FPX: "FunPlus Phoenix", TES: "Top Esports",
  JDG: "JD Gaming", BLG: "Bilibili Gaming", AL: "Anyone's Legend", OMG: "Oh My God", LGD: "LGD Gaming",
  G2: "G2 Esports", FNC: "Fnatic", MKOI: "MAD / KOI", KC: "Karmine Corp", H2K: "H2k-Gaming", ORI: "Origen",
  C9: "Cloud9", TL: "Team Liquid", FLY: "FlyQuest", TSM: "TSM", CLG: "Counter Logic Gaming",
  AHQ: "ahq e-Sports Club", FW: "Flash Wolves", TPA: "Taipei Assassins",
};

// Alias annuels arrêtés par l'annexe du plan. Décision du 11/11/2026 : l'annexe fait foi sur
// Leaguepedia, qui normalise ses noms d'équipe (`TSM` pour `Team SoloMid`, `SK Telecom T1`
// pour `SKT T1 K`). Les noms Leaguepedia restent tracés dans le rapport.
const PLAN_ALIASES = {
  T1: { 2013: "SKT T1 K", 2015: "SKT T1", 2016: "SKT T1" },
  GEN: { 2013: "Samsung Ozone", 2014: "Samsung Galaxy White", 2016: "Samsung Galaxy" },
  RNG: { 2013: "Royal Club", 2014: "Star Horn Royal Club" },
  HLE: { 2015: "KOO Tigers", 2016: "ROX Tigers" },
  NJN: { 2013: "NaJin Black Sword", 2014: "NaJin White Shield" },
  SSB: { 2014: "Samsung Galaxy Blue" },
  MKOI: { 2016: "Splyce", 2019: "Splyce" },
  // Le rebrand de Team SoloMid en TSM date du 1er janvier 2020 : 2020 garde donc « TSM ».
  TSM: { 2013: "Team SoloMid", 2014: "Team SoloMid", 2015: "Team SoloMid", 2016: "Team SoloMid", 2017: "Team SoloMid" },
  EDG: { 2014: "EDward Gaming", 2015: "EDward Gaming", 2016: "EDward Gaming" },
  H2K: { 2015: "H2k-Gaming", 2016: "H2k-Gaming" },
  OMG: { 2013: "Oh My God", 2014: "Oh My God" },
  // Rebrand de Taipei Assassins, rattaché à la colonne TPA (arbitrage du 11/11/2026).
  TPA: { 2019: "J Team" },
};

// ---------------------------------------------------------------------- utilitaires

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (n) => `${(n * 100).toFixed(0)} %`;
const low = (s) => String(s ?? "").toLowerCase();

// `Uzi (Jian Zi-Hao)` → pseudo `Uzi`, nom complet `Jian Zi-Hao`.
const splitLink = (link) => {
  const m = /^(.*?)\s+\(([^()]*)\)$/.exec(link ?? "");
  return m ? { pseudo: m[1], fullName: m[2] } : { pseudo: link ?? "", fullName: null };
};

// `2021 Season World Championship/Main Event_Finals_1_5` → `Finals`.
const roundOf = (gid) => /_([^_]+)_\d+_\d+$/.exec(gid ?? "")?.[1] ?? null;
// `2021 Season World Championship/Play-In` → `Play-In`.
const phaseOf = (page) => ((page ?? "").includes("/") ? page.slice(page.indexOf("/") + 1) : null);
const stageOf = (page, gid) => [phaseOf(page), roundOf(gid)].filter(Boolean).join(" · ") || "?";
const yearOf = (tournament) => Number(/^(\d{4})/.exec(tournament?.start ?? "")?.[1] ?? 0);
const inHorizon = (y) => y >= HORIZON[0] && y <= HORIZON[1];
// Identité d'une personne : sa page canonique Leaguepedia, redirections résolues.
const idFor = (link, resolution) => low(resolution.get(low(link))?.page ?? link);

async function cargo(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ format: "json", ...params })) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`CargoExport a répondu ${res.status} ${res.statusText}`);
  const body = await res.text();
  let data;
  try { data = JSON.parse(body); } catch { throw new Error(`réponse non JSON : ${body.slice(0, 160)}…`); }
  if (!Array.isArray(data)) throw new Error(`réponse inattendue : ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// Pagination par `offset` : une édition dépasse le plafond d'une réponse unique.
async function cargoAll(params) {
  const out = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await cargo({ ...params, limit: PAGE_SIZE, offset });
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
    await sleep(THROTTLE_MS);
  }
}

// -------------------------------------------------- contrôle de la table des pages

// La table année → OverviewPage n'était vérifiée que pour 2013–2016 ; au-delà, une édition
// se répartit sur plusieurs pages. Ce contrôle la confronte à la table `Tournaments` et aux
// pages qui portent réellement des parties, pour qu'aucune sous-page ne soit oubliée et
// qu'aucune qualification régionale ne soit avalée par erreur.
async function checkPages(years) {
  const where = "Tournaments.OverviewPage LIKE '%World Championship%' OR Tournaments.OverviewPage LIKE '%Worlds%'";
  const tournaments = await cargoAll({
    tables: "Tournaments",
    fields: "Tournaments.OverviewPage=page,Tournaments.Name=name,Tournaments.DateStart=start,Tournaments.League=league,Tournaments.Region=region",
    where,
    order_by: "Tournaments.DateStart ASC, Tournaments.OverviewPage ASC",
  });
  await sleep(THROTTLE_MS);
  const scoreboards = await cargoAll({
    tables: "ScoreboardPlayers",
    fields: "ScoreboardPlayers.OverviewPage=page,COUNT(*)=rows",
    where: where.replaceAll("Tournaments.", "ScoreboardPlayers."),
    group_by: "ScoreboardPlayers.OverviewPage",
    order_by: "ScoreboardPlayers.OverviewPage ASC",
  });

  const byPage = new Map(tournaments.map((t) => [t.page, t]));
  const prefixFor = (page) => ALL_YEARS.find((y) => page === PAGES[y] || page.startsWith(`${PAGES[y]}/`));

  const covered = new Map(); // année → pages porteuses de parties
  const excluded = []; // ligue « World Championship » dans l'horizon, mais hors préfixe retenu
  const outside = []; // tout le reste : autres ligues, ou hors horizon

  for (const row of scoreboards) {
    const page = row.page;
    const rows = Number(row.rows);
    const year = prefixFor(page);
    if (year) {
      if (!covered.has(year)) covered.set(year, []);
      covered.get(year).push({ page, rows });
      continue;
    }
    const t = byPage.get(page);
    const hinted = yearOf(t) || Number(/(20\d{2})/.exec(page)?.[1] ?? 0);
    const entry = { page, rows, year: hinted || null, league: t?.league ?? "?" };
    if (t?.league === "World Championship" && inHorizon(hinted)) excluded.push(entry);
    else outside.push(entry);
  }

  // Une édition demandée dont aucune page ne porte de parties : la table PAGES est fausse.
  const empty = years.filter((y) => !covered.has(y));
  // Un tournoi de ligue « World Championship » dans l'horizon qu'aucun préfixe ne couvre.
  const uncovered = tournaments
    .filter((t) => t.league === "World Championship" && inHorizon(yearOf(t)) && !prefixFor(t.page))
    .map((t) => ({ page: t.page, start: t.start, hasGames: scoreboards.some((s) => s.page === t.page) }));

  return { covered, excluded, outside, empty, uncovered };
}

// -------------------------------------------------------- collecte d'une édition

// CargoExport sérialise en nombre JSON toute valeur qui ressemble à un nombre : le pseudo
// `369` arrive ainsi en `369` et non en `"369"`, ce qui fausse toute comparaison de chaînes.
const asText = (v) => (v === null || v === undefined || v === "" ? null : String(v));
const normalize = (rows) => rows.map((r) => ({
  page: asText(r.page), team: asText(r.team), role: asText(r.role),
  link: asText(r.link), name: asText(r.name), gid: asText(r.gid), dt: asText(r.dt),
}));

async function fetchYear(year, { refresh, outDir }) {
  const cache = join(outDir, "raw", `${year}.json`);
  if (!refresh) {
    const hit = await readFile(cache, "utf8").then(JSON.parse).catch(() => null);
    if (hit?.length) return { rows: normalize(hit), cached: true };
  }
  const rows = await cargoAll({
    tables: "ScoreboardPlayers",
    fields: [
      "ScoreboardPlayers.OverviewPage=page",
      "ScoreboardPlayers.Team=team",
      "ScoreboardPlayers.Role=role",
      "ScoreboardPlayers.Link=link",
      "ScoreboardPlayers.Name=name",
      "ScoreboardPlayers.GameId=gid",
      "ScoreboardPlayers.DateTime_UTC=dt",
    ].join(","),
    where: `ScoreboardPlayers.OverviewPage LIKE '${PAGES[year]}%'`,
    // Ordre chronologique strict et déterministe : il sert de mesure du « tour le plus avancé ».
    order_by: "ScoreboardPlayers.DateTime_UTC ASC, ScoreboardPlayers.GameId ASC, ScoreboardPlayers.Link ASC",
  });
  await writeFile(cache, `${JSON.stringify(rows)}\n`);
  return { rows: normalize(rows), cached: false };
}

// --------------------------------------------- résolution de l'identité des joueurs

const CHUNK = 100;
const sqlList = (vals) => vals.map((v) => `'${String(v).replaceAll("'", "''")}'`).join(",");
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// Le champ `Link` du scoreboard n'est pas une identité fiable : c'est le titre de page tel
// qu'il était au moment de la partie, donc parfois une **redirection**. `Clearlove7` (2017)
// et `Clearlove` (2018) désignent la même personne, Ming Kai ; sa carrière se scinderait en
// deux fils sans résolution. La casse varie aussi d'une édition à l'autre (`bengi` / `Bengi`).
//
// `PlayerRedirects` donne la page canonique de chaque alias, et `Players` le pseudo de
// référence, le nom complet et le pays.
async function resolvePeople(links, { refresh, outDir }) {
  const cache = join(outDir, "raw", "people.json");
  if (!refresh) {
    const hit = await readFile(cache, "utf8").then(JSON.parse).catch(() => null);
    // Une exécution sur une seule édition ne résout que ses joueurs : ce cache partiel ne
    // doit pas servir à une exécution plus large, sous peine d'identités non résolues.
    if (hit && links.every((l) => low(l) in hit)) return new Map(Object.entries(hit));
  }

  const targets = new Map(); // alias en minuscules → page canonique
  for (const chunk of chunks(links, CHUNK)) {
    const rows = await cargoAll({
      tables: "PlayerRedirects",
      fields: "PlayerRedirects.AllName=alias,PlayerRedirects.OverviewPage=target",
      where: `PlayerRedirects.AllName IN (${sqlList(chunk)})`,
    });
    for (const r of rows) {
      const alias = asText(r.alias);
      const target = asText(r.target);
      if (alias && target) targets.set(low(alias), target);
    }
    await sleep(THROTTLE_MS);
  }

  const pages = [...new Set(links.map((l) => targets.get(low(l)) ?? l))];
  const info = new Map(); // page canonique en minuscules → fiche joueur
  for (const chunk of chunks(pages, CHUNK)) {
    const rows = await cargoAll({
      tables: "Players",
      fields: "Players.OverviewPage=page,Players.ID=id,Players.Name=name,Players.Country=country",
      where: `Players.OverviewPage IN (${sqlList(chunk)})`,
    });
    for (const r of rows) {
      const page = asText(r.page);
      if (page) info.set(low(page), { id: asText(r.id), fullName: asText(r.name), country: asText(r.country) });
    }
    await sleep(THROTTLE_MS);
  }

  const out = new Map();
  for (const link of links) {
    const page = targets.get(low(link)) ?? link;
    const fiche = info.get(low(page));
    out.set(low(link), {
      page,
      lpId: fiche?.id ?? null,
      fullName: fiche?.fullName ?? splitLink(link).fullName,
      country: fiche?.country ?? null,
      known: Boolean(fiche),
    });
  }
  await writeFile(cache, `${JSON.stringify(Object.fromEntries(out), null, 1)}\n`);
  return out;
}

// ------------------------------------------------------- recensement des personnes

// Une personne = une page canonique Leaguepedia. La règle 4 — une personne, une graphie,
// partout — se décide sur l'ensemble des 14 éditions, pas édition par édition : `Caps`
// (8 éditions) doit l'emporter sur `caPs` (une seule).
function buildCensus(rowsByYear, resolution) {
  const people = new Map();
  for (const year of [...rowsByYear.keys()].sort((a, b) => a - b)) {
    for (const r of rowsByYear.get(year)) {
      if (!ROLE_OF[r.role] || !r.link) continue;
      const res = resolution.get(low(r.link));
      const id = idFor(r.link, resolution);
      let p = people.get(id);
      if (!p) {
        p = {
          id, page: res?.page ?? r.link, lpId: res?.lpId ?? null, fullName: res?.fullName ?? null,
          country: res?.country ?? null, known: Boolean(res?.known),
          links: new Map(), spellings: new Map(), byYear: new Map(), firstYear: year, lastYear: year,
        };
        people.set(id, p);
      }
      p.links.set(r.link, (p.links.get(r.link) ?? 0) + 1);
      if (r.name) {
        p.spellings.set(r.name, (p.spellings.get(r.name) ?? 0) + 1);
        if (!p.byYear.has(year)) p.byYear.set(year, new Map());
        const perYear = p.byYear.get(year);
        perYear.set(r.name, (perYear.get(r.name) ?? 0) + 1);
      }
      p.lastYear = year;
    }
  }
  for (const p of people.values()) {
    // Règle 4 : la graphie la plus employée ; à égalité, celle du titre de page canonique.
    // `Players.ID` ne sert **pas** de référence : il porte le pseudo actuel du joueur, donc
    // celui d'après un renommage (`Trashy` → `Kold`, `ackerman` → `GodLike`), et il est
    // parfois altéré (`Balls` → `BalIs`, `Reginald` → `ReginaId`, avec un I majuscule).
    // Il reste signalé dans le rapport quand il diffère, pour arbitrage.
    const ref = splitLink(p.page).pseudo;
    p.proposed = [...p.spellings]
      .sort((a, b) => b[1] - a[1] || (a[0] === ref ? -1 : b[0] === ref ? 1 : 0))[0]?.[0] ?? ref;
    p.arbitrated = Object.hasOwn(GRAPHIES_ARBITREES, p.id);
    p.spelling = p.arbitrated ? GRAPHIES_ARBITREES[p.id] : p.proposed;
  }
  return people;
}

// ------------------------------------------------- application des règles 1 et 2

function buildYear(year, rows, census, resolution, notes) {
  const teams = new Map();
  const unknownRoles = new Map();
  const missingDates = new Set();

  rows.forEach((r, seq) => {
    const role = ROLE_OF[r.role];
    if (!role) {
      unknownRoles.set(r.role, (unknownRoles.get(r.role) ?? 0) + 1);
      return;
    }
    if (!r.dt) missingDates.add(r.gid);
    if (!teams.has(r.team)) teams.set(r.team, { lpName: r.team, gameIds: new Set(), players: new Map(), pages: new Set() });
    const team = teams.get(r.team);
    team.gameIds.add(r.gid);
    team.pages.add(r.page);

    const who = census.get(idFor(r.link, resolution));
    if (!team.players.has(who.id)) team.players.set(who.id, { who, roles: new Map() });
    const p = team.players.get(who.id);
    if (!p.roles.has(role)) p.roles.set(role, { gameIds: new Set(), lastSeq: -1, lastStage: null });
    const slot = p.roles.get(role);
    slot.gameIds.add(r.gid);
    if (seq > slot.lastSeq) { slot.lastSeq = seq; slot.lastStage = stageOf(r.page, r.gid); }
  });

  if (unknownRoles.size) {
    notes.push(`${year} : rôle(s) non reconnu(s), lignes ignorées — ${[...unknownRoles].map(([k, n]) => `« ${k} » (${n})`).join(", ")}`);
  }
  if (missingDates.size) {
    notes.push(`${year} : ${missingDates.size} partie(s) sans date ; le départage « tour le plus avancé » y est moins fiable.`);
  }

  const out = new Map(); // code (ou « ~nom Leaguepedia » hors périmètre) → détail d'équipe
  for (const team of teams.values()) {
    const games = team.gameIds.size;
    const limit = games * THRESHOLD;
    const code = TEAM_CODE[team.lpName] ?? null;
    const detail = { code, lpName: team.lpName, games, threshold: limit, pages: [...team.pages].sort(), roles: {}, issues: [] };

    // Règle 1, seconde condition : le poste où le joueur a joué le plus de parties.
    const majority = new Map();
    for (const p of team.players.values()) {
      const ranked = [...p.roles].map(([role, s]) => ({ role, games: s.gameIds.size })).sort((a, b) => b.games - a.games);
      majority.set(p.who.id, ranked[0].role);
      if (ranked.length > 1 && ranked[0].games === ranked[1].games) {
        const tied = ranked.filter((r) => r.games === ranked[0].games);
        detail.issues.push({
          kind: "majorite-ambigue",
          text: `${p.who.spelling} : poste majoritaire indécidable (${tied.map((r) => `${r.role} ${r.games}`).join(" = ")}) ; ${ranked[0].role} retenu par défaut`,
        });
      }
    }

    for (const role of ROLES) {
      const candidates = [...team.players.values()]
        .filter((p) => p.roles.has(role))
        .map((p) => {
          const s = p.roles.get(role);
          const n = s.gameIds.size;
          const isMajority = majority.get(p.who.id) === role;
          const overThreshold = n >= limit;
          return {
            id: p.who.id, pseudo: p.who.spelling, link: p.who.page, fullName: p.who.fullName,
            spelling: p.who.spelling,
            games: n, share: games ? n / games : 0,
            majorityRole: majority.get(p.who.id), isMajority, overThreshold,
            qualified: overThreshold && isMajority,
            lastStage: s.lastStage, lastSeq: s.lastSeq,
          };
        })
        // Règle 2 : le plus de parties d'abord ; à égalité stricte, le tour le plus avancé.
        .sort((a, b) => b.games - a.games || b.lastSeq - a.lastSeq);

      const qualified = candidates.filter((c) => c.qualified);
      // Égalité déjà tranchée à la main : le joueur désigné passe devant.
      const forced = EGALITES_ARBITREES[`${year} ${code} ${role}`];
      if (forced && qualified.length > 1 && qualified[0].games === qualified[1].games) {
        const i = qualified.findIndex((c) => c.id === forced);
        if (i > 0) qualified.unshift(...qualified.splice(i, 1));
      }
      let starter = qualified[0];
      if (!starter) {
        starter = candidates[0];
        if (!starter) {
          detail.issues.push({ kind: "poste-vide", text: `${role} : aucune ligne de scoreboard à ce poste` });
          continue;
        }
        detail.issues.push({
          kind: "sans-titulaire-qualifie",
          text: `${role} : aucun candidat ne franchit le seuil à son poste majoritaire ; ${starter.spelling} retenu par défaut (${starter.games}/${games}, ${pct(starter.share)}, poste majoritaire ${starter.majorityRole})`,
        });
      }
      // La condition de poste majoritaire vaut aussi pour le second joueur : un échange de
      // poste ponctuel ne crée pas de rotation. Fnatic 2013 a inversé top et support sur une
      // partie (sOAZ 14 top / 1 support, YellOwStaR l'inverse) ; sans ce filtre, chacun
      // occuperait le `shared` de l'autre.
      const rotation = candidates.filter((c) => !c.qualified && c !== starter && c.isMajority);
      const swaps = candidates.filter((c) => !c.qualified && c !== starter && !c.isMajority);
      const second = qualified.find((c) => c !== starter) ?? rotation[0] ?? null;

      for (const c of swaps) {
        detail.issues.push({
          kind: "echange-de-poste",
          text: `${role} : ${c.spelling} y a joué ${c.games} partie(s) sur ${games} mais son poste majoritaire est ${c.majorityRole} ; écarté du poste, conformément à la règle 1`,
        });
      }

      // Égalité stricte entre deux joueurs retenus : le départage mérite confirmation.
      if (second?.qualified && starter.qualified && second.games === starter.games) {
        const sameStage = starter.lastStage === second.lastStage;
        detail.issues.push({
          kind: forced ? "egalite-arbitree" : "egalite",
          text: `${role} : ${starter.spelling} et ${second.spelling} à ${starter.games} parties chacun. ` + (forced
            ? `Égalité tranchée à la main : ${starter.spelling} à gauche.`
            : sameStage
              ? `Les deux finissent au même tour (${starter.lastStage}) : **la règle 2 ne départage pas**. ${starter.spelling} est placé à gauche parce que sa dernière partie est postérieure, ce qui reste à arbitrer.`
              : `${starter.spelling} passe à gauche, sa dernière partie étant ${starter.lastStage} contre ${second.lastStage}.`),
        });
      }
      // Troisième joueur au-dessus du seuil : non affichable, à signaler au survol.
      for (const extra of qualified.filter((c) => c !== starter && c !== second)) {
        detail.issues.push({
          kind: "troisieme-au-dessus-du-seuil",
          text: `${role} : ${extra.spelling} franchit le seuil (${extra.games}/${games}, ${pct(extra.share)}) mais arrive derrière ${starter.spelling} et ${second?.spelling}`,
        });
      }
      // Rotation sous le seuil écartée faute de place : `shared` est déjà pris.
      for (const extra of rotation.filter((c) => c !== second)) {
        detail.issues.push({
          kind: "rotation-non-retenue",
          text: `${role} : ${extra.spelling} (${extra.games}/${games}, ${pct(extra.share)}) n'entre ni en titulaire ni en rotation, shared étant pris par ${second?.spelling}`,
        });
      }

      detail.roles[role] = { starter, second, candidates };
    }

    const key = code ?? `~${team.lpName}`;
    if (out.has(key)) {
      detail.issues.push({ kind: "collision-de-code", text: `${team.lpName} et ${out.get(key).lpName} partagent le code ${code} sur cette édition` });
    }
    out.set(key, detail);
  }
  return out;
}

// ----------------------------------------------------------------------- sorties

function sortedCodes(teamsOfYear) {
  return [...teamsOfYear.keys()]
    .filter((k) => !k.startsWith("~"))
    .sort((a, b) => {
      const ia = COLUMN_ORDER.indexOf(a);
      const ib = COLUMN_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
}

function fragmentFor(year, teamsOfYear, census) {
  const frag = {};
  for (const code of sortedCodes(teamsOfYear)) {
    const t = teamsOfYear.get(code);
    // L'annexe du plan fait foi sur le nom d'époque ; le `name` n'est écrit que s'il diffère
    // du nom de colonne, comme dans data/teams.json aujourd'hui.
    const name = PLAN_ALIASES[code]?.[year] ?? PLAN_TEAM_NAMES[code] ?? t.lpName;
    const entry = {};
    if (name !== PLAN_TEAM_NAMES[code]) entry.name = name;
    entry.lineup = {};
    const shared = {};
    const aliases = {};
    for (const role of ROLES) {
      const r = t.roles[role];
      if (!r) continue;
      entry.lineup[role] = r.starter.spelling;
      if (r.second) shared[role] = r.second.spelling;
      // Pseudo porté à l'époque, quand il diffère de la graphie retenue : la rangée l'affiche,
      // l'identité du joueur restant la graphie canonique, pour un fil de carrière continu.
      for (const c of [r.starter, r.second]) {
        if (!c) continue;
        const era = eraSpelling(census.get(c.id), year);
        if (era && era !== c.spelling) aliases[c.spelling] = era;
      }
    }
    if (Object.keys(shared).length) entry.shared = shared;
    if (Object.keys(aliases).length) entry.aliases = aliases;
    frag[code] = entry;
  }
  return {
    $comment: `Fragment Worlds ${year} produit par scripts/fetch-worlds.mjs. "name" suit l'annexe du plan et n'est présent que s'il diffère du nom de colonne. "shared" porte le second joueur, qu'il franchisse ou non le seuil de 20 %. "aliases" associe une graphie canonique au pseudo porté cette année-là. Voir detail/${year}.json et report.md.`,
    [String(year)]: frag,
  };
}

// Pseudo d'époque à afficher, uniquement s'il a été arbitré dans `PSEUDOS_EPOQUE`.
const eraSpelling = (person, year) => (person ? PSEUDOS_EPOQUE[person.id]?.[year] ?? null : null);

// Candidats à un pseudo d'époque non encore arbitrés : graphie de l'année différant de la
// graphie retenue par autre chose que la casse ou les espaces. Le rapport les liste pour que
// `PSEUDOS_EPOQUE` puisse grandir ; aucun n'est appliqué tant qu'il n'y figure pas.
function findEraCandidates(selected, census) {
  const squash = (s) => low(s).replace(/\s+/g, "");
  // Seuls les couples joueur-année réellement retenus comptent : un joueur peut avoir joué
  // une autre édition dans une équipe hors périmètre, sans rangée à afficher.
  const picked = new Set(selected.map((s) => `${s.id}|${s.year}`));
  const out = [];
  for (const id of new Set(selected.map((s) => s.id))) {
    const p = census.get(id);
    for (const [year, spellings] of p.byYear) {
      if (!picked.has(`${id}|${year}`)) continue;
      const dominant = [...spellings].sort((a, b) => b[1] - a[1])[0][0];
      if (squash(dominant) === squash(p.spelling)) continue;
      if (eraSpelling(p, year) === dominant) continue; // retenu comme pseudo d'époque
      if (COQUILLES_ECARTEES[`${p.id} ${year}`] === dominant) continue; // écarté comme coquille
      const total = [...spellings.values()].reduce((a, b) => a + b, 0);
      out.push({
        year,
        text: `**${year}** : \`${p.page}\`${p.fullName ? ` (${p.fullName})` : ""} y est écrit ${[...spellings].map(([s, n]) => `**${s}** ×${n}`).join(", ")} sur ${total} ligne(s), alors que la graphie retenue est **${p.spelling}**`,
      });
    }
  }
  return out.sort((a, b) => a.year - b.year);
}

function detailFor(year, teamsOfYear, pages) {
  const teams = {};
  for (const [key, t] of teamsOfYear) {
    const roles = {};
    for (const role of ROLES) {
      const r = t.roles[role];
      if (!r) continue;
      roles[role] = r.candidates.map((c) => ({
        spelling: c.spelling, link: c.link, fullName: c.fullName,
        games: c.games, share: Number(c.share.toFixed(3)),
        majorityRole: c.majorityRole, overThreshold: c.overThreshold, qualified: c.qualified,
        lastStage: c.lastStage,
        slot: c === r.starter ? "lineup" : c === r.second ? "shared" : null,
      }));
    }
    teams[key] = {
      code: t.code, lpName: t.lpName, inScope: Boolean(t.code),
      games: t.games, threshold: Number(t.threshold.toFixed(2)),
      pages: t.pages, roles, issues: t.issues,
    };
  }
  return { year, pages, threshold: THRESHOLD, teams };
}

// ------------------------------------------------------------------ comparaisons

// Collisions de pseudo : deux personnes distinctes sous la même graphie. Une personne est
// identifiée par son `Link` en minuscules, le discriminant entre parenthèses compris.
function findCollisions(selected, census) {
  const byPseudo = new Map();
  for (const s of selected) {
    const k = low(s.spelling);
    if (!byPseudo.has(k)) byPseudo.set(k, new Map());
    const ids = byPseudo.get(k);
    if (!ids.has(s.id)) ids.set(s.id, []);
    ids.get(s.id).push(`${s.year} ${s.code} ${s.role}`);
  }
  return [...byPseudo]
    .filter(([, ids]) => ids.size > 1)
    .map(([pseudo, ids]) => ({
      pseudo,
      people: [...ids].map(([id, where]) => {
        const p = census.get(id);
        return { link: p.page, fullName: p.fullName, where };
      }),
    }));
}

// Liste de veille : pseudos portés par plusieurs personnes parmi **tous** les joueurs de ces
// éditions, retenus ou non. Aucun arbitrage n'est nécessaire tant qu'un seul au plus est
// affiché, mais un changement de titulaire ferait basculer le cas dans la section précédente.
function findNearCollisions(selected, census) {
  const chosenIds = new Set(selected.map((s) => s.id));
  const byPseudo = new Map();
  for (const p of census.values()) {
    const k = low(p.spelling);
    if (!byPseudo.has(k)) byPseudo.set(k, []);
    byPseudo.get(k).push(p);
  }
  return [...byPseudo]
    .filter(([, people]) => people.length > 1)
    .map(([pseudo, people]) => ({
      pseudo,
      people: people.map((p) => ({
        link: p.page, fullName: p.fullName,
        years: `${p.firstYear}${p.lastYear !== p.firstYear ? `–${p.lastYear}` : ""}`,
        chosen: chosenIds.has(p.id),
      })),
    }));
}

// Graphies d'un même joueur : divergences de casse au sein de Leaguepedia, changements de
// pseudo, puis écarts face à /data.
function findCaseIssues(selected, census, teamsData, playersData) {
  const out = [];
  const ids = new Set(selected.map((s) => s.id));

  const stored = new Map(); // minuscules → graphie telle qu'écrite dans /data → emplacements
  const note = (name, where) => {
    const k = low(name);
    if (!stored.has(k)) stored.set(k, new Map());
    const m = stored.get(k);
    if (!m.has(name)) m.set(name, []);
    m.get(name).push(where);
  };
  for (const team of teamsData.teams) {
    for (const [year, entry] of Object.entries(team.worlds)) {
      for (const [role, name] of Object.entries(entry.lineup ?? {})) note(name, `teams.json ${year} ${team.code} ${role}`);
      for (const [role, name] of Object.entries(entry.shared ?? {})) note(name, `teams.json ${year} ${team.code} ${role}*`);
    }
  }
  for (const name of Object.keys(playersData.nationality)) note(name, "players.json");
  for (const id of ids) {
    const p = census.get(id);
    const variants = [...p.spellings.keys()];
    const shown = variants.map((v) => `**${v}** (${p.spellings.get(v)} lignes)`).join(", ");
    const who = `\`${p.page}\`${p.fullName ? `, ${p.fullName}` : ""}, ${p.firstYear}${p.lastYear !== p.firstYear ? `–${p.lastYear}` : ""}`;
    if (p.arbitrated) {
      out.push({ kind: "acte", text: `**${p.spelling}** retenu (${who})${p.proposed !== p.spelling ? ` ; la fréquence seule donnerait **${p.proposed}**` : ""}` });
      continue;
    }
    // Plusieurs pseudos aux lettres différentes pour une même personne : un renommage.
    if (new Set(variants.map(low)).size > 1) {
      out.push({ kind: "renommage", text: `${shown} — une même personne (${who}) ; graphie retenue : **${p.spelling}**` });
    } else if (variants.length > 1) {
      // Ce qui tranche : /data si le joueur y figure déjà, sinon le titre de page canonique.
      const inData = stored.get(low(p.spelling))?.has(p.spelling);
      const pageName = splitLink(p.page).pseudo;
      const basis = inData
        ? "déjà la graphie de `/data`"
        : pageName === p.spelling
          ? "conforme au titre de page canonique"
          : `**à vérifier** : le titre de page dit \`${pageName}\``;
      out.push({ kind: "leaguepedia", text: `Leaguepedia emploie ${shown} ; graphie retenue : **${p.spelling}** — ${basis}` });
    }
    if (p.lpId && low(p.lpId) !== low(p.spelling)) {
      out.push({ kind: "reference", text: `graphie retenue **${p.spelling}**, pseudo actuel de Leaguepedia **${p.lpId}** (${who})` });
    }
    if (!p.known) {
      out.push({ kind: "inconnu", text: `\`${p.page}\` : aucune fiche dans la table \`Players\` ; nom complet et pays indisponibles, graphie **${p.spelling}** déduite des seuls scoreboards` });
    }
  }

  const chosen = new Map([...ids].map((id) => [low(census.get(id).spelling), census.get(id).spelling]));
  for (const [k, variants] of stored) {
    if (!chosen.has(k)) continue;
    for (const [name, where] of variants) {
      if (name === chosen.get(k)) continue;
      const shown = where.length > 3 ? `${where.slice(0, 3).join(", ")}, +${where.length - 3}` : where.join(", ");
      out.push({ kind: "data", text: `/data écrit **${name}** (${shown}), Leaguepedia **${chosen.get(k)}**` });
    }
  }
  return out;
}

// Écarts entre les lineups calculées et data/teams.json, sur les années déjà saisies.
function findDiffs(computed, teamsData) {
  const stored = new Map(); // "2024:T1" → { team, entry }
  for (const team of teamsData.teams) {
    for (const [year, entry] of Object.entries(team.worlds)) stored.set(`${year}:${team.code}`, { team, entry });
  }
  const diffs = [];

  for (const [year, teamsOfYear] of computed) {
    if (!teamsData.years.includes(year)) continue; // 2013–2016 : rien à comparer
    for (const t of teamsOfYear.values()) {
      if (!t.code) continue;
      const hit = stored.get(`${year}:${t.code}`);
      if (!hit) {
        diffs.push({
          year, code: t.code, kind: "rangee-absente",
          text: `${t.lpName} a joué ${t.games} parties aux Worlds ${year}, sans rangée ${t.code} ${year} dans teams.json`,
        });
        continue;
      }
      const entry = hit.entry;
      if (entry.name && entry.name !== t.lpName) {
        diffs.push({ year, code: t.code, kind: "nom", text: `teams.json « ${entry.name} », Leaguepedia « ${t.lpName} »` });
      }
      for (const role of ROLES) {
        const r = t.roles[role];
        if (!r) continue;
        const was = entry.lineup?.[role] ?? null;
        const wasShared = entry.shared?.[role] ?? null;
        const now = r.starter.spelling;
        const nowShared = r.second?.spelling ?? null;
        if (low(was) !== low(now)) {
          diffs.push({
            year, code: t.code, kind: "titulaire",
            text: `${role} : teams.json ${was ?? "—"}, calculé **${now}** (${r.starter.games}/${t.games}, ${pct(r.starter.share)})`,
          });
        }
        if (low(wasShared) !== low(nowShared)) {
          const how = r.second
            ? ` (${r.second.games}/${t.games}, ${pct(r.second.share)}, ${r.second.qualified ? "au-dessus du seuil → demi-case" : "sous le seuil → marque *"})`
            : "";
          diffs.push({
            year, code: t.code, kind: "rotation",
            text: `${role}* : teams.json ${wasShared ?? "—"}, calculé ${nowShared ?? "—"}${how}`,
          });
        } else if (r.second?.qualified) {
          diffs.push({
            year, code: t.code, kind: "passage-en-demi-case",
            text: `${role}* : ${r.second.spelling} (${r.second.games}/${t.games}, ${pct(r.second.share)}) franchit le seuil ; la marque * devient une demi-case`,
          });
        }
      }
    }
  }

  // Rangées de teams.json sans aucune partie côté Leaguepedia.
  for (const [key, { entry }] of stored) {
    const [y, code] = key.split(":");
    const teamsOfYear = computed.get(Number(y));
    if (!teamsOfYear || teamsOfYear.has(code)) continue;
    diffs.push({
      year: Number(y), code, kind: "rangee-sans-partie",
      text: `teams.json donne une rangée ${code} ${y}${entry.name ? ` (« ${entry.name} »)` : ""} mais aucune équipe de cette édition ne porte un nom relié à ce code`,
    });
  }
  return diffs;
}

// ------------------------------------------------------------------------ rapport

function renderReport({ years, computed, pageCheck, census, collisions, nearCollisions, eraCandidates, caseIssues, diffs, notes, gameCounts }) {
  const L = [];
  const h = (n, t) => L.push("", `${"#".repeat(n)} ${t}`, "");
  const list = (items, empty) => L.push(...(items.length ? items.map((i) => `- ${i}`) : [`_${empty}_`]));

  const issuesOf = (kind) => {
    const out = [];
    for (const [year, teamsOfYear] of computed) {
      for (const t of teamsOfYear.values()) {
        if (!t.code) continue; // les équipes hors périmètre ne demandent aucun arbitrage
        for (const i of t.issues.filter((i) => i.kind === kind)) out.push(`**${year} ${t.code}** — ${i.text}`);
      }
    }
    return out;
  };

  const outOfScope = new Set();
  for (const teamsOfYear of computed.values()) for (const t of teamsOfYear.values()) if (!t.code) outOfScope.add(t.lpName);

  const aliasRows = [];
  for (const [year, teamsOfYear] of computed) {
    for (const t of teamsOfYear.values()) {
      const planned = t.code && PLAN_ALIASES[t.code]?.[year];
      if (planned && planned !== t.lpName) aliasRows.push(`**${year} ${t.code}** — plan « ${planned} », Leaguepedia « ${t.lpName} »`);
    }
  }

  L.push(`# Rapport de collecte — Worlds ${years[0]}–${years.at(-1)}`);
  L.push("");
  L.push(`Produit par \`scripts/fetch-worlds.mjs\` le ${new Date().toISOString().slice(0, 10)}, depuis la table \`ScoreboardPlayers\` de Leaguepedia (\`Special:CargoExport\`).`);
  L.push("");
  L.push(`Règles appliquées : seuil de ${pct(THRESHOLD)} des parties de l'équipe, poste majoritaire, deux joueurs au maximum par poste — voir \`docs/PLAN-2013-2016.md\`.`);

  h(2, "Résumé");
  const sections = [
    ["1", "Table année → OverviewPage", pageCheck.empty.length + pageCheck.excluded.length + pageCheck.uncovered.length],
    ["2", "Égalités strictes", issuesOf("egalite").length],
    ["3", "Troisièmes joueurs au-dessus du seuil", issuesOf("troisieme-au-dessus-du-seuil").length],
    ["4", "Postes sans titulaire qualifié ou majorité indécidable", issuesOf("sans-titulaire-qualifie").length + issuesOf("poste-vide").length + issuesOf("majorite-ambigue").length],
    ["5", "Collisions de pseudo", collisions.length, `${nearCollisions.length} en veille`],
    ["6", "Divergences de casse", caseIssues.filter((c) => c.kind === "leaguepedia" || c.kind === "data").length, `${eraCandidates.length} pseudo(s) d'époque à qualifier`],
    ["7", "Écarts avec les lineups saisies", diffs.length],
    ["8", "Noms d'équipe face à l'annexe du plan", aliasRows.length],
    ["9", "Rotations non retenues et échanges de poste", issuesOf("rotation-non-retenue").length + issuesOf("echange-de-poste").length],
    ["10", "Équipes hors périmètre", outOfScope.size],
  ];
  L.push("| § | Sujet | Cas |", "|---|---|---|");
  for (const [n, name, count, note] of sections) L.push(`| ${n} | ${name} | ${count}${note ? ` (${note})` : ""} |`);

  h(2, "1. Table année → OverviewPage");
  L.push("Table confrontée, à chaque exécution, à la table `Tournaments` et aux pages qui portent réellement des lignes de scoreboard. Seule la plage 2013–2016 était vérifiée au départ ; les dix éditions suivantes se répartissent bien sur deux sous-pages chacune, et leur page parente ne porte aucune partie — aucun double comptage.");
  L.push("");
  L.push("| Année | Pages retenues | Parties | Lignes |", "|---|---|---|---|");
  for (const year of years) {
    const pages = pageCheck.covered.get(year) ?? [];
    L.push(`| ${year} | ${pages.map((p) => `\`${p.page}\``).join("<br>") || "**aucune**"} | ${gameCounts.get(year) ?? 0} | ${pages.reduce((n, p) => n + p.rows, 0)} |`);
  }
  if (pageCheck.empty.length) {
    L.push("", `**Éditions sans aucune partie : ${pageCheck.empty.join(", ")}. La table \`PAGES\` est à corriger.**`);
  }
  L.push("", "**Pages de ligue « World Championship » écartées volontairement** — dans l'horizon 2013–2026, hors préfixe retenu. À confirmer : leurs parties ne doivent pas compter dans une lineup des Worlds.", "");
  list(
    pageCheck.uncovered.map((u) => `\`${u.page}\` (${u.start})${u.hasGames ? "" : " — aucune partie, exclusion sans effet"}` +
      (pageCheck.excluded.find((e) => e.page === u.page) ? ` — ${pageCheck.excluded.find((e) => e.page === u.page).rows} lignes écartées` : "")),
    "aucune.",
  );
  if (pageCheck.outside.length) {
    L.push("", "**Pages ignorées** — autre ligue ou hors horizon. Elles portent « World Championship » ou « Worlds » dans leur titre : ce sont les pièges du filtre par nom.", "");
    list(pageCheck.outside.map((e) => `\`${e.page}\` — ligue ${e.league}, ${e.rows} lignes`), "aucune.");
  }

  h(2, "2. Égalités strictes à départager");
  L.push("Deux joueurs retenus à égalité de parties sur un poste. Le script applique la règle 2 — le tour le plus avancé passe à gauche — mais le choix mérite confirmation.");
  L.push("");
  list(issuesOf("egalite"), "aucune égalité.");
  L.push("", "**Déjà tranchées** — figées dans `EGALITES_ARBITREES`.", "");
  list(issuesOf("egalite-arbitree"), "aucune.");

  h(2, "3. Troisièmes joueurs au-dessus du seuil");
  L.push("Trois joueurs franchissent le seuil sur le même poste : deux seulement sont affichables, le troisième passe au survol.");
  L.push("");
  list(issuesOf("troisieme-au-dessus-du-seuil"), "aucun cas.");

  h(2, "4. Postes sans titulaire qualifié et majorités indécidables");
  L.push("Le titulaire est alors retenu par défaut, sur le seul nombre de parties : à vérifier.");
  L.push("");
  list([...issuesOf("sans-titulaire-qualifie"), ...issuesOf("poste-vide"), ...issuesOf("majorite-ambigue")], "aucun cas.");

  h(2, "5. Collisions de pseudo (homonymes)");
  L.push("Deux personnes distinctes retenues sous la même graphie : sans discriminant, elles fusionneraient en une seule carrière.");
  L.push("");
  if (!collisions.length) L.push("_aucune collision parmi les joueurs retenus._");
  for (const c of collisions) {
    L.push(`- **${c.pseudo}** :`);
    for (const p of c.people) L.push(`  - \`${p.link}\`${p.fullName ? ` — ${p.fullName}` : ""} : ${p.where.join(", ")}`);
  }
  L.push("", `**Liste de veille** — pseudos portés par plusieurs personnes parmi les ${census.size} joueurs de ces éditions, titulaires ou non. Tant qu'une seule est affichée, aucun discriminant n'est nécessaire ; un changement de titulaire ferait basculer le cas ci-dessus.`, "");
  if (!nearCollisions.length) L.push("_aucun._");
  for (const c of nearCollisions) {
    L.push(`- **${c.pseudo}** : ${c.people.map((p) => `\`${p.link}\`${p.fullName ? ` (${p.fullName})` : ""} ${p.years}${p.chosen ? " **retenu**" : ""}`).join(" · ")}`);
  }

  h(2, "6. Divergences de casse");
  L.push("Règle 4 : une personne, une graphie, dans tout le jeu de données. La graphie proposée est la plus employée sur l'ensemble des 14 éditions ; à égalité, le titre de page Leaguepedia actuel.");
  L.push("", "**Au sein de Leaguepedia**", "Chaque ligne indique ce qui tranche : la graphie de `/data` quand le joueur y figure, sinon le titre de page canonique. Seules les lignes marquées « à vérifier » demandent un arbitrage.", "");
  list(caseIssues.filter((c) => c.kind === "leaguepedia").map((c) => c.text), "aucune.");
  L.push("", "**Entre `/data` et Leaguepedia**", "");
  list(caseIssues.filter((c) => c.kind === "data").map((c) => c.text), "aucune.");
  L.push("", "**Changements de pseudo** — pour information, plus rien à trancher : la rangée affiche le pseudo de l'époque via le champ `aliases` du fragment, tandis que l'identité du joueur reste la graphie canonique, ce qui garde le fil de carrière continu.", "");
  list(caseIssues.filter((c) => c.kind === "renommage").map((c) => c.text), "aucun.");
  L.push("", "**Pseudos d'époque candidats** — graphie de l'année différant de la graphie retenue par autre chose que la casse. À reprendre dans `PSEUDOS_EPOQUE` si c'est un vrai pseudo de l'époque, à laisser si c'est une coquille Leaguepedia. Tant qu'un cas n'y figure pas, la rangée affiche la graphie retenue.", "");
  list(eraCandidates.map((c) => c.text), "aucun.");
  L.push("", "**Graphies déjà arbitrées** — figées dans `GRAPHIES_ARBITREES` ; le script ne les signale plus comme divergences.", "");
  list(caseIssues.filter((c) => c.kind === "acte").map((c) => c.text), "aucune.");
  L.push("", "**Pseudo actuel différent** — `Players.ID` porte le pseudo que le joueur utilise aujourd'hui. Pour information : il reflète les renommages postérieurs au tournoi, et il est parfois altéré (`Balls` y devient `BalIs`, avec un I majuscule).", "");
  list(caseIssues.filter((c) => c.kind === "reference").map((c) => c.text), "aucun.");
  L.push("", "**Joueurs sans fiche Leaguepedia** — la graphie et le nom complet reposent alors sur les seuls scoreboards.", "");
  list(caseIssues.filter((c) => c.kind === "inconnu").map((c) => c.text), "aucun.");

  h(2, "7. Écarts avec les lineups saisies");
  L.push("Comparaison avec ce que `data/teams.json` contient déjà, toutes éditions confondues.");
  const kinds = [
    ["rangee-absente", "Rangées manquantes dans teams.json"],
    ["rangee-sans-partie", "Rangées de teams.json sans partie côté Leaguepedia"],
    ["titulaire", "Titulaires différents"],
    ["rotation", "Rotations différentes"],
    ["passage-en-demi-case", "Rotations identiques passant en demi-case"],
    ["nom", "Noms d'équipe — l'annexe du plan fait foi, pour trace"],
  ];
  kinds.forEach(([kind, title], i) => {
    const items = diffs.filter((d) => d.kind === kind);
    h(3, `7.${i + 1} ${title} (${items.length})`);
    list(items.map((d) => `**${d.year} ${d.code}** — ${d.text}`), "aucun écart.");
  });

  h(2, "8. Noms d'équipe face à l'annexe du plan");
  L.push("L'annexe du plan fait foi (arbitrage du 11/11/2026) : Leaguepedia normalise ses noms d'équipe. Liste tenue pour trace, rien à trancher — c'est l'alias du plan qui est écrit dans les fragments.");
  L.push("");
  list(aliasRows, "aucune divergence.");

  h(2, "9. Rotations non retenues et échanges de poste");
  L.push("Un poste n'offre qu'un champ `shared` : ces joueurs, sous le seuil, n'y tiennent pas. Les échanges de poste ponctuels sont écartés par la règle 1. Pour information.");
  L.push("");
  list([...issuesOf("rotation-non-retenue"), ...issuesOf("echange-de-poste")], "aucun cas.");

  h(2, "10. Équipes hors périmètre rencontrées");
  L.push("Équipes ayant joué ces éditions sans colonne prévue par le plan, avec leur nombre de parties. Listées pour qu'aucune ne soit écartée par accident.");
  L.push("");
  for (const [year, teamsOfYear] of computed) {
    const out = [...teamsOfYear.values()].filter((t) => !t.code).sort((a, b) => b.games - a.games).map((t) => `${t.lpName} (${t.games})`);
    if (out.length) L.push(`- **${year}** : ${out.join(", ")}`);
  }

  if (notes.length) {
    h(2, "Notes de collecte");
    list(notes, "aucune.");
  }

  return `${L.join("\n")}\n`;
}

// --------------------------------------------------------------------------- main

async function main() {
  const argv = process.argv.slice(2);
  const refresh = argv.includes("--refresh");
  const outIdx = argv.indexOf("--out");
  const outDir = resolve(ROOT, outIdx >= 0 ? argv[outIdx + 1] : ".fetch-worlds");
  const asked = argv.filter((a) => /^\d{4}$/.test(a)).map(Number);
  const years = (asked.length ? asked : ALL_YEARS).sort((a, b) => a - b);

  const missingPages = years.filter((y) => !PAGES[y]);
  if (missingPages.length) {
    console.error(`Année(s) sans OverviewPage connue : ${missingPages.join(", ")}. Compléter la table PAGES.`);
    process.exit(1);
  }

  for (const sub of ["raw", "fragments", "detail"]) await mkdir(join(outDir, sub), { recursive: true });
  const [teamsData, playersData] = await Promise.all(
    ["teams", "players"].map((n) => readFile(join(ROOT, "data", `${n}.json`), "utf8").then(JSON.parse)),
  );

  console.log("Contrôle de la table année → OverviewPage…");
  const pageCheck = await checkPages(years);
  for (const y of pageCheck.empty) console.error(`  ERREUR · ${y} : aucune page porteuse de parties pour « ${PAGES[y]} »`);
  for (const u of pageCheck.uncovered) console.log(`  écartée · ${u.page}${u.hasGames ? "" : " (aucune partie)"}`);

  const notes = [];
  const gameCounts = new Map();

  // Première passe : collecte seule. La règle 4 se décide sur l'ensemble des éditions,
  // il faut donc les avoir toutes avant de fixer une graphie.
  const rowsByYear = new Map();
  for (const year of years) {
    const { rows, cached } = await fetchYear(year, { refresh, outDir });
    rowsByYear.set(year, rows);
    gameCounts.set(year, new Set(rows.map((r) => r.gid)).size);
    console.log(`${year} · ${rows.length} lignes, ${gameCounts.get(year)} parties${cached ? " (cache)" : ""}`);
    if (!cached) await sleep(THROTTLE_MS);
  }
  const links = [...new Set([...rowsByYear.values()].flat().filter((r) => ROLE_OF[r.role] && r.link).map((r) => r.link))];
  console.log(`Résolution de ${links.length} titres de page joueur (redirections, pseudo de référence, nom complet, pays)…`);
  const resolution = await resolvePeople(links, { refresh, outDir });
  const census = buildCensus(rowsByYear, resolution);
  const unknown = [...census.values()].filter((p) => !p.known).length;
  console.log(`${census.size} personnes recensées pour ${links.length} titres de page${unknown ? `, dont ${unknown} sans fiche Players` : ""}.`);
  await writeFile(join(outDir, "people.json"), `${JSON.stringify({
    $comment: "Recensement des personnes rencontrées sur les 14 éditions. `page` est la page canonique Leaguepedia (redirections résolues), `spelling` la graphie proposée, `links` les titres rencontrés dans les scoreboards, `spellings` les graphies observées. `country` servira au lot 2 pour data/players.json.",
    people: Object.fromEntries([...census].map(([id, p]) => [id, {
      page: p.page, spelling: p.spelling, proposed: p.proposed, arbitrated: p.arbitrated, lpId: p.lpId,
      fullName: p.fullName, country: p.country, known: p.known,
      years: [p.firstYear, p.lastYear], links: Object.fromEntries(p.links), spellings: Object.fromEntries(p.spellings),
      spellingsByYear: Object.fromEntries([...p.byYear].map(([y, m]) => [y, Object.fromEntries(m)])),
    }])),
  }, null, 1)}\n`);

  // Seconde passe : application des règles, fragments et détail.
  const computed = new Map();
  const selected = [];
  for (const year of years) {
    const teamsOfYear = buildYear(year, rowsByYear.get(year), census, resolution, notes);
    computed.set(year, teamsOfYear);

    for (const t of teamsOfYear.values()) {
      if (!t.code) continue;
      for (const role of ROLES) {
        const r = t.roles[role];
        if (!r) continue;
        if (r.starter) selected.push({ year, code: t.code, role, id: r.starter.id, spelling: r.starter.spelling });
        if (r.second) selected.push({ year, code: t.code, role: `${role}*`, id: r.second.id, spelling: r.second.spelling });
      }
    }

    await writeFile(join(outDir, "fragments", `${year}.json`), `${JSON.stringify(fragmentFor(year, teamsOfYear, census), null, 2)}\n`);
    const pages = (pageCheck.covered.get(year) ?? []).map((p) => p.page);
    await writeFile(join(outDir, "detail", `${year}.json`), `${JSON.stringify(detailFor(year, teamsOfYear, pages), null, 2)}\n`);

    const inScope = [...teamsOfYear.values()].filter((t) => t.code);
    const issues = inScope.reduce((n, t) => n + t.issues.length, 0);
    console.log(`${year} · ${teamsOfYear.size} équipes dont ${inScope.length} suivies, ${issues} cas`);
  }

  const collisions = findCollisions(selected, census);
  const nearCollisions = findNearCollisions(selected, census);
  const eraCandidates = findEraCandidates(selected, census);
  const caseIssues = findCaseIssues(selected, census, teamsData, playersData);
  const diffs = findDiffs(computed, teamsData);
  const reportPath = join(outDir, "report.md");
  await writeFile(reportPath, renderReport({ years, computed, pageCheck, census, collisions, nearCollisions, eraCandidates, caseIssues, diffs, notes, gameCounts }));

  console.log("");
  console.log(`Fragments : ${join(outDir, "fragments")}`);
  console.log(`Détail    : ${join(outDir, "detail")}`);
  console.log(`Rapport   : ${reportPath}`);
  console.log(`${collisions.length} collision(s) de pseudo, ${caseIssues.length} divergence(s) de casse, ${diffs.length} écart(s) sur les lineups saisies.`);
  if (pageCheck.empty.length) process.exit(1);
}

main().catch((e) => {
  console.error(`Échec : ${e.message}`);
  process.exit(1);
});
