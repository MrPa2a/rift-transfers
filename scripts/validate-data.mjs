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
const years = new Set(teamsData.years);
const regions = new Set(teamsData.regions);

// --- équipes et lineups
const teamCodes = new Set();
const present = new Map(); // "2024:T1" -> true
const seenThisYear = new Map(); // "2024:faker" -> "T1"
const allPlayers = new Set();
const sharedPlayers = new Set(); // joueurs présents uniquement en rotation

for (const team of teamsData.teams) {
  const where = `équipe ${team.code}`;
  if (!/^[A-Z0-9]{2,5}$/.test(team.code)) errors.push(`${where} : code invalide`);
  if (teamCodes.has(team.code)) errors.push(`${where} : code en double`);
  teamCodes.add(team.code);
  if (!regions.has(team.region)) errors.push(`${where} : région inconnue « ${team.region} »`);

  for (const [year, entry] of Object.entries(team.worlds)) {
    const at = `${team.code} ${year}`;
    if (!years.has(Number(year))) errors.push(`${at} : année hors de la liste "years"`);
    present.set(`${year}:${team.code}`, true);
    const keys = Object.keys(entry.lineup || {});
    if (keys.length !== 5 || !ROLES.every((r) => keys.includes(r))) {
      errors.push(`${at} : le lineup doit contenir exactement ${ROLES.join(", ")}`);
      continue;
    }
    for (const role of ROLES) {
      const name = entry.lineup[role];
      if (typeof name !== "string" || !name.trim()) { errors.push(`${at} : ${role} vide`); continue; }
      const id = `${year}:${name.toLowerCase()}`;
      if (seenThisYear.has(id)) errors.push(`${at} : ${name} joue déjà pour ${seenThisYear.get(id)} la même année`);
      seenThisYear.set(id, team.code);
      allPlayers.add(name);
    }
    for (const [role, alt] of Object.entries(entry.shared || {})) {
      if (!ROLES.includes(role)) errors.push(`${at} : rôle partagé inconnu « ${role} »`);
      if (alt === entry.lineup[role]) errors.push(`${at} : ${alt} est à la fois titulaire et rotation`);
      sharedPlayers.add(alt.toLowerCase());
    }
    for (const role of entry.unverified || []) {
      if (!ROLES.includes(role)) errors.push(`${at} : rôle à vérifier inconnu « ${role} »`);
      else warnings.push(`${at} : ${role} encore à vérifier`);
    }
  }
}

// --- même joueur, casse différente
const byLower = new Map();
for (const name of allPlayers) {
  const k = name.toLowerCase();
  if (byLower.has(k) && byLower.get(k) !== name) errors.push(`joueur écrit de deux façons : ${byLower.get(k)} / ${name}`);
  byLower.set(k, name);
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
for (const [name, code] of Object.entries(playersData.nationality)) {
  if (!/^[A-Z]{2}$/.test(code)) errors.push(`nationalité de ${name} : « ${code} » n'est pas un code ISO à 2 lettres`);
  if (!byLower.has(name.toLowerCase()) && !sharedPlayers.has(name.toLowerCase())) warnings.push(`nationalité de ${name} : joueur absent des lineups`);
}
const noNat = [...allPlayers].filter((n) => !Object.keys(playersData.nationality).some((k) => k.toLowerCase() === n.toLowerCase()));

// --- sources
for (const year of teamsData.years) {
  if (!sourcesData.byYear?.[year]?.length) warnings.push(`${year} : aucune source listée dans data/sources.json`);
}

const lineups = [...present.keys()].length;
console.log(`${teamsData.teams.length} équipes, ${lineups} lineups, ${allPlayers.size} joueurs, ${noNat.length} sans nationalité vérifiée.`);
for (const w of warnings) console.log(`  avertissement · ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ERREUR · ${e}`);
  console.error(`${errors.length} erreur(s).`);
  process.exit(1);
}
console.log("Données valides.");
