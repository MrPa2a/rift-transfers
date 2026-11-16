#!/usr/bin/env node
// Checks the consistency of the files in /data before a commit or in CI.
// Usage: node scripts/validate-data.mjs
import { readFile } from "node:fs/promises";

const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
const [teamsData, resultsData, playersData, sourcesData, careersData] = await Promise.all(
  ["teams", "results", "players", "sources", "careers"].map(read),
);

const errors = [];
const warnings = [];
const ROLES = ["top", "jungle", "mid", "bot", "support"];
// Beyond this cut-off, two appearances of the same handle are probably two different people:
// a career does not resume after five Worlds without a trace.
const HOMONYM_GAP = 4;

// Careers with a gap already verified: one single person, confirmed by their Leaguepedia page
// and their legal name. Without this list the check would cry wolf on every run and end up being
// ignored. Only add a handle to it after verifying the person by name.
const HOMONYMES_VERIFIES = new Map([
  ["cuzz", "Moon Woo-chan, Cuzz page — Longzhu 2017, KT 2023 and 2025"],
  ["theshy", "Kang Seung-lok, TheShy page — IG 2018-2019, Weibo 2023, IG 2025-2026"],
  ["rookie", "Song Eui-jin, Rookie page — IG 2015, 2018-2019, 2025-2026"],
  ["contractz", "Juan Arturo Garcia, Contractz page — Cloud9 2017, NRG 2023"],
  ["josedeodo", "Brandon Joel Villegas, Josedeodo page — Movistar R7 2020, Team Liquid 2026"],
  ["isles", "Jonah Rosario, Isles page — Legacy Esports 2020, LYON 2026"],
  ["betty", "Lu Yu-Hung, Betty page — Flash Wolves 2017-2018, PSG Talon 2024-2025"],
  ["holyphoenix", "Anıl Işık, HolyPhoenix page — Dark Passage 2014, Istanbul Wildcats 2022"],
  ["dynquedo", "Matheus Rossini Miranda, DyNquedo page — KaBuM! 2018, paiN Gaming 2024"],
  ["tinowns", "Thiago Sartori, Tinowns page — KaBuM! 2014, LOUD 2022-2023"],
]);
const years = new Set(teamsData.years);
const regions = new Set(teamsData.regions);
const low = (s) => String(s ?? "").toLowerCase();

// The labels the interface draws from the data are bilingual: the English interface must not
// write "Corée du Sud" next to translated text. The check therefore demands **both** languages,
// and no longer a single name — only one of the two would let the hole pass in silence, since
// the map falls back on the raw code or on the other language without flagging anything.
const LANGS = ["fr", "en"];
const manqueLangue = (valeur) => {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return "must carry { \"fr\": …, \"en\": … }";
  const vides = LANGS.filter((l) => typeof valeur[l] !== "string" || !valeur[l].trim());
  if (vides.length) return `missing language${vides.length > 1 ? "s" : ""}: ${vides.join(", ")}`;
  const extra = Object.keys(valeur).filter((l) => !LANGS.includes(l));
  return extra.length ? `unknown language${extra.length > 1 ? "s" : ""}: ${extra.join(", ")}` : null;
};

// --- teams and lineups
const teamCodes = new Set();
const present = new Map(); // "2024:T1" -> true
const seenThisYear = new Map(); // "2024:faker" -> "T1"
const allPlayers = new Set(); // starters and rotations: all of them are shown on the map
const appearances = new Map(); // "faker" -> Set of years

