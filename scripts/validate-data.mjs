#!/usr/bin/env node
// Vérifie la cohérence des fichiers de /data avant un commit ou dans la CI.
// Usage : node scripts/validate-data.mjs
import { readFile } from "node:fs/promises";

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
const [teamsData, resultsData, playersData, sourcesData] = await Promise.all(
  ["teams", "results", "players", "sources"].map(read),
);

const errors = [];
const warnings = [];
const ROLES = ["top", "jungle", "mid", "bot", "support"];
// Au-delà de cette coupure, deux apparitions d'un même pseudo sont probablement
// deux personnes différentes : une carrière ne reprend pas après cinq Worlds sans trace.
const HOMONYM_GAP = 4;

// Carrières à trou déjà vérifiées : une seule personne, confirmée par sa page Leaguepedia
// et son nom civil. Sans cette liste, le contrôle crierait au loup à chaque exécution et
// finirait par être ignoré. N'y ajouter un pseudo qu'après vérification nominative.
const HOMONYMES_VERIFIES = new Map([
  ["cuzz", "Moon Woo-chan, page Cuzz — Longzhu 2017, KT 2023 et 2025"],
  ["theshy", "Kang Seung-lok, page TheShy — IG 2018-2019, Weibo 2023 hors périmètre, IG 2025-2026"],
  ["rookie", "Song Eui-jin, page Rookie — IG 2015, 2018-2019, 2025-2026"],
]);
const years = new Set(teamsData.years);
const regions = new Set(teamsData.regions);
const low = (s) => String(s ?? "").toLowerCase();

// --- équipes et lineups
const teamCodes = new Set();
const present = new Map(); // "2024:T1" -> true
const seenThisYear = new Map(); // "2024:faker" -> "T1"
const allPlayers = new Set(); // titulaires et rotations : tous sont affichés sur la carte
const appearances = new Map(); // "faker" -> Set d'années