for (const team of teamsData.teams) {
  const where = `team ${team.code}`;
  if (!/^[A-Z0-9]{2,5}$/.test(team.code)) errors.push(`${where}: invalid code`);
  if (teamCodes.has(team.code)) errors.push(`${where}: duplicate code`);
  teamCodes.add(team.code);
  if (!regions.has(team.region)) errors.push(`${where}: unknown region "${team.region}"`);

  // --- activity window, when it is declared
  let active = null;
  if (team.active !== undefined) {
    const ok = Array.isArray(team.active)
      && team.active.length >= 1 && team.active.length <= 2
      && team.active.every((y) => Number.isInteger(y));
    if (!ok) errors.push(`${where}: "active" must be [from] or [from, to], in whole years`);
    else {
      const [from, to = Infinity] = team.active;
      if (from > to) errors.push(`${where}: activity window reversed (${from} after ${to})`);
      else active = { from, to };
    }
  }

  for (const [year, entry] of Object.entries(team.worlds)) {
    const at = `${team.code} ${year}`;
    const y = Number(year);
    if (!years.has(y)) errors.push(`${at}: year outside the "years" list`);
    present.set(`${year}:${team.code}`, true);
    if (active && (y < active.from || y > active.to)) {
      errors.push(`${at}: lineup outside the activity window [${team.active.join(", ")}]`);
    }

    const keys = Object.keys(entry.lineup || {});
    if (keys.length !== 5 || !ROLES.every((r) => keys.includes(r))) {
      errors.push(`${at}: the lineup must contain exactly ${ROLES.join(", ")}`);
      continue;
    }

    // A displayed player = a starter or a rotation. Both count everywhere: each occupies a
    // targetable half-chip, so an error on either is just as visible.
    const shown = []; // [name, role]
    for (const role of ROLES) {
      const name = entry.lineup[role];
      if (typeof name !== "string" || !name.trim()) { errors.push(`${at}: ${role} empty`); continue; }
      shown.push([name, role]);
    }
    for (const [role, alt] of Object.entries(entry.shared || {})) {
      if (!ROLES.includes(role)) { errors.push(`${at}: unknown shared role "${role}"`); continue; }
      if (typeof alt !== "string" || !alt.trim()) { errors.push(`${at}: ${role} rotation empty`); continue; }
      if (alt === entry.lineup[role]) errors.push(`${at}: ${alt} is both starter and rotation`);
      shown.push([alt, role]);
    }

    const inRow = new Map(); // lower case -> role already taken in this row
    for (const [name, role] of shown) {
      const id = low(name);
      if (inRow.has(id)) {
        errors.push(`${at}: ${name} holds two roles in the same row (${inRow.get(id)} and ${role})`);
      } else inRow.set(id, role);

      const key = `${year}:${id}`;
      const other = seenThisYear.get(key);
      if (other && other !== team.code) errors.push(`${at}: ${name} already plays for ${other} that same year`);
      seenThisYear.set(key, team.code);

      allPlayers.add(name);
      if (!appearances.has(id)) appearances.set(id, new Set());
      appearances.get(id).add(y);
    }

    // --- roles displayed as two half-chips: the second player crosses the 20 % threshold
    const split = entry.split ?? [];
    if (!Array.isArray(split)) errors.push(`${at}: "split" must be a list of roles`);
    else {
      const vus = new Set();
      for (const role of split) {
        if (!ROLES.includes(role)) { errors.push(`${at}: unknown shared role in "split" "${role}"`); continue; }
        if (vus.has(role)) errors.push(`${at}: ${role} appears twice in "split"`);
        vus.add(role);
        // A half-chip presupposes two players: without `shared`, there is nothing to share.
        if (!entry.shared?.[role]) errors.push(`${at}: ${role} is in "split" but has no rotation in "shared"`);
      }
    }

    // --- handle borne at that edition, when it differs from the canonical spelling
    for (const [canonical, era] of Object.entries(entry.aliases || {})) {
      if (!inRow.has(low(canonical))) {
        errors.push(`${at}: alias declared for "${canonical}", who is not in this row`);
        continue;
      }
      if (typeof era !== "string" || !era.trim()) { errors.push(`${at}: empty alias for ${canonical}`); continue; }
      if (low(era) === low(canonical)) errors.push(`${at}: alias "${era}" identical to ${canonical}, pointless`);
    }

    for (const role of entry.unverified || []) {
      if (!ROLES.includes(role)) errors.push(`${at}: unknown role to verify "${role}"`);
      else warnings.push(`${at}: ${role} still to be verified`);
    }
  }
}

// A window declared on only some of the teams is the sign of an unfinished migration: the
// validator then asks for the rest.
const withActive = teamsData.teams.filter((t) => t.active !== undefined);
if (withActive.length && withActive.length !== teamsData.teams.length) {
  for (const t of teamsData.teams) {
    if (t.active === undefined) warnings.push(`team ${t.code}: no "active" window, while ${withActive.length} team(s) have one`);
  }
}

// --- same player, different case
const byLower = new Map();
for (const name of allPlayers) {
  const k = low(name);
  if (byLower.has(k) && byLower.get(k) !== name) errors.push(`player spelled two ways: ${byLower.get(k)} / ${name}`);
  byLower.set(k, name);
}

// --- an alias must not usurp another player's handle
for (const team of teamsData.teams) {
  for (const [year, entry] of Object.entries(team.worlds)) {
    for (const [canonical, era] of Object.entries(entry.aliases || {})) {
      const clash = byLower.get(low(era));
      if (clash && low(clash) !== low(canonical)) {
        errors.push(`${team.code} ${year}: the alias "${era}" of ${canonical} is already the handle of ${clash}`);
      }
    }
  }
}

// --- probable homonyms: a career interrupted for too long
const editions = [...teamsData.years].sort((a, b) => a - b);
for (const [id, seen] of appearances) {
  if (HOMONYMES_VERIFIES.has(id)) continue;
  const idx = [...seen].map((y) => editions.indexOf(y)).filter((i) => i >= 0).sort((a, b) => a - b);
  for (let i = 1; i < idx.length; i++) {
    const missed = idx[i] - idx[i - 1] - 1;
    if (missed > HOMONYM_GAP) {
      warnings.push(`${byLower.get(id)}: ${missed} editions without a trace between ${editions[idx[i - 1]]} and ${editions[idx[i]]} — check that it really is the same person, then add them to HOMONYMES_VERIFIES`);
    }
  }
}
// An entry that has become useless is a false sense of security: better remove it.
for (const id of HOMONYMES_VERIFIES.keys()) {
  if (!appearances.has(id)) warnings.push(`HOMONYMES_VERIFIES contains "${id}", absent from the lineups: entry to remove`);
}

// --- run labels: read on the map and in its legend, hence bilingual.
for (const [code, valeur] of Object.entries(resultsData.labels ?? {})) {
  const quoi = manqueLangue(valeur);
  if (quoi) errors.push(`labels.${code}: ${quoi}`);
}

// --- results
for (const [year, entries] of Object.entries(resultsData.results)) {
  for (const [code, value] of Object.entries(entries)) {
    if (!resultsData.labels[value]) errors.push(`result ${code} ${year}: unknown value "${value}"`);
    if (!present.has(`${year}:${code}`)) errors.push(`result ${code} ${year}: the team has no lineup that year`);
  }
}
for (const key of present.keys()) {
  const [year, code] = key.split(":");
  if (!resultsData.results[year]?.[code]) warnings.push(`${code} ${year}: no result recorded`);
}

// --- nationalities
for (const region of teamsData.regions) {
  // `isImport` reads HOME[team.region] with no guard: a missing region would crash the map.
  const home = playersData.homeCountries?.[region];
  if (!Array.isArray(home) || !home.length) errors.push(`homeCountries: nothing for region "${region}", the map would crash`);
  else for (const code of home) {
    if (!/^[A-Z]{2}$/.test(code)) errors.push(`homeCountries.${region}: "${code}" is not a 2-letter ISO code`);
  }
}
for (const region of Object.keys(playersData.homeCountries ?? {})) {
  if (!regions.has(region)) warnings.push(`homeCountries.${region}: region absent from "regions"`);
}

// --- league names: read when a region pill is hovered, next to the geographic zone. The code
// alone says neither what the league is nor where it is played. The name comes from
// `Leagues.League` — § 15 of the `fetch-worlds.mjs` report —, never from general knowledge: a
// region without a name is an error, not a hole to be filled from memory.
const leagueNames = teamsData.leagueNames ?? {};
for (const region of teamsData.regions) {
  const nom = leagueNames[region];
  if (typeof nom !== "string" || !nom.trim()) errors.push(`leagueNames: nothing for region "${region}", its pill's tooltip would carry the code alone`);
}
for (const region of Object.keys(leagueNames)) {
  if (!regions.has(region)) warnings.push(`leagueNames.${region}: region absent from "regions"`);
}
for (const [name, code] of Object.entries(playersData.nationality)) {
  if (!/^[A-Z]{2}$/.test(code)) errors.push(`nationality of ${name}: "${code}" is not a 2-letter ISO code`);
  if (!byLower.has(low(name))) warnings.push(`nationality of ${name}: player absent from the lineups`);
}
const noNat = [...allPlayers].filter((n) => !Object.keys(playersData.nationality).some((k) => low(k) === low(n)));