for (const team of teamsData.teams) {
  const where = `équipe ${team.code}`;
  if (!/^[A-Z0-9]{2,5}$/.test(team.code)) errors.push(`${where} : code invalide`);
  if (teamCodes.has(team.code)) errors.push(`${where} : code en double`);
  teamCodes.add(team.code);
  if (!regions.has(team.region)) errors.push(`${where} : région inconnue « ${team.region} »`);

  // --- fenêtre d'activité, quand elle est déclarée
  let active = null;
  if (team.active !== undefined) {
    const ok = Array.isArray(team.active)
      && team.active.length >= 1 && team.active.length <= 2
      && team.active.every((y) => Number.isInteger(y));
    if (!ok) errors.push(`${where} : "active" doit être [début] ou [début, fin], en années entières`);
    else {
      const [from, to = Infinity] = team.active;
      if (from > to) errors.push(`${where} : fenêtre d'activité inversée (${from} après ${to})`);
      else active = { from, to };
    }
  }

  for (const [year, entry] of Object.entries(team.worlds)) {
    const at = `${team.code} ${year}`;
    const y = Number(year);
    if (!years.has(y)) errors.push(`${at} : année hors de la liste "years"`);
    present.set(`${year}:${team.code}`, true);
    if (active && (y < active.from || y > active.to)) {
      errors.push(`${at} : lineup hors de la fenêtre d'activité [${team.active.join(", ")}]`);
    }

    const keys = Object.keys(entry.lineup || {});
    if (keys.length !== 5 || !ROLES.every((r) => keys.includes(r))) {
      errors.push(`${at} : le lineup doit contenir exactement ${ROLES.join(", ")}`);
      continue;
    }

    // Un joueur affiché = un titulaire ou une rotation. Les deux comptent partout : ils
    // occupent chacun une demi-case ciblable, donc une erreur sur l'un se voit autant.
    const shown = []; // [nom, rôle]
    for (const role of ROLES) {
      const name = entry.lineup[role];
      if (typeof name !== "string" || !name.trim()) { errors.push(`${at} : ${role} vide`); continue; }
      shown.push([name, role]);
    }
    for (const [role, alt] of Object.entries(entry.shared || {})) {
      if (!ROLES.includes(role)) { errors.push(`${at} : rôle partagé inconnu « ${role} »`); continue; }
      if (typeof alt !== "string" || !alt.trim()) { errors.push(`${at} : rotation ${role} vide`); continue; }
      if (alt === entry.lineup[role]) errors.push(`${at} : ${alt} est à la fois titulaire et rotation`);
      shown.push([alt, role]);
    }

    const inRow = new Map(); // minuscules -> rôle déjà occupé dans cette rangée
    for (const [name, role] of shown) {
      const id = low(name);
      if (inRow.has(id)) {
        errors.push(`${at} : ${name} occupe deux postes de la même rangée (${inRow.get(id)} et ${role})`);
      } else inRow.set(id, role);

      const key = `${year}:${id}`;
      const other = seenThisYear.get(key);
      if (other && other !== team.code) errors.push(`${at} : ${name} joue déjà pour ${other} la même année`);
      seenThisYear.set(key, team.code);

      allPlayers.add(name);
      if (!appearances.has(id)) appearances.set(id, new Set());
      appearances.get(id).add(y);
    }

    // --- postes affichés en deux demi-cases : le second joueur franchit le seuil de 20 %
    const split = entry.split ?? [];
    if (!Array.isArray(split)) errors.push(`${at} : "split" doit être une liste de rôles`);
    else {
      const vus = new Set();
      for (const role of split) {
        if (!ROLES.includes(role)) { errors.push(`${at} : rôle partagé inconnu dans "split" « ${role} »`); continue; }
        if (vus.has(role)) errors.push(`${at} : ${role} apparaît deux fois dans "split"`);
        vus.add(role);
        // Une demi-case suppose deux joueurs : sans `shared`, il n'y a rien à partager.
        if (!entry.shared?.[role]) errors.push(`${at} : ${role} est dans "split" mais n'a pas de rotation dans "shared"`);
      }
    }

    // --- pseudo porté à cette édition, quand il diffère de la graphie canonique
    for (const [canonical, era] of Object.entries(entry.aliases || {})) {
      if (!inRow.has(low(canonical))) {
        errors.push(`${at} : alias déclaré pour « ${canonical} », qui ne figure pas dans cette rangée`);
        continue;
      }
      if (typeof era !== "string" || !era.trim()) { errors.push(`${at} : alias vide pour ${canonical}`); continue; }
      if (low(era) === low(canonical)) errors.push(`${at} : alias « ${era} » identique à ${canonical}, inutile`);
    }

    for (const role of entry.unverified || []) {
      if (!ROLES.includes(role)) errors.push(`${at} : rôle à vérifier inconnu « ${role} »`);
      else warnings.push(`${at} : ${role} encore à vérifier`);
    }
  }
}

// Une fenêtre déclarée sur une partie seulement des équipes est le signe d'une migration
// inachevée : le validateur réclame alors les suivantes.
const withActive = teamsData.teams.filter((t) => t.active !== undefined);
if (withActive.length && withActive.length !== teamsData.teams.length) {
  for (const t of teamsData.teams) {
    if (t.active === undefined) warnings.push(`équipe ${t.code} : pas de fenêtre "active", alors que ${withActive.length} équipe(s) en ont une`);
  }
}

// --- même joueur, casse différente
const byLower = new Map();
for (const name of allPlayers) {
  const k = low(name);
  if (byLower.has(k) && byLower.get(k) !== name) errors.push(`joueur écrit de deux façons : ${byLower.get(k)} / ${name}`);
  byLower.set(k, name);
}

// --- un alias ne doit pas usurper le pseudo d'un autre joueur
for (const team of teamsData.teams) {
  for (const [year, entry] of Object.entries(team.worlds)) {
    for (const [canonical, era] of Object.entries(entry.aliases || {})) {
      const clash = byLower.get(low(era));
      if (clash && low(clash) !== low(canonical)) {
        errors.push(`${team.code} ${year} : l'alias « ${era} » de ${canonical} est déjà le pseudo de ${clash}`);
      }
    }
  }
}