// --- country names: the detail panel spells the country out in full, and a code with no entry
// would fall back there to the raw code without anything flagging it. In both languages, failing
// which the English interface would write "Corée du Sud" in the middle of translated text.
const countryNames = playersData.countryNames ?? {};
const codesUtilises = new Set(Object.values(playersData.nationality));
for (const code of codesUtilises) {
  if (!countryNames[code]) errors.push(`countryNames: "${code}" has no name, the detail panel would display the raw code`);
}
for (const [code, nom] of Object.entries(countryNames)) {
  if (!/^[A-Z]{2}$/.test(code)) errors.push(`countryNames: "${code}" is not a 2-letter ISO code`);
  else {
    const quoi = manqueLangue(nom);
    if (quoi) errors.push(`countryNames.${code}: ${quoi}`);
    if (!codesUtilises.has(code)) warnings.push(`countryNames.${code}: no player from that country`);
  }
}

// The geographic zone of that same tooltip is derived from `homeCountries`: at most three
// countries, it spells them out in full. `ZONE_MAX` is the cut-off, kept in duplicate in
// assets/js/app.js, which additionally carries the three short labels of the regions beyond
// it.
const ZONE_MAX = 3;
for (const region of teamsData.regions) {
  const home = playersData.homeCountries?.[region];
  if (!Array.isArray(home) || home.length > ZONE_MAX) continue;
  for (const code of home) {
    if (!countryNames[code]) errors.push(`countryNames: "${code}" has no name, the zone of the ${region} pill would display the raw code`);
  }
}

// --- career steps outside Worlds
// The counterpart of a team's `active` window, on the player's side: a step is placed in a gap
// year — a year with no row, **between** two appearances of the same player. Outside that gap it
// has nothing to link, and is therefore not a step but a claim.
const careers = careersData.careers ?? {};
const trousDe = (id) => {
  const vus = [...(appearances.get(id) ?? [])].map((y) => editions.indexOf(y)).filter((i) => i >= 0).sort((a, b) => a - b);
  const creux = new Set();
  for (let i = 1; i < vus.length; i++) for (let j = vus[i - 1] + 1; j < vus[i]; j++) creux.add(editions[j]);
  return creux;
};
let nbEtapes = 0;
const clubsVus = new Set(); // columnless clubs actually cited by a step
for (const [name, fiche] of Object.entries(careers)) {
  const where = `career of ${name}`;
  const id = low(name);
  if (!byLower.has(id)) { errors.push(`${where}: player absent from the lineups`); continue; }
  if (byLower.get(id) !== name) errors.push(`${where}: spelled "${byLower.get(id)}" in the lineups — a player is spelled the same way everywhere`);

  // `seen`: first and last year with a game on record. It necessarily brackets the Worlds
  // played, failing which one of the two is wrong.
  const seen = fiche.seen;
  const okSeen = Array.isArray(seen) && seen.length === 2 && seen.every((y) => Number.isInteger(y)) && seen[0] <= seen[1];
  if (!okSeen) errors.push(`${where}: "seen" must be [first, last] year, in whole years`);
  const vus = [...(appearances.get(id) ?? [])].sort((a, b) => a - b);
  if (okSeen && vus.length && (seen[0] > vus[0] || seen[1] < vus.at(-1))) {
    errors.push(`${where}: "seen" [${seen.join(", ")}] does not bracket their Worlds (${vus[0]}–${vus.at(-1)})`);
  }

  const creux = trousDe(id);
  const annees = Object.keys(fiche.years ?? {});
  for (const key of annees) {
    const y = Number(key);
    const at = `${where}, ${key}`;
    if (!years.has(y)) { errors.push(`${at}: year outside the "years" list`); continue; }
    // A step outside a gap is an error, exactly like a lineup outside the `active` window.
    if (!creux.has(y)) { errors.push(`${at}: this year is not a gap between two of the player's Worlds`); continue; }
    const entry = fiche.years[key];
    const steps = entry?.steps;
    if (!Array.isArray(steps)) { errors.push(`${at}: "steps" must be a list`); continue; }
    // Rule 5 keeps the majority club plus any other club at 20 % of the games or more: beyond
    // five the arithmetic would not hold, and three is the measured maximum.
    if (steps.length > 3) errors.push(`${at}: ${steps.length} steps, the 20 % threshold does not allow that many`);
    if (entry.offLevel !== undefined) {
      if (entry.offLevel !== true) errors.push(`${at}: "offLevel" only takes the value true`);
      else if (steps.length) errors.push(`${at}: "offLevel" marks a year with no step kept`);
    }
    const vu = new Set();
    for (const step of steps) {
      const keys = Object.keys(step ?? {});
      if (keys.length !== 1 || !["team", "club"].includes(keys[0])) {
        errors.push(`${at}: a step carries either "team" (a column code) or "club" (a columnless club)`);
        continue;
      }
      const val = step.team ?? step.club;
      if (typeof val !== "string" || !val.trim()) { errors.push(`${at}: empty step`); continue; }
      if (vu.has(low(val))) errors.push(`${at}: ${val} appears twice`);
      vu.add(low(val));
      if (step.team && !teamCodes.has(step.team)) errors.push(`${at}: unknown team code "${step.team}"`);
      // A club that is in fact a column must join it: otherwise the thread goes around a
      // displayed column to settle in "Other teams".
      if (step.club) {
        if (teamCodes.has(step.club)) errors.push(`${at}: "${step.club}" is a column code, to be written as "team"`);
        const col = teamsData.teams.find((t) => t.name === step.club);
        if (col) errors.push(`${at}: "${step.club}" is the name of column ${col.code}, to be written as "team"`);
        clubsVus.add(step.club);
      }
      nbEtapes++;
    }
  }
}
// --- short codes of columnless clubs
// The badge on their chip in "Other teams". The same shape as a column code, because the two are
// read side by side. An orphan entry is dead data; a club with no entry is accepted — its chip
// stays without a badge, and that is what the script does when `Teams.Short` gives nothing
// usable.
const clubSigles = careersData.clubs ?? {};
if (careersData.clubs !== undefined && (typeof clubSigles !== "object" || Array.isArray(clubSigles))) {
  errors.push(`"clubs" must be an object "club name" → short code`);
} else {
  const parSigle = new Map();
  for (const [club, sigle] of Object.entries(clubSigles)) {
    const where = `club short code "${club}"`;
    if (!/^[A-Z0-9]{2,5}$/.test(String(sigle))) errors.push(`${where}: "${sigle}" is not a valid short code (2 to 5 upper-case letters or digits)`);
    if (!clubsVus.has(club)) errors.push(`${where}: no step cites this club`);
    if (teamCodes.has(String(sigle))) warnings.push(`${where}: "${sigle}" is also the code of the column of the same name — two identical badges for two different things`);
    if (parSigle.has(sigle)) warnings.push(`${where}: same short code as "${parSigle.get(sigle)}"`);
    else parSigle.set(sigle, club);
  }
  for (const club of [...clubsVus].sort()) {
    if (!Object.hasOwn(clubSigles, club)) warnings.push(`club "${club}": no short code, its chip will show without a badge`);
  }
}

// A missing career for a player with a gap is not a structural error but an unfinished
// collection run: the thread will jump over the gap in silence.
for (const [id, seen] of appearances) {
  if (!trousDe(id).size) continue;
  if (!Object.hasOwn(careers, byLower.get(id))) warnings.push(`${byLower.get(id)}: ${trousDe(id).size} year(s) between two Worlds, with no entry in careers.json`);
  void seen;
}

// --- sources
for (const year of teamsData.years) {
  if (!sourcesData.byYear?.[year]?.length) warnings.push(`${year}: no source listed in data/sources.json`);
}

const lineups = [...present.keys()].length;
console.log(`${teamsData.teams.length} teams, ${lineups} lineups, ${allPlayers.size} players displayed, ${noNat.length} without a verified nationality, ${nbEtapes} steps outside Worlds.`);
for (const w of warnings) console.log(`  warning · ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ERROR · ${e}`);
  console.error(`${errors.length} error(s).`);
  process.exit(1);
}
console.log("Data valid.");