// --- homonymes probables : une carrière interrompue trop longtemps
const editions = [...teamsData.years].sort((a, b) => a - b);
for (const [id, seen] of appearances) {
  if (HOMONYMES_VERIFIES.has(id)) continue;
  const idx = [...seen].map((y) => editions.indexOf(y)).filter((i) => i >= 0).sort((a, b) => a - b);
  for (let i = 1; i < idx.length; i++) {
    const missed = idx[i] - idx[i - 1] - 1;
    if (missed > HOMONYM_GAP) {
      warnings.push(`${byLower.get(id)} : ${missed} éditions sans trace entre ${editions[idx[i - 1]]} et ${editions[idx[i]]} — vérifier qu'il s'agit bien de la même personne, puis l'inscrire dans HOMONYMES_VERIFIES`);
    }
  }
}
// Une entrée devenue inutile est une fausse sécurité : autant la retirer.
for (const id of HOMONYMES_VERIFIES.keys()) {
  if (!appearances.has(id)) warnings.push(`HOMONYMES_VERIFIES contient « ${id} », absent des lineups : entrée à retirer`);
}

// --- résultats
for (const [year, entries] of Object.entries(resultsData.results)) {
  for (const [code, value] of Object.entries(entries)) {
    if (!resultsData.labels[value]) errors.push(`résultat ${code} ${year} : valeur inconnue « ${value} »`);
    if (!present.has(`${year}:${code}`)) errors.push(`résultat ${code} ${year} : l'équipe n'a pas de lineup cette année-là`);
  }
}
for (const key of present.keys()) {
  const [year, code] = key.split(":");
  if (!resultsData.results[year]?.[code]) warnings.push(`${code} ${year} : pas de résultat renseigné`);
}

// --- nationalités
for (const region of teamsData.regions) {
  // `isImport` lit HOME[team.region] sans garde : une région absente ferait planter la carte.
  const home = playersData.homeCountries?.[region];
  if (!Array.isArray(home) || !home.length) errors.push(`homeCountries : rien pour la région « ${region} », la carte planterait`);
  else for (const code of home) {
    if (!/^[A-Z]{2}$/.test(code)) errors.push(`homeCountries.${region} : « ${code} » n'est pas un code ISO à 2 lettres`);
  }
}
for (const region of Object.keys(playersData.homeCountries ?? {})) {
  if (!regions.has(region)) warnings.push(`homeCountries.${region} : région absente de "regions"`);
}
for (const [name, code] of Object.entries(playersData.nationality)) {
  if (!/^[A-Z]{2}$/.test(code)) errors.push(`nationalité de ${name} : « ${code} » n'est pas un code ISO à 2 lettres`);
  if (!byLower.has(low(name))) warnings.push(`nationalité de ${name} : joueur absent des lineups`);
}
const noNat = [...allPlayers].filter((n) => !Object.keys(playersData.nationality).some((k) => low(k) === low(n)));

// --- noms de pays : le panneau de détail écrit le pays en toute lettre, un code sans entrée
// y retomberait au code brut sans que rien ne le signale.
const countryNames = playersData.countryNames ?? {};
const codesUtilises = new Set(Object.values(playersData.nationality));
for (const code of codesUtilises) {
  if (!countryNames[code]) errors.push(`countryNames : « ${code} » n'a pas de nom français, le panneau de détail afficherait le code brut`);
}
for (const [code, nom] of Object.entries(countryNames)) {
  if (!/^[A-Z]{2}$/.test(code)) errors.push(`countryNames : « ${code} » n'est pas un code ISO à 2 lettres`);
  else if (typeof nom !== "string" || !nom.trim()) errors.push(`countryNames.${code} : nom vide`);
  else if (!codesUtilises.has(code)) warnings.push(`countryNames.${code} : aucun joueur de ce pays`);
}

// --- sources
for (const year of teamsData.years) {
  if (!sourcesData.byYear?.[year]?.length) warnings.push(`${year} : aucune source listée dans data/sources.json`);
}

const lineups = [...present.keys()].length;
console.log(`${teamsData.teams.length} équipes, ${lineups} lineups, ${allPlayers.size} joueurs affichés, ${noNat.length} sans nationalité vérifiée.`);
for (const w of warnings) console.log(`  avertissement · ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ERREUR · ${e}`);
  console.error(`${errors.length} erreur(s).`);
  process.exit(1);
}
console.log("Données valides.");
