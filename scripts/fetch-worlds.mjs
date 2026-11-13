#!/usr/bin/env node
// Collecte les titulaires des Worlds sur Leaguepedia (Special:CargoExport) et applique
// les règles de sélection de docs/SOURCES.md : seuil de 20 %, poste majoritaire,
// deux joueurs par poste au maximum.
//
// Usage : node scripts/fetch-worlds.mjs [année…] [--refresh] [--out <dossier>]
//   Sans année : les 16 éditions 2011–2026. La règle 4 — une graphie par personne — se
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
//   active.json             fenêtre d'activité calculée pour chaque colonne
//   places.json             parcours de chaque équipe, au format data/results.json
//   regions.json            région calculée pour chaque colonne, édition par édition
//   leagues.json            nom de ligue de chaque région, au format data/teams.json
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
const HORIZON = [2011, 2026];
const ROLES = ["top", "jungle", "mid", "bot", "support"];
const ROLE_OF = { Top: "top", Jungle: "jungle", Mid: "mid", Bot: "bot", Support: "support" };

// --- année → préfixe d'OverviewPage.
// De 2011 à 2016 l'édition tient sur une seule page ; à partir de 2017 elle se répartit entre
// « …/Play-In » et « …/Main Event », la page parente ne portant alors aucune ligne de scoreboard.
// Le préfixe couvre les deux cas. `checkPages()` revérifie cette table à chaque exécution.
//
// Les deux premières éditions ne portent pas d'année dans leur titre, et `Season 1 World
// Championship` abrite **deux qualifications régionales en sous-page** — seul cas du jeu de
// données. Elles ne portent aucune ligne de scoreboard, mais `checkPages()` les signale
// nommément plutôt que de s'en remettre à ce fait.
const PAGES = {
  2011: "Season 1 World Championship",
  2012: "Season 2 World Championship",
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

// --- nom d'équipe Leaguepedia → code de colonne (les 120 colonnes du périmètre).
// Une équipe absente de cette table est hors périmètre : le rapport la liste plutôt que
// de l'écarter en silence.
//
// Le périmètre est **les cinq ligues suivies, prises à l'année de l'édition** : la règle,
// ses trois niveaux de preuve et ses deux cas limites sont dans docs/SOURCES.md, section
// « Périmètre : la région d'une rangée est celle de l'édition ». `Teams.Region` ne fait pas
// foi — elle donne la région de l'organisation *aujourd'hui*, qui avale la Turquie dans
// l'EMEA et range 100 Thieves et KaBuM! sous la même étiquette « Americas ».
//
// Le code de colonne dérive de `Teams.Short` replié en ASCII majuscule sans ponctuation
// (`aAa` → `AAA`, `CLG.EU` → `CLGEU`, `LØS` → `LOS`), tronqué à 5 caractères — la forme
// qu'impose `npm run validate`. Les collisions se départagent dans cet ordre : une colonne
// déjà publiée garde son code, sinon il va à l'organisation qui a joué le plus de parties
// aux Worlds et l'autre prend son discriminant Leaguepedia replié de la même façon
// (`Evil Geniuses.NA` → `EGNA`). Aucune collision à ce jour.
const TEAM_CODE = {
  // LCK
  "SK Telecom T1": "T1", "T1": "T1",
  "Samsung Ozone": "GEN", "Samsung White": "GEN", "Samsung Galaxy": "GEN", "Gen.G": "GEN",
  "KOO Tigers": "HLE", "ROX Tigers": "HLE", "Hanwha Life Esports": "HLE",
  "DAMWON Gaming": "DK", "DWG KIA": "DK", "Dplus Kia": "DK", "Dplus KIA": "DK",
  "KT Rolster": "KT",
  "Longzhu Gaming": "DRX", "DRX": "DRX",
  "NaJin Sword": "NJN", "NaJin Black Sword": "NJN", "NaJin White Shield": "NJN",
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
  "Counter Logic Gaming Europe": "CLGEU",
  // LCS
  "Cloud9": "C9",
  "Team Liquid": "TL",
  "FlyQuest": "FLY",
  "TSM": "TSM",
  "Counter Logic Gaming": "CLG", "CLG Prime": "CLG",
  // LMS
  "ahq eSports Club": "AHQ",
  "Flash Wolves": "FW",
  "Taipei Assassins": "TPA", "J Team": "TPA",

  // --- lot 4 (#8b) : les membres des cinq mêmes ligues que la carte ratait encore.
  // LCK
  "Azubu Frost": "AZF",
  "Griffin (Korean Team)": "GRF",
  "Afreeca Freecs": "DNS",
  // LPL
  "LNG Esports": "LNG",
  "Weibo Gaming": "WBG",
  "Team WE": "WE",
  "Suning": "SN",
  "I May": "IM",
  // LEC
  "Rogue (European Team)": "RGE",
  "SK Gaming": "SK",
  "Team BDS": "BDS",
  "against All authority": "AAA",
  "Gambit Gaming": "GMB",
  "Misfits Gaming": "MSF",
  "Lemondogs": "LD",
  "Alliance": "ALL",
  "Team Vitality": "VIT",
  "Team gamed!de": "GDE",
  "Moscow Five": "M5",
  // LCS
  "100 Thieves": "100T",
  "Evil Geniuses.NA": "EG",
  "Clutch Gaming": "CG",
  "LYON (2024 American Team)": "LYON",
  "NRG": "NRG",
  "Team Vulcun": "VUL",
  "Immortals": "IMT",
  "Epik Gamer": "EPIK",
  "LMQ": "LMQ",
  "Dignitas": "DIG",
  // LMS
  "Hong Kong Attitude": "HKA",
  "G-Rex": "GRX",
  "MAD Team": "MAD",
  "Gamania Bears": "GAB",

  // --- lot 5 (#8c) : les régions mineures. Plus aucune équipe des 16 éditions n'est hors
  // périmètre — le § 10 du rapport est désormais vide.
  // LCP
  "PSG Talon": "PSG",
  "CTBC Flying Oyster": "CFO",
  "Beyond Gaming": "BYG",
  "Team Secret Whales": "TSW",
  "MVK Esports": "MVK",
  "Machi Esports": "MCX",
  // LJL
  "DetonatioN FocusMe": "DFM",
  "V3 Esports": "V3",
  "Fukuoka SoftBank HAWKS gaming": "SHG",
  "Rampage": "RPG",
  // VCS
  "GIGABYTE Marines": "GAM", "GAM Esports": "GAM",
  "Team Whales": "TW",
  "Saigon Buffalo": "SGB",
  "Lowkey Esports.Vietnam": "LK",
  "Young Generation": "YGE",
  "Phong Vũ Buffalo": "PVB",
  "Vikings Esports (2023 Vietnamese Team)": "MVKE",
  "Saigon Jokers": "SAJ",
  // GPL
  "Mineski": "MSK",
  "Bangkok Titans": "BKT",
  "Ascension Gaming": "ASC",
  "MEGA": "MG",
  "Team Pacific": "PCFC",
  "Xan": "XAN",
  // LCO
  "Dire Wolves": "DW",
  "PEACE (Oceanic Team)": "PCE",
  "Legacy Esports": "LGC",
  "Chiefs Esports Club": "CHF",
  "MAMMOTH": "MEC",
  // TCL
  "SuperMassive Esports": "SUP", "Papara SuperMassive": "SUP",
  "Fenerbahçe Esports": "FB",
  "Galatasaray Esports": "GS",
  "Royal Youth": "RYL",
  "Dark Passage": "DP",
  "Istanbul Wildcats": "IW",
  // LCL
  "Unicorns of Love.CIS": "UOL",
  // `Gambit Gaming` (LEC 2013) et `Gambit Esports` (LCL 2017-2018) sont deux pages
  // d'organisation distinctes, de sigle `GMB` toutes les deux. La colonne déjà publiée garde
  // le code ; celle-ci prend l'initiale du second mot de son nom — troisième palier du
  // départage, l'organisation n'ayant pas de discriminant Leaguepedia.
  "Gambit Esports": "GMBE",
  "Albus NoX Luna": "ANX",
  "GamingGear.eu": "GGEU",
  // CBLOL
  "paiN Gaming": "PAIN",
  "LOUD": "LOUD",
  "INTZ": "INTZ",
  "KaBuM! Esports": "KBM",
  "FURIA": "FUR",
  "LØS": "LOS",
  "RED Canids": "RED",
  "Team oNe eSports": "ONE",
  "Vivo Keyd Stars": "VKS",
  // Seule organisation des 16 éditions sans fiche `Teams` : pas de `Short`, donc le code
  // dérive du nom de la page.
  "Flamengo Esports": "FLAME",
  // LLA
  "Rainbow7": "R7", "Movistar R7": "R7",
  "Isurus": "ISG",
  "INFINITY": "INF",
  "Kaos Latin Gamers": "KLG",
  "Lyon Gaming (2013 Latin American Team)": "LYN",
};

// Ordre de colonnes du plan, pour que les fragments sortent dans l'ordre de teams.json.
// Par région, puis par nombre d'éditions jouées décroissant et parties décroissantes : les
// colonnes du lot 4 viennent donc après celles qu'elles complètent, sans déplacer aucune.
const COLUMN_ORDER = [
  "T1", "GEN", "HLE", "DK", "KT", "DRX", "NJN", "SSB", "AZF", "GRF", "DNS",
  "EDG", "RNG", "IG", "FPX", "TES", "JDG", "BLG", "AL", "OMG", "LGD", "LNG", "WBG", "WE", "SN", "IM",
  "G2", "FNC", "MKOI", "KC", "H2K", "ORI", "CLGEU",
  "RGE", "SK", "BDS", "AAA", "GMB", "MSF", "LD", "ALL", "VIT", "GDE", "M5",
  "C9", "TL", "FLY", "TSM", "CLG",
  "100T", "EG", "CG", "LYON", "NRG", "VUL", "IMT", "EPIK", "LMQ", "DIG",
  "AHQ", "FW", "TPA", "HKA", "GRX", "MAD", "GAB",
  "PSG", "CFO", "BYG", "TSW", "MVK", "MCX",
  "DFM", "V3", "SHG", "RPG",
  "GAM", "TW", "SGB", "LK", "YGE", "PVB", "MVKE", "SAJ",
  "MSK", "BKT", "ASC", "MG", "PCFC", "XAN",
  "DW", "PCE", "LGC", "CHF", "MEC",
  "SUP", "FB", "GS", "RYL", "DP", "IW",
  "UOL", "GMBE", "ANX", "GGEU",
  "PAIN", "LOUD", "INTZ", "KBM", "FUR", "LOS", "RED", "ONE", "VKS", "FLAME",
  "R7", "ISG", "INF", "KLG", "LYN",
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
  // Arbitrage du 12/11/2026, à l'extension à 2011–2012. La fréquence seule basculerait sur
  // `bebe` (9 lignes en 2012 contre 6 en 2014), mais les deux premiers critères de la règle 4
  // disent tous deux `BeBe` : c'est la graphie de `/data` et celle du titre de page canonique.
  "bebe (chang bo-wei)": "BeBe",
  // Arbitrage du 12/11/2026, à l'extension du lot 4. `Kevin` (5 lignes en 2011) l'emporterait
  // sur `Kev1n` (3 lignes en 2012) par la seule fréquence, mais ce n'est pas une différence de
  // casse : c'est un renommage, et l'identité d'un joueur renommé est la graphie de sa page
  // canonique — comme `Jensen` contre `Incarnati0n`. `Kevin` devient donc le pseudo d'époque
  // de 2011, dans `PSEUDOS_EPOQUE`.
  kev1n: "Kev1n",
  // Arbitrage du 12/11/2026, à l'extension aux régions mineures. **Première collision réelle
  // de pseudo du jeu de données** : deux personnes portent `Violet` et sont désormais toutes
  // deux affichées — Ngô Mạnh Quyền (Saigon Jokers 2012) et Vincent Chun Him Wong (PEACE
  // 2021). La règle 3 veut alors un discriminant repris de Leaguepedia, et ce sont les titres
  // de leurs pages canoniques qui le portent. Sans cela les deux carrières fusionneraient en
  // une seule, sans alerte.
  "violet (ngô mạnh quyền)": "Violet (Ngô Mạnh Quyền)",
  "violet (vincent wong)": "Violet (Vincent Wong)",
};

// Départages d'égalité stricte imposés à la main, quand la règle 2 ne tranche pas.
// Clé : « <année> <code> <poste> ». Valeur : la page canonique du joueur de gauche.
const EGALITES_ARBITREES = {
  "2016 T1 jungle": "bengi", // Bengi 10 / Blank 10, tous deux jusqu'en finale
  "2019 C9 jungle": "svenskeren", // Blaber 3 / Svenskeren 3 : titulaire actuel conservé
};

// Postes arbitrés à la main, quand les règles 1 et 2 placent un joueur sur deux postes de la
// même rangée. Le modèle l'interdit — un joueur est une case, et `npm run validate` refuse le
// doublon — mais la règle 1 ne l'empêche pas : un poste dont aucun candidat n'a fait son poste
// majoritaire reçoit par défaut celui qui y a le plus joué, lequel tient déjà son propre poste.
//
// Clé « <année> <code> ». Valeur : par poste, `starter` pour imposer le titulaire (page
// canonique du joueur) et `second` pour imposer la rotation — `null` la retire.
const POSTES_ARBITRES = {
  // Epik Gamer 2011, 7 parties, roster entièrement tournant : **cinq joueurs pour cinq
  // postes**, et l'affectation est donc forcée, pas choisie. Le bot a été joué par Westrice
  // (3), Dyrus (2) et Doublelift (2), sans que ce soit le poste majoritaire d'aucun des
  // trois ; la règle 1 n'y qualifie personne et le script y place Westrice par défaut, alors
  // qu'il tient déjà le top (4/7, son poste majoritaire). Doublelift tient le support (5/7,
  // son poste majoritaire) : le déplacer viderait ce poste. Reste Dyrus, second du top avec
  // 3 parties — le seul dont le déplacement ne laisse aucun poste vide. Le top perd donc sa
  // demi-case et chacun des cinq joueurs occupe exactement un poste.
  // Même nature que l'arbitrage Chauster (CLG 2011), détaillé dans docs/SOURCES.md.
  "2011 EPIK": { bot: { starter: "dyrus" }, top: { second: null } },
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
  // Lot 4. Quatre cas, tous tranchés sur `PlayerRedirects` : un vrai pseudo d'époque y
  // survit en redirection, une coquille de scoreboard non.
  // `GoSu Pepper`, `GosuPepper` et `GoZu` y sont tous trois des alias d'`Edward`.
  edward: { 2012: "GoSu Pepper" },
  // `CndyPnda` y est un alias de `CandyPanda`, aux côtés de `Candy Panda` ; les 5 lignes de
  // 2011 l'écrivent ainsi sans exception.
  candypanda: { 2011: "CndyPnda" },
  // Revers de l'arbitrage `kev1n` de `GRAPHIES_ARBITREES` : `Kevin (Kevin Rubiszewski)` est
  // un alias de `Kev1n`, et c'est le pseudo des 5 lignes de 2011.
  kev1n: { 2011: "Kevin" },
  // Lot 5. Chen Hsiao-Hsien s'écrit `M1ssion` de 2017 à 2019 — la graphie que `/data` porte
  // déjà, et c'est le premier critère de la règle 4 — puis `Mission` à partir de 2020, sur ses
  // six lignes de 2020 comme sur ses six de 2022. Un `1` contre un `i` n'est pas une
  // différence de casse : c'est un renommage, et sa page canonique dit `Mission`.
  mission: { 2020: "Mission", 2022: "Mission" },
  // Revers des discriminants de `GRAPHIES_ARBITREES` : le discriminant est une **identité**,
  // pas une étiquette. Les deux Violet se sont appelés `Violet`, et c'est ce que leur case
  // affiche ; seule la clé qui relie leurs apparitions porte le nom civil, pour que leurs deux
  // carrières ne fusionnent pas.
  "violet (ngô mạnh quyền)": { 2012: "Violet" },
  "violet (vincent wong)": { 2021: "Violet" },
};

// Graphies d'année examinées puis écartées comme coquilles Leaguepedia : la graphie retenue
// s'applique, et le script ne les propose plus. Clé « <page en minuscules> <année> ».
const COQUILLES_ECARTEES = {
  "kramer 2015": "Kkramer", // une seule ligne, un K doublé
  // Les 11 lignes de 2011 l'écrivent ainsi, mais `FI` est le suffixe de désambiguïsation de
  // Leaguepedia — il garde aussi `CyanideFI` en redirection — et non un pseudo porté : sa page
  // et son `Players.ID` disent l'un et l'autre `Cyanide` (arbitrage du 12/11/2026).
  "cyanide 2011": "Cyanide FI",
  // `Ackerman` était bien le pseudo de Xiao Wang en 2014, et `PlayerRedirects` le garde sous
  // `Ackerman (Xiao Wang)`. Il est pourtant écarté depuis le lot 5 : **une autre personne
  // porte ce pseudo dans les données**, Gabriel Agustin Aparicio (LØS 2026), et un pseudo
  // d'époque ne doit jamais usurper celui d'un joueur affiché — `npm run validate` le refuse.
  // La rangée de 2014 affiche donc `GoDlike`, comme celle de 2013 (arbitrage du 12/11/2026).
  "godlike 2014": "ackerman",
};

// Noms de colonne arrêtés par le plan. Le `name` d'une rangée n'est écrit que s'il en diffère.
const PLAN_TEAM_NAMES = {
  T1: "T1", GEN: "Gen.G", HLE: "Hanwha Life", DK: "Dplus KIA", KT: "KT Rolster", DRX: "DRX",
  NJN: "NaJin e-mFire", SSB: "Samsung Blue",
  EDG: "EDG", RNG: "RNG", IG: "Invictus Gaming", FPX: "FunPlus Phoenix", TES: "Top Esports",
  JDG: "JD Gaming", BLG: "Bilibili Gaming", AL: "Anyone's Legend", OMG: "Oh My God", LGD: "LGD Gaming",
  G2: "G2 Esports", FNC: "Fnatic", MKOI: "MAD / KOI", KC: "Karmine Corp", H2K: "H2k-Gaming", ORI: "Origen",
  CLGEU: "CLG EU",
  C9: "Cloud9", TL: "Team Liquid", FLY: "FlyQuest", TSM: "TSM", CLG: "Counter Logic Gaming",
  AHQ: "ahq e-Sports Club", FW: "Flash Wolves", TPA: "Taipei Assassins",
  // Lot 4. Le nom est celui de la page d'organisation Leaguepedia, **privé du discriminant
  // de désambiguïsation** : `Griffin (Korean Team)` → Griffin, `Evil Geniuses.NA` → Evil
  // Geniuses, `Rogue (European Team)` → Rogue, `LYON (2024 American Team)` → LYON. Le
  // discriminant distingue des pages homonymes sur le wiki, il ne fait pas partie du nom.
  AZF: "Azubu Frost", GRF: "Griffin", DNS: "DN SOOPers",
  LNG: "LNG Esports", WBG: "Weibo Gaming", WE: "Team WE", SN: "Suning", IM: "I May",
  RGE: "Rogue", SK: "SK Gaming", BDS: "Team BDS", AAA: "against All authority",
  GMB: "Gambit Gaming", MSF: "Misfits Gaming", LD: "Lemondogs", ALL: "Alliance",
  VIT: "Team Vitality", GDE: "Team gamed!de", M5: "Moscow Five",
  "100T": "100 Thieves", EG: "Evil Geniuses", CG: "Clutch Gaming", LYON: "LYON", NRG: "NRG",
  VUL: "Team Vulcun", IMT: "Immortals", EPIK: "Epik Gamer", LMQ: "LMQ", DIG: "Dignitas",
  HKA: "Hong Kong Attitude", GRX: "G-Rex", MAD: "MAD Team", GAB: "Gamania Bears",
  // Lot 5. Le discriminant de désambiguïsation s'enlève comme au lot précédent, à ceci près
  // que Leaguepedia l'écrit **en majuscules** : `Unicorns of Love.CIS` → Unicorns of Love,
  // `Lowkey Esports.Vietnam` → Lowkey Esports, `PEACE (Oceanic Team)` → PEACE. C'est la casse
  // qui porte la distinction — `GamingGear.eu` garde son `.eu`, qui fait partie de la marque.
  PSG: "PSG Talon", CFO: "CTBC Flying Oyster", BYG: "Beyond Gaming", TSW: "Team Secret Whales",
  MVK: "MVK Esports", MCX: "Machi Esports",
  DFM: "DetonatioN FocusMe", V3: "V3 Esports", SHG: "Fukuoka SoftBank HAWKS gaming", RPG: "Rampage",
  GAM: "GAM Esports", TW: "Team Whales", SGB: "Saigon Buffalo", LK: "Lowkey Esports",
  YGE: "Young Generation", PVB: "Phong Vũ Buffalo", MVKE: "MGN Vikings Esports", SAJ: "Saigon Jokers",
  MSK: "Mineski", BKT: "Bangkok Titans", ASC: "Ascension Gaming", MG: "MEGA",
  PCFC: "Pacific eSports", XAN: "Xan",
  DW: "Dire Wolves", PCE: "PEACE", LGC: "Legacy Esports", CHF: "Chiefs Esports Club", MEC: "MAMMOTH",
  SUP: "Papara SuperMassive", FB: "Fenerbahçe Esports", GS: "Galatasaray Esports",
  RYL: "Royal Youth", DP: "Dark Passage", IW: "Istanbul Wildcats",
  UOL: "Unicorns of Love", GMBE: "Gambit Esports", ANX: "Albus NoX Luna", GGEU: "GamingGear.eu",
  // `paiN Gaming` garde la casse de l'organisation et des scoreboards : `Teams.Name` écrit
  // `PaiN Gaming`, ce qui n'est qu'une différence de casse — pas un nom d'époque.
  PAIN: "paiN Gaming", LOUD: "LOUD", INTZ: "INTZ", KBM: "KaBuM! Esports", FUR: "FURIA",
  LOS: "LØS", RED: "RED Canids", ONE: "Team oNe eSports", VKS: "Vivo Keyd Stars",
  FLAME: "Flamengo Esports",
  R7: "Movistar R7", ISG: "Isurus", INF: "INFINITY", KLG: "Kaos Latin Gamers", LYN: "Lyon Gaming",
};

// Alias annuels. Décision du 11/11/2026 : cette table fait foi sur Leaguepedia, qui normalise
// ses noms d'équipe (`TSM` pour `Team SoloMid`, `SK Telecom T1` pour `SKT T1 K`). Les noms
// Leaguepedia restent tracés dans le rapport. Justifications : docs/SOURCES.md, section
// « Noms de colonne et doubles équipes d'une même organisation ».
const PLAN_ALIASES = {
  T1: { 2013: "SKT T1 K", 2015: "SKT T1", 2016: "SKT T1" },
  GEN: { 2013: "Samsung Ozone", 2014: "Samsung Galaxy White", 2016: "Samsung Galaxy" },
  RNG: { 2013: "Royal Club", 2014: "Star Horn Royal Club" },
  HLE: { 2015: "KOO Tigers", 2016: "ROX Tigers" },
  NJN: { 2012: "NaJin Sword", 2013: "NaJin Black Sword", 2014: "NaJin White Shield" },
  SSB: { 2014: "Samsung Galaxy Blue" },
  MKOI: { 2016: "Splyce", 2019: "Splyce" },
  // Le rebrand de Team SoloMid en TSM date du 1er janvier 2020 : 2020 garde donc « TSM ».
  TSM: {
    2011: "Team SoloMid", 2012: "Team SoloMid", 2013: "Team SoloMid", 2014: "Team SoloMid",
    2015: "Team SoloMid", 2016: "Team SoloMid", 2017: "Team SoloMid",
  },
  // Season 2 : l'organisation alignait deux équipes. `CLG Prime` est la branche nord-américaine,
  // que `TeamRedirects` ramène à la page d'org `Counter Logic Gaming` — elle garde donc la
  // colonne. `Counter Logic Gaming Europe`, page d'org distincte, a la sienne (`CLGEU`).
  CLG: { 2012: "CLG Prime" },
  CLGEU: { 2012: "Counter Logic Gaming Europe" },
  EDG: { 2014: "EDward Gaming", 2015: "EDward Gaming", 2016: "EDward Gaming" },
  H2K: { 2015: "H2k-Gaming", 2016: "H2k-Gaming" },
  OMG: { 2013: "Oh My God", 2014: "Oh My God" },
  // Rebrand de Taipei Assassins, rattaché à la colonne TPA (arbitrage du 11/11/2026).
  TPA: { 2019: "J Team" },
  // Lot 4 : un seul des 33 noms d'organisation d'aujourd'hui diffère du nom porté à
  // l'édition. `TeamRedirects` ramène `Afreeca Freecs` à la page `DN SOOPers`.
  DNS: { 2018: "Afreeca Freecs" },
  // Lot 5 : cinq noms d'époque réels. Les autres écarts entre nom de page et nom de rangée
  // ne sont que le discriminant du wiki, qui n'est pas un nom porté.
  GAM: { 2017: "GIGABYTE Marines" },
  MVKE: { 2024: "Vikings Esports" },
  PCFC: { 2011: "Team Pacific" },
  SUP: { 2018: "SuperMassive Esports" },
  R7: { 2020: "Rainbow7" },
};

// Région de chaque colonne, arrêtée par le plan. `fetchRegions()` la recalcule depuis la
// source à chaque exécution et le rapport confronte les deux (§ 13) : cette table est la
// décision, le calcul en est le contrôle.
//
// Un libellé de région est un **nom de ligue**, comme les cinq d'origine. La règle qui décide
// de l'appartenance est dans docs/SOURCES.md, section « Périmètre » : la ligue réellement
// jouée l'année de l'édition, jamais `Teams.Region`, qui donne celle d'aujourd'hui.
const PLAN_REGIONS = {
  T1: "LCK", GEN: "LCK", HLE: "LCK", DK: "LCK", KT: "LCK", DRX: "LCK", NJN: "LCK", SSB: "LCK", AZF: "LCK", GRF: "LCK", DNS: "LCK",
  EDG: "LPL", RNG: "LPL", IG: "LPL", FPX: "LPL", TES: "LPL", JDG: "LPL", BLG: "LPL", AL: "LPL", OMG: "LPL", LGD: "LPL", LNG: "LPL", WBG: "LPL", WE: "LPL", SN: "LPL", IM: "LPL",
  G2: "LEC", FNC: "LEC", MKOI: "LEC", KC: "LEC", H2K: "LEC", ORI: "LEC", CLGEU: "LEC", RGE: "LEC", SK: "LEC", BDS: "LEC", AAA: "LEC", GMB: "LEC", MSF: "LEC", LD: "LEC", ALL: "LEC", VIT: "LEC", GDE: "LEC", M5: "LEC",
  C9: "LCS", TL: "LCS", FLY: "LCS", TSM: "LCS", CLG: "LCS", "100T": "LCS", EG: "LCS", CG: "LCS", LYON: "LCS", NRG: "LCS", VUL: "LCS", IMT: "LCS", EPIK: "LCS", LMQ: "LCS", DIG: "LCS",
  AHQ: "LMS", FW: "LMS", TPA: "LMS", HKA: "LMS", GRX: "LMS", MAD: "LMS", GAB: "LMS",
  PSG: "LCP", CFO: "LCP", BYG: "LCP", TSW: "LCP", MVK: "LCP", MCX: "LCP",
  DFM: "LJL", V3: "LJL", SHG: "LJL", RPG: "LJL",
  GAM: "VCS", TW: "VCS", SGB: "VCS", LK: "VCS", YGE: "VCS", PVB: "VCS", MVKE: "VCS", SAJ: "VCS",
  MSK: "GPL", BKT: "GPL", ASC: "GPL", MG: "GPL", PCFC: "GPL", XAN: "GPL",
  DW: "LCO", PCE: "LCO", LGC: "LCO", CHF: "LCO", MEC: "LCO",
  SUP: "TCL", FB: "TCL", GS: "TCL", RYL: "TCL", DP: "TCL", IW: "TCL",
  UOL: "LCL", GMBE: "LCL", ANX: "LCL", GGEU: "LCL",
  PAIN: "CBLOL", LOUD: "CBLOL", INTZ: "CBLOL", KBM: "CBLOL", FUR: "CBLOL", LOS: "CBLOL", RED: "CBLOL", ONE: "CBLOL", VKS: "CBLOL", FLAME: "CBLOL",
  R7: "LLA", ISG: "LLA", INF: "LLA", KLG: "LLA", LYN: "LLA",
};

// Pages de lignée Leaguepedia qu'aucun nom d'équipe des Worlds ne relie à la colonne, et que
// la fenêtre d'activité doit pourtant couvrir. `TeamRedirects` ne les y ramène pas et
// `Teams.RenamedTo` ne les y relie pas non plus : sans cette table, la fenêtre calculée
// commencerait trop tard. Pages vérifiées dans `Teams` (arbitrage du 12/11/2026).
const LIGNEES_ARBITREES = {
  // Lot 5. `SK Telecom T1 K` est la page d'organisation de la branche qui a joué — et gagné —
  // les Worlds 2013 : c'est exactement la rangée `T1 2013`, que `PLAN_ALIASES` nomme déjà
  // « SKT T1 K ». Ni `TeamRedirects` ni `Teams.RenamedTo` ne la relient à `T1`, seule
  // `Teams.OrganizationPage` le fait — et celle-ci est écartée par principe, parce qu'elle
  // rattacherait du même geste la jumelle `SK Telecom T1 S`, qui n'est jamais allée aux
  // Worlds et n'a donc pas de colonne. Sans cette entrée, l'année 2014 de Faker, Bengi et
  // Piglet tomberait dans « Autres équipes » au lieu de passer par la colonne T1.
  T1: ["SK Telecom T1 K"],
  // L'organisation alignait deux équipes de 2013 à 2014, `KT Rolster B` et `KT Rolster A`,
  // avant de les fusionner sous `KT Rolster` : deux pages d'org distinctes, sigles KT.B et KT.A.
  KT: ["KT Rolster Bullets", "KT Rolster Arrows"],
  // Même cas : `NaJin Black Sword` et `NaJin White Shield` ont fusionné en `NaJin e-mFire`,
  // page d'org à part, d'où viennent les dernières parties de la lignée (novembre 2015).
  NJN: ["NaJin e-mFire"],
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

  // Qualifications régionales vivant **sous** le préfixe d'une édition : le `LIKE` de
  // `fetchYear` les avalerait. Le discriminant est la région — une page d'édition et ses
  // phases sont « International », une qualification porte le nom de sa région. Seules
  // `Season 1 World Championship/Qualifiers/Europe` et `/North America` sont dans ce cas ;
  // elles ne portent aucune ligne, mais l'exclusion ne doit pas reposer sur ce hasard.
  const regional = [];
  for (const year of ALL_YEARS) {
    const parentRegion = byPage.get(PAGES[year])?.region ?? "International";
    for (const t of tournaments) {
      if (!t.page.startsWith(`${PAGES[year]}/`) || t.region === parentRegion) continue;
      const rows = Number(scoreboards.find((s) => s.page === t.page)?.rows ?? 0);
      regional.push({ year, page: t.page, name: t.name, region: t.region, rows });
    }
  }

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

  return { covered, excluded, outside, empty, uncovered, regional };
}

// ------------------------------------------------- parcours de chaque équipe à l'édition

// `data/results.json` dit jusqu'où chaque équipe est allée. C'était la dernière donnée encore
// établie à la main ; elle vient maintenant de `TournamentResults.Place` sur la page de
// l'édition, traduit en libellé par la règle déjà écrite dans docs/SOURCES.md :
//
//   1 → W, 2 → F, 3-4 → SF, 5-8 → QF
//
// Au-delà du huitième rang, deux distinctions que le classement seul ne donne pas :
//
//  - **`P`, éliminé au play-in** — déduit des pages qui portent réellement ses parties. Une
//    équipe dont tous les scoreboards sont sur `…/Play-In` n'a pas atteint le Main Event.
//    C'est exact, et équipe par équipe, là où une coupure par rang serait à retrouver à
//    chaque édition ;
//  - **`G` (groupes) contre `S` (ronde suisse)** — lu sur les noms de tours du Main Event.
//    De 2011 à 2022 ils s'appellent `Group Stage` ou `Day 1`…`Day 8` ; depuis 2023,
//    `Round 1`…`Round 5`. Le Play-In est écarté du test : lui aussi emploie `Round 2`.
//
// Un classement non encore attribué sort `null` côté Leaguepedia — les deux finalistes de
// 2026 au moment d'écrire. Le script ne propose alors aucun libellé et le signale : c'est le
// cas du `F*` de `data/results.json`, qui reste un arbitrage à la main.
const PLACE_LABEL = [[1, "W"], [2, "F"], [4, "SF"], [8, "QF"]];
const GROUP_ROUND = /^(Group Stage|Day \d)/;

async function fetchPlaces(years, computed, outDir) {
  const out = new Map(); // année → { code → { label, place, rank, how } }
  const notes = [];
  for (const year of years) {
    const rows = await cargoAll({
      tables: "TournamentResults",
      fields: "TournamentResults.OverviewPage=event,TournamentResults.Team=team,TournamentResults.Place=place,TournamentResults.Place_Number=rank",
      where: `TournamentResults.OverviewPage LIKE '${PAGES[year]}%'`,
      order_by: "TournamentResults.Place_Number ASC",
    });
    await sleep(THROTTLE_MS);
    // Seule la page de l'édition classe les participants : ses qualifications régionales en
    // sous-page classent les leurs, et le `LIKE` les ramène aussi.
    const ranking = rows.filter((r) => asText(r.event) === PAGES[year]);
    if (!ranking.length) { notes.push(`${year} : aucun classement sur \`${PAGES[year]}\``); continue; }

    const teamsOfYear = computed.get(year) ?? new Map();
    const byLpName = new Map([...teamsOfYear.values()].map((t) => [low(t.lpName), t]));
    // Format du Main Event : la page de l'édition qui n'est pas le Play-In.
    const rounds = new Set();
    for (const t of teamsOfYear.values()) {
      for (const page of t.pages) {
        if (/\/Play-In$/i.test(page)) continue;
        for (const stage of t.stages ?? []) rounds.add(stage);
      }
    }
    const swiss = rounds.size > 0 && ![...rounds].some((r) => GROUP_ROUND.test(r));
    const deep = swiss ? "S" : "G";

    const year_ = {};
    for (const r of ranking) {
      const team = asText(r.team);
      const rank = Number(r.rank) || 0;
      if (!team) { notes.push(`${year} : rang ${asText(r.place) ?? "?"} encore sans équipe — finale non jouée, le libellé reste à poser à la main`); continue; }
      const t = byLpName.get(low(team));
      if (!t?.code) continue; // équipe hors périmètre
      const bracket = PLACE_LABEL.find(([n]) => rank <= n)?.[1] ?? null;
      const playInOnly = [...t.pages].every((page) => /\/Play-In$/i.test(page));
      const label = bracket ?? (playInOnly ? "P" : deep);
      year_[t.code] = {
        label, place: asText(r.place), rank,
        how: bracket ? "classement" : playInOnly ? "play-in seul" : `Main Event (${swiss ? "ronde suisse" : "groupes"})`,
      };
    }
    out.set(year, year_);
  }
  await writeFile(join(outDir, "places.json"), `${JSON.stringify({
    $comment: "Parcours de chaque équipe suivie, déduit de TournamentResults.Place sur la page de l'édition : 1 → W, 2 → F, 3-4 → SF, 5-8 → QF, puis P si l'équipe n'a joué que le Play-In, sinon G (groupes) ou S (ronde suisse) selon le format du Main Event. À recopier dans data/results.json. Voir § 12 du rapport.",
    results: Object.fromEntries([...out].map(([y, e]) => [y, Object.fromEntries(Object.entries(e).map(([c, v]) => [c, v.label]))])),
    detail: Object.fromEntries(out),
  }, null, 1)}\n`);
  return { places: out, notes };
}

// ----------------------------------------------------- fenêtres d'activité des colonnes

// Première et dernière partie de chaque organisation sur Leaguepedia, toutes compétitions
// confondues : la règle écrite de `active`, appliquée à la main jusqu'ici. Sur 66 colonnes
// c'étaient 66 occasions de se tromper ; le script la calcule donc, et le rapport la
// confronte à `data/teams.json`. Il ne l'écrit pas : l'invariant « ce script ne modifie
// jamais /data » vaut ici comme ailleurs.
//
// La lignée d'une organisation est éclatée en plusieurs pages sur le wiki. Trois chemins la
// recomposent, tous trois issus de la source : les alias de `TeamRedirects`, les
// **prédécesseurs** de `Teams.RenamedTo` suivis jusqu'à fermeture, et la table
// `LIGNEES_ARBITREES` pour ce qu'aucun des deux ne relie.
//
// Deux garde-fous, sans lesquels la fermeture avale des organisations voisines :
//
//  - **les prédécesseurs seulement, jamais les successeurs.** `Teams.RenamedTo` relie
//    `Gamers2` à `G2 Esports` et `Snake Esports` à `LNG Esports` — même organisation sous
//    un nom antérieur, à compter dans la fenêtre. Suivi vers l'avant, le même champ mène à
//    l'organisation qui a *repris la suite* : `Alliance` → `Elements`, `Origen` →
//    `Astralis`, `NaJin e-mFire` → `e-mFire`, `Team Vulcun` → `XDG Gaming`. Ce n'est plus
//    la même colonne, et la borne de fin s'en trouvait repoussée de plusieurs années ;
//  - **jamais une page qui est elle-même une colonne.** `Clutch Gaming` porte
//    `RenamedTo: Dignitas`, et les deux ont une rangée aux Worlds : ce sont deux colonnes,
//    par le même critère que CLG / CLG EU — une page d'organisation, une colonne. Une page
//    sans colonne propre alimente en revanche la fenêtre de celle dont elle prolonge la
//    lignée (`OpTic Gaming` → `Immortals`).
//
// La borne de fin n'est posée que si **toutes** les pages de la lignée portent
// `IsDisbanded`. La borne de début est un **minorant** : une page de lignée qu'aucun des
// trois chemins n'atteint fait commencer la fenêtre trop tard, et c'est pourquoi le rapport
// signale l'écart au lieu de remplacer la valeur saisie.
async function fetchActive(outDir) {
  const codes = [...new Set(Object.values(TEAM_CODE))];
  const seeds = new Map(); // code → noms de départ
  for (const [name, code] of Object.entries(TEAM_CODE)) {
    if (!seeds.has(code)) seeds.set(code, []);
    seeds.get(code).push(name);
  }
  for (const [code, extra] of Object.entries(LIGNEES_ARBITREES)) seeds.get(code)?.push(...extra);

  // nom → page d'org. `TeamRedirects` n'a pas de champ de cible : la page qui porte la
  // redirection *est* la page d'organisation.
  const names = [...new Set([...seeds.values()].flat())];
  const pageOfName = new Map();
  for (const chunk of chunks(names, CHUNK)) {
    const rows = await cargoAll({
      tables: "TeamRedirects",
      fields: "TeamRedirects.AllName=alias,TeamRedirects._pageName=page",
      where: `TeamRedirects.AllName IN (${sqlList(chunk)})`,
    });
    for (const r of rows) if (r.alias && r.page) pageOfName.set(low(r.alias), String(r.page));
    await sleep(THROTTLE_MS);
  }
  const pagesOfCode = new Map(codes.map((c) => [c, new Set(seeds.get(c).map((n) => pageOfName.get(low(n)) ?? n))]));

  // Pages qui sont elles-mêmes une colonne : la fermeture ne doit jamais les absorber.
  const ownColumn = new Set([...pagesOfCode.values()].flatMap((set) => [...set]));

  // Fermeture par les prédécesseurs de `Teams.RenamedTo`, jusqu'à ne plus rien trouver.
  const fiches = new Map(); // page → fiche Teams, ou null si la page n'en porte pas
  const teamsWhere = async (where) => {
    const rows = await cargoAll({
      tables: "Teams",
      fields: "Teams.OverviewPage=page,Teams.Name=name,Teams.Short=short,Teams.Region=region,Teams.Location=loc,Teams.RenamedTo=renamed,Teams.IsDisbanded=disbanded",
      where,
    });
    await sleep(THROTTLE_MS);
    return rows;
  };
  for (let round = 0; round < 6; round++) {
    const unknown = [...new Set([...pagesOfCode.values()].flatMap((set) => [...set]))].filter((pg) => !fiches.has(pg));
    if (!unknown.length) break;
    for (const chunk of chunks(unknown, CHUNK)) {
      const rows = await teamsWhere(`Teams.OverviewPage IN (${sqlList(chunk)})`);
      const byPage = new Map(rows.map((r) => [String(r.page), r]));
      // Toutes les pages d'organisation ne sont pas la clé de leur propre fiche : `Teams`
      // indexe sur `OverviewPage`, qui diffère parfois du titre de la page où vit la
      // redirection — `ahq eSports Club`, `Saigon Jokers` et `GAM Esports` sont dans ce cas.
      // Sans ce second passage par `Teams.Name`, leur `Location` manque, et c'est elle qui
      // tranche les régions que Leaguepedia nomme `SEA` ou `Americas`.
      const manquants = chunk.filter((pg) => !byPage.has(pg));
      if (manquants.length) {
        for (const r of await teamsWhere(`Teams.Name IN (${sqlList(manquants)})`)) {
          const nom = asText(r.name);
          if (nom && !byPage.has(nom)) byPage.set(nom, r);
        }
      }
      for (const pg of chunk) fiches.set(pg, byPage.get(pg) ?? null);
    }
    // Prédécesseurs : les pages dont `RenamedTo` désigne une page déjà retenue.
    //
    // `Teams.RenamedTo` ne porte pas toujours un **titre de page** : il porte le nom sous
    // lequel l'équipe a continué, qui n'est parfois qu'une redirection. `Kingzone DragonX`
    // est renommée en « DragonX », alias de la page `DRX` : comparer les chaînes brutes
    // coupait la lignée là, et les huit étapes de 2018 tombaient dans « Autres équipes »
    // avec la colonne DRX juste à côté. On interroge donc sur tous les noms des pages
    // retenues, et on résout la cible avant de comparer.
    const nomsRetenus = new Map(); // nom en minuscules → page retenue
    for (const chunk of chunks(unknown, CHUNK)) {
      const rows = await cargoAll({
        tables: "TeamRedirects",
        fields: "TeamRedirects.AllName=alias,TeamRedirects._pageName=page",
        where: `TeamRedirects._pageName IN (${sqlList(chunk)})`,
      });
      for (const r of rows) if (r.alias && r.page) nomsRetenus.set(low(r.alias), String(r.page));
      await sleep(THROTTLE_MS);
    }
    for (const pg of unknown) nomsRetenus.set(low(pg), pg);
    let grew = false;
    for (const chunk of chunks([...new Set([...nomsRetenus.keys()])], CHUNK)) {
      for (const r of await teamsWhere(`Teams.RenamedTo IN (${sqlList(chunk)})`)) {
        const page = String(r.page);
        const cible = nomsRetenus.get(low(asText(r.renamed) ?? ""));
        if (!cible) continue;
        if (ownColumn.has(page)) continue; // page déjà colonne : elle garde sa propre fenêtre
        for (const pages of pagesOfCode.values()) {
          if (pages.has(cible) && !pages.has(page)) { pages.add(page); grew = true; }
        }
      }
    }
    if (!grew && ![...pagesOfCode.values()].flatMap((set) => [...set]).some((pg) => !fiches.has(pg))) break;
  }

  // tous les noms employés par ces pages
  const allPages = [...new Set([...pagesOfCode.values()].flatMap((s) => [...s]))];
  const namesOfPage = new Map(allPages.map((p) => [p, new Set([p])]));
  for (const chunk of chunks(allPages, CHUNK)) {
    const rows = await cargoAll({
      tables: "TeamRedirects",
      fields: "TeamRedirects.AllName=alias,TeamRedirects._pageName=page",
      where: `TeamRedirects._pageName IN (${sqlList(chunk)})`,
    });
    for (const r of rows) namesOfPage.get(String(r.page))?.add(String(r.alias));
    await sleep(THROTTLE_MS);
  }

  // première et dernière partie, par nom d'équipe
  const span = new Map(); // nom en minuscules → { first, last, games }
  const allNames = [...new Set([...namesOfPage.values()].flatMap((s) => [...s]))];
  for (const side of ["Team1", "Team2"]) {
    for (const chunk of chunks(allNames, 40)) {
      const rows = await cargoAll({
        tables: "ScoreboardGames=SG",
        fields: `SG.${side}=team,MIN(SG.DateTime_UTC)=first,MAX(SG.DateTime_UTC)=last,COUNT(*)=games`,
        where: `SG.${side} IN (${sqlList(chunk)})`,
        group_by: `SG.${side}`,
      });
      // `ScoreboardGames` ne respecte pas toujours la casse du titre de page (`yoe Flash
      // Wolves` contre `Yoe Flash Wolves`) : la clé est donc en minuscules.
      for (const r of rows) {
        const k = low(r.team);
        const cur = span.get(k) ?? { first: null, last: null, games: 0 };
        const first = asText(r.first);
        const last = asText(r.last);
        if (first && (!cur.first || first < cur.first)) cur.first = first;
        if (last && (!cur.last || last > cur.last)) cur.last = last;
        cur.games += Number(r.games) || 0;
        span.set(k, cur);
      }
      await sleep(THROTTLE_MS);
    }
  }

  const out = new Map();
  for (const code of codes) {
    const pages = [...pagesOfCode.get(code)].sort();
    let first = null;
    let last = null;
    let games = 0;
    for (const page of pages) {
      for (const name of namesOfPage.get(page) ?? [page]) {
        const s = span.get(low(name));
        if (!s) continue;
        if (s.first && (!first || s.first < first)) first = s.first;
        if (s.last && (!last || s.last > last)) last = s.last;
        games += s.games;
      }
    }
    const known = pages.map((p) => fiches.get(p)).filter(Boolean);
    // Une seule page encore en activité suffit à laisser la fenêtre ouverte.
    const disbanded = known.length > 0 && known.every((f) => String(f.disbanded) === "1");
    out.set(code, {
      pages, first, last, games, disbanded,
      active: first ? (disbanded ? [Number(first.slice(0, 4)), Number(last.slice(0, 4))] : [Number(first.slice(0, 4))]) : null,
      shorts: [...new Set(known.map((f) => asText(f.short)).filter(Boolean))],
    });
  }
  await writeFile(join(outDir, "active.json"), `${JSON.stringify({
    $comment: "Fenetre d'activite calculee pour chaque colonne : première et dernière partie sur Leaguepedia, toutes compétitions confondues, sur toute la lignée de pages de l'organisation. La borne de fin n'est posée que si toutes ces pages portent IsDisbanded. La borne de début est un minorant : une page de lignée hors de portée des trois chemins de résolution la fait commencer trop tard. Voir § 11 du rapport.",
    columns: Object.fromEntries(out),
  }, null, 1)}\n`);
  // La lignée sert aussi à `fetchRegions` : même résolution, deux usages.
  return { columns: out, lineage: { pagesOfCode, namesOfPage, fiches } };
}

// ------------------------------------------- région de chaque colonne, édition par édition

// La règle de périmètre de docs/SOURCES.md, rendue exécutable. Elle décide à quelle famille
// de région appartient une rangée, **à l'année de son édition** : `Teams.Region` ne fait pas
// foi, puisqu'elle donne la région de l'organisation aujourd'hui — elle range 100 Thieves et
// KaBuM! sous la même étiquette « Americas » et fait avaler la Turquie par l'EMEA.
//
// Un libellé de région est un nom de ligue. La table ci-dessous les relie aux noms que
// Leaguepedia emploie, avec sa propre région : c'est le couple (`League`, `Region`) qui
// identifie une ligue, le nom seul ne suffisant pas — `LoL Japan League` porte tantôt
// « Japan », tantôt « Asia Pacific ».
const LIGUES = [
  ["LoL The Champions", "Korea", "LCK"], ["LoL Champions Korea", "Korea", "LCK"], ["OGN", "Korea", "LCK"],
  ["Tencent LoL Pro League", "China", "LPL"],
  ["Europe League Championship Series", "Europe", "LEC"],
  ["LoL EMEA Championship", "Europe", "LEC"], ["LoL EMEA Championship", "EMEA", "LEC"],
  ["North America League Championship Series", "North America", "LCS"],
  ["League of Legends Championship Series", "North America", "LCS"],
  ["League of Legends Championship of The Americas North", "Americas", "LCS"],
  ["LoL Master Series", "LMS", "LMS"],
  ["Turkish Championship League", "Turkey", "TCL"],
  ["LoL Continental League", "CIS", "LCL"],
  ["Circuit Brazilian League of Legends", "Brazil", "CBLOL"], ["Brazil Regional Finals", "Brazil", "CBLOL"],
  ["Vietnam Championship Series", "Vietnam", "VCS"],
  ["LoL Japan League", "Japan", "LJL"], ["LoL Japan League", "Asia Pacific", "LJL"],
  ["Oceanic Pro League", "Oceania", "LCO"], ["LoL Circuit Oceania", "Oceania", "LCO"],
  ["LoL Circuit Oceania", "Asia Pacific", "LCO"],
  ["Pacific Championship Series", "Asia Pacific", "LCP"],
  ["League of Legends Championship Pacific", "Asia Pacific", "LCP"],
  ["Liga Latinoamerica", "Latin America", "LLA"], ["Liga Latinoamérica Norte", "LAN", "LLA"],
  ["Copa Latinoamérica Norte", "LAN", "LLA"], ["Copa Latinoamérica Sur", "LAS", "LLA"],
  ["Latin America Cup", "Latin America", "LLA"], ["Latin American Regional Finals", "Latin America", "LLA"],
];

// Régions Leaguepedia qui couvrent **plusieurs** familles du projet : leur nom ne désigne
// alors aucun territoire, et c'est `Teams.Location` qui décide.
//
//  - `SEA` est la région de la GPL et des circuits qui lui succèdent, de Taïwan au Vietnam en
//    passant par la Thaïlande et les Philippines. Taïwan, Hong Kong et Macao relèvent de la
//    LMS — c'est ce qui rattache les Taipei Assassins et ahq avant 2015 — le Vietnam de la
//    VCS, et le reste reste GPL ;
//  - `Americas` est celle de la LTA South 2025, qui fusionne pour une saison le CBLOL et la
//    LLA. La fusion ne succède ni à l'une ni à l'autre : le CBLOL rouvre en 2026, et c'est
//    donc la localisation de l'organisation qui tranche sa seule rangée.
const PAR_TERRITOIRE = {
  SEA: { Taiwan: "LMS", "Hong Kong": "LMS", Macau: "LMS", Macao: "LMS", Vietnam: "VCS", "*": "GPL" },
  Americas: { Brazil: "CBLOL", "*": "LLA" },
};
const LIGUES_MULTI = new Set([
  "Garena Premier League|SEA", "League of Legends SEA Tour|SEA", "SEA Tour|SEA",
  "Thailand Pro League|SEA", "Thailand Pro League 2015|SEA",
  "Mountain Dew Championship Series|SEA", "Vietnam Championship Series A|SEA",
  "Taiwan eSports League|SEA", "League of Legends Nova League|SEA",
  "League of Legends Championship of The Americas South|Americas",
]);
// Région d'une qualification régionale des Worlds, et territoire dominant d'une année.
const REGION_FAMILLE = {
  Korea: "LCK", China: "LPL", Europe: "LEC", EMEA: "LEC", "North America": "LCS", LMS: "LMS",
  Brazil: "CBLOL", Turkey: "TCL", CIS: "LCL", Vietnam: "VCS", Japan: "LJL", Oceania: "LCO",
  LAN: "LLA", LAS: "LLA", "Latin America": "LLA",
};
const SANS_TERRITOIRE = new Set(["International", "Wildcard", "Asia", "", null, undefined]);

const parTerritoire = (region, fiche) => PAR_TERRITOIRE[region]?.[fiche?.loc ?? ""] ?? PAR_TERRITOIRE[region]?.["*"] ?? null;
const familleDe = (e, fiche) => (LIGUES_MULTI.has(`${e.league}|${e.region}`)
  ? parTerritoire(e.region, fiche)
  : LIGUES.find(([l, r]) => l === e.league && r === e.region)?.[2] ?? null);
const estQualif = (e) => e.league === "World Championship" || /Regional Finals|World Championship\/Qualifiers/i.test(e.event ?? "");
const plusFort = (m) => [...m].sort((a, b) => b[1] - a[1])[0];

// Cinq niveaux de preuve, du plus direct au dernier recours.
function familleDeLAnnee(events, fiche) {
  // 1 — la qualification régionale des Worlds de l'année : la source dit d'où l'équipe sort.
  const q = new Map();
  for (const e of events) {
    if (!estQualif(e)) continue;
    const f = REGION_FAMILLE[e.region] ?? parTerritoire(e.region, fiche);
    if (f) q.set(f, (q.get(f) ?? 0) + e.games);
  }
  if (q.size) return { region: plusFort(q)[0], via: "qualification" };

  // 2 — la ligue domestique de niveau Primary.
  const ligues = new Map();
  const tournois = new Map();
  for (const e of events) {
    if (e.level !== "Primary") continue;
    const f = familleDe(e, fiche);
    if (!f) continue;
    ligues.set(f, (ligues.get(f) ?? 0) + e.games);
    tournois.set(f, (tournois.get(f) ?? 0) + 1);
  }
  const terr = new Map();
  for (const e of events) {
    if (SANS_TERRITOIRE.has(e.region) || estQualif(e)) continue;
    terr.set(e.region, (terr.get(e.region) ?? 0) + 1);
  }
  const dom = plusFort(terr);
  const familleDom = dom ? (REGION_FAMILLE[dom[0]] ?? parTerritoire(dom[0], fiche)) : null;
  if (ligues.size) {
    const best = [...ligues].sort((a, b) => (tournois.get(b[0]) - tournois.get(a[0])) || b[1] - a[1])[0][0];
    // Participation invitée dans une ligue étrangère : CLG Prime, CLG EU et Team WE ont tous
    // trois joué les Champions coréens de 2012 sans être coréens. Une poignée de tournois
    // contre une saison entière ailleurs, et c'est le territoire qui l'emporte.
    if (familleDom && familleDom !== best && dom[1] > tournois.get(best) * 2) {
      return { region: familleDom, via: `territoire ${dom[0]}` };
    }
    return { region: best, via: "ligue" };
  }

  // 3 — le territoire dominant, sur les seules ligues de niveau Primary : sans ce filtre, les
  // deux coupes européennes de Dark Passage en 2014 l'emporteraient sur ses cinq journées de TCL.
  const prim = new Map();
  for (const e of events) {
    if (e.level !== "Primary" || SANS_TERRITOIRE.has(e.region) || estQualif(e)) continue;
    prim.set(e.region, (prim.get(e.region) ?? 0) + 1);
  }
  const p = plusFort(prim);
  if (p) {
    const f = REGION_FAMILLE[p[0]] ?? parTerritoire(p[0], fiche);
    if (f) return { region: f, via: `territoire ${p[0]}` };
  }
  // 4 — tous niveaux confondus quand aucune ligue de premier niveau ne porte de région, mais
  // **seulement** si la fiche de l'organisation confirme : sans ce garde-fou, les dix coupes
  // européennes de GamingGear.eu en 2013 l'emporteraient sur sa région CIS, alors qu'elle
  // s'est qualifiée par le wildcard et n'a jamais joué l'EU LCS.
  if (!p && dom && fiche) {
    const vue = REGION_FAMILLE[fiche.region] ?? parTerritoire(fiche.region, fiche);
    if (vue && vue === familleDom) return { region: familleDom, via: `territoire ${dom[0]} hors Primary` };
  }
  // 5 — dernier recours : la région d'aujourd'hui. Signalée comme telle, à confirmer à la main.
  if (fiche) {
    const f = REGION_FAMILLE[fiche.region] ?? parTerritoire(fiche.region, fiche);
    if (f) return { region: f, via: `Teams.Region ${fiche.region}`, flag: true };
  }
  return { region: null, via: p || dom ? `aucune famille (${(p ?? dom)[0]})` : "aucun signal" };
}

async function fetchRegions(computed, outDir, lineage) {
  const { pagesOfCode, namesOfPage, fiches } = lineage;
  const codeOfName = new Map(); // nom d'équipe en minuscules → code de colonne
  for (const [code, pages] of pagesOfCode) {
    for (const page of pages) for (const name of namesOfPage.get(page) ?? [page]) codeOfName.set(low(name), code);
  }
  const ficheOfCode = new Map([...pagesOfCode].map(([code, pages]) => [code, [...pages].map((pg) => fiches.get(pg)).find(Boolean) ?? null]));
  const noms = [...new Set([...namesOfPage.values()].flatMap((set) => [...set]))];

  // Deux sources complémentaires : `ScoreboardTeams` compte les parties mais ne couvre pas
  // les tournois anciens, `TournamentResults` couvre les placements depuis 2011 sans compter
  // les parties. Un tournoi connu des seuls placements pèse 1.
  const byCodeYear = new Map();
  const vus = new Set();
  const ajouter = (code, year, e) => {
    const k = `${code}|${year}`;
    if (!byCodeYear.has(k)) byCodeYear.set(k, []);
    const ek = `${k}|${e.event}`;
    if (vus.has(ek)) return;
    vus.add(ek);
    byCodeYear.get(k).push(e);
  };
  const avaler = (rows) => {
    for (const r of rows) {
      const code = codeOfName.get(low(r.team));
      const year = Number(r.year) || Number(String(asText(r.start) ?? "").slice(0, 4)) || 0;
      if (!code || !year) continue;
      ajouter(code, year, {
        league: asText(r.league), region: asText(r.region), level: asText(r.level),
        event: asText(r.event), games: Number(r.games) || 1,
      });
    }
  };
  for (const chunk of chunks(noms, 25)) {
    avaler(await cargoAll({
      tables: "ScoreboardTeams=ST,Tournaments=T",
      join_on: "ST.OverviewPage=T.OverviewPage",
      fields: "ST.Team=team,T.OverviewPage=event,T.League=league,T.Region=region,T.TournamentLevel=level,T.Year=year,T.DateStart=start,COUNT(*)=games",
      where: `ST.Team IN (${sqlList(chunk)})`,
      group_by: "ST.Team,T.OverviewPage,T.League,T.Region,T.TournamentLevel,T.Year,T.DateStart",
    }));
    await sleep(THROTTLE_MS);
  }
  for (const chunk of chunks(noms, 40)) {
    avaler(await cargoAll({
      tables: "TournamentResults=TR,Tournaments=T",
      join_on: "TR.OverviewPage=T.OverviewPage",
      fields: "TR.Team=team,T.OverviewPage=event,T.League=league,T.Region=region,T.TournamentLevel=level,T.Year=year,T.DateStart=start",
      where: `TR.Team IN (${sqlList(chunk)})`,
    }));
    await sleep(THROTTLE_MS);
  }

  const out = new Map(); // année → code → { region, via, flag }
  for (const [year, teamsOfYear] of computed) {
    const byCode = {};
    for (const t of teamsOfYear.values()) {
      if (!t.code) continue;
      byCode[t.code] = familleDeLAnnee(byCodeYear.get(`${t.code}|${year}`) ?? [], ficheOfCode.get(t.code));
    }
    out.set(year, byCode);
  }
  await writeFile(join(outDir, "regions.json"), `${JSON.stringify({
    $comment: "Famille de region calculee pour chaque colonne, edition par edition, par la ligue reellement jouee cette annee-la. Cinq niveaux de preuve : qualification regionale des Worlds, ligue domestique de niveau Primary, territoire dominant sur les ligues Primary, territoire tous niveaux confirme par Teams.Region, puis Teams.Region en dernier recours. Voir la section 13 du rapport et docs/SOURCES.md.",
    regions: Object.fromEntries([...out].map(([y, e]) => [y, Object.fromEntries(Object.entries(e).map(([c, v]) => [c, v.region]))])),
    detail: Object.fromEntries(out),
  }, null, 1)}\n`);
  return out;
}

// ------------------------------------------------------- nom de ligue de chaque région

// Le sigle d'une région ne dit ni ce qu'est la ligue, ni où elle se joue. Le **nom** n'est
// nulle part dans /data et l'écrire de mémoire est exactement ce qu'interdit la règle absolue,
// même pour un libellé : il vient de `Leagues.League`, interrogé par `League_Short`.
//
// `Leagues.Region` arrive dans la même requête et n'est **pas** retenu pour la zone
// géographique de l'infobulle : il est circulaire sur LMS (« LMS »), approximatif sur LCP
// (« Asia Pacific »), et surtout faux pour la carte sur LPL (« China »), où `homeCountries`
// compte Taïwan et Hong Kong domestiques — l'infobulle contredirait le badge « importé »
// affiché à quelques pixels de là. La zone se dérive donc de `homeCountries`, sans collecte.
// Il est relevé ici pour trace, et pour que l'écart reste visible s'il change.
async function fetchLeagues(outDir) {
  const sigles = [...new Set(Object.values(PLAN_REGIONS))];
  const rows = await cargoAll({
    tables: "Leagues=L",
    fields: "L.League_Short=short,L.League=name,L.Region=region,L.IsOfficial=official",
    where: `L.League_Short IN (${sqlList(sigles)})`,
  });
  const out = new Map();
  for (const r of rows) {
    const short = asText(r.short);
    if (!short || !sigles.includes(short) || out.has(short)) continue;
    out.set(short, { name: asText(r.name), region: asText(r.region), official: asText(r.official) });
  }
  await writeFile(join(outDir, "leagues.json"), `${JSON.stringify({
    $comment: "Nom de chaque ligue derriere le sigle d'une region, depuis Leagues.League. `leagueNames` est a recopier dans data/teams.json. `region` est Leagues.Region, garde pour trace seulement : la zone geographique de l'infobulle se derive de homeCountries, pas de ce champ. Voir la section 15 du rapport.",
    leagueNames: Object.fromEntries(sigles.filter((s) => out.get(s)?.name).map((s) => [s, out.get(s).name])),
    detail: Object.fromEntries(out),
    manquants: sigles.filter((s) => !out.has(s)),
  }, null, 1)}\n`);
  return { sigles, noms: out };
}

// ------------------------------------------------- étapes de carrière hors Worlds (5-ii)

// Les quatre règles de docs/SOURCES.md décident d'une rangée de Worlds. La **règle 5** décide
// d'une étape hors Worlds, et c'est une règle de sélection distincte : club majoritaire en
// parties sur l'année, plus tout autre club atteignant 20 % des parties de l'année — le seuil
// déjà en vigueur pour les postes partagés, transposé de l'axe des postes à l'axe du temps.
//
// Deux tests de la source écartent ce qui n'est pas une étape de carrière, et aucun ne devine
// par motif de nom :
//
//  1. `Tournaments.TournamentLevel = 'Primary'` — écarte les ligues secondaires et les
//     académies (`Secondary`) comme les All-Star et les showmatchs (`Showmatch`). `IsOfficial`
//     ne peut pas servir : LMS, GPL, CBLOL et le LPL d'avant 2017 n'y sont pas marqués, et il
//     viderait des années entières — 144 joueur-années pour la seule 2016.
//  2. une fiche `Teams` est exigée — écarte les sélections nationales, que le niveau de
//     tournoi ne prend pas (les qualifications des Asian Games sont `Primary`), les sélections
//     régionales du KeSPA Cup et les équipes d'un soir de la Demacia Cup. Un club réel sans
//     fiche existe — `Flamengo Esports` — mais il a une colonne, et une entité déjà reliée à
//     une colonne n'est jamais écartée par ce test.
//
// Le périmètre d'affichage est l'**année-trou** : une année sans rangée de Worlds, située
// entre deux apparitions du joueur. Avant la première et après la dernière, le fil n'a rien à
// relier — ce sont les deux bouts de #7a, et `seen` porte ce qu'on en sait.
const SEUIL_ETAPE = 0.2;
const NIVEAU_ETAPE = "Primary";

// Sigle d'un club sans colonne. Le **même repli** que les codes de colonne — `Teams.Short` en
// ASCII majuscule sans ponctuation, tronqué à 5 caractères, voir l'en-tête de `TEAM_CODE` :
// dans « Autres équipes » le badge d'une colonne et celui d'un club se lisent côte à côte, et
// rien ne justifierait deux graphies. Sans ce sigle la carte affichait le **nom entier** du
// club dans un badge dimensionné pour trois lettres, et c'est le nom du joueur qui se faisait
// écraser en ellipse.
//
// Un club dont la fiche ne porte pas de `Short` exploitable n'en reçoit aucun : la case reste
// sans badge. On n'abrège pas de soi-même un nom d'équipe — ce serait inventer une donnée.
const REPLIS = { "Ø": "O", "ø": "o", "Ł": "L", "ł": "l" };
function sigleDe(short) {
  const s = String(short ?? "").normalize("NFD").replace(/\p{Mn}/gu, "")
    .replace(/[ØøŁł]/g, (c) => REPLIS[c]).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5);
  return /^[A-Z0-9]{2,5}$/.test(s) ? s : null;
}

async function fetchCareers({ selected, census, lineage, outDir, refresh }) {
  // nom d'équipe (toutes les graphies de la lignée) → code de colonne. C'est la lignée déjà
  // close par `fetchActive` : alias de `TeamRedirects`, prédécesseurs de `Teams.RenamedTo` et
  // `LIGNEES_ARBITREES`. Une étape n'a donc pas de table de lignée à elle.
  //
  // `Teams.OrganizationPage` n'est **pas** employée : elle rattacherait `SK Telecom T1 S` et
  // `Taipei Snipers` aux colonnes de leurs jumelles, et les académies à leur club principal —
  // ce qui défait la séparation que docs/SOURCES.md acte entre deux équipes d'une même
  // organisation. Les dix divergences mesurées sont dans la même section.
  const codeOfName = new Map();
  for (const [code, pages] of lineage.pagesOfCode) {
    for (const page of pages) {
      codeOfName.set(low(page), code);
      for (const name of lineage.namesOfPage.get(page) ?? []) codeOfName.set(low(name), code);
    }
  }

  // Apparitions aux Worlds, telles que le script vient de les calculer : ce sont elles qui
  // définissent les trous, et non `data/teams.json`, que § 7 confronte par ailleurs.
  const worlds = new Map(); // id de personne → Set d'années
  for (const s of selected) {
    if (!worlds.has(s.id)) worlds.set(s.id, new Set());
    worlds.get(s.id).add(s.year);
  }
  const trousDe = (id) => {
    const ys = [...worlds.get(id)].sort((a, b) => a - b);
    const out = [];
    for (let i = 1; i < ys.length; i++) for (let y = ys[i - 1] + 1; y < ys[i]; y++) out.push(y);
    return out;
  };

  const pages = [...new Set([...worlds.keys()].map((id) => census.get(id).page))];
  const cache = join(outDir, "raw", "careers.json");
  let brut = refresh ? null : await readFile(cache, "utf8").then(JSON.parse).catch(() => null);
  // Un cache partiel ne doit pas servir une exécution plus large : la même garde que pour
  // `resolvePeople`, le nombre de pages en moins ne se rattrapant pas en silence.
  if (!brut || !Array.isArray(brut.rows) || brut.pages !== pages.length) {
    const alias = new Map(); // alias en minuscules → page canonique
    for (const chunk of chunks(pages, CHUNK)) {
      const rows = await cargoAll({
        tables: "PlayerRedirects",
        fields: "PlayerRedirects.AllName=alias,PlayerRedirects.OverviewPage=target",
        where: `PlayerRedirects.OverviewPage IN (${sqlList(chunk)})`,
      });
      for (const r of rows) {
        const a = asText(r.alias);
        const t = asText(r.target);
        if (a && t) alias.set(low(a), t);
      }
      await sleep(THROTTLE_MS);
    }
    for (const p of pages) if (!alias.has(low(p))) alias.set(low(p), p);

    const noms = [...alias.keys()];
    const rows = [];
    const toutes = [];
    for (const chunk of chunks(noms, 60)) {
      for (const r of await cargoAll({
        tables: "ScoreboardPlayers=SP,Tournaments=T",
        join_on: "SP.OverviewPage=T.OverviewPage",
        fields: "SP.Link=link,SP.Team=team,YEAR(SP.DateTime_UTC)=year,COUNT(*)=games",
        where: `SP.Link IN (${sqlList(chunk)}) AND T.TournamentLevel='${NIVEAU_ETAPE}'`,
        group_by: "SP.Link,SP.Team,YEAR(SP.DateTime_UTC)",
      })) rows.push({ link: asText(r.link), team: asText(r.team), year: Number(r.year), games: Number(r.games) || 0 });
      await sleep(THROTTLE_MS);
      // Second passage, tous niveaux : il ne sert qu'à distinguer « aucune partie recensée »
      // d'« a joué, mais rien de recevable ». Sans lui, une année d'académie se dirait vide.
      for (const r of await cargoAll({
        tables: "ScoreboardPlayers=SP",
        fields: "SP.Link=link,YEAR(SP.DateTime_UTC)=year,COUNT(*)=games",
        where: `SP.Link IN (${sqlList(chunk)})`,
        group_by: "SP.Link,YEAR(SP.DateTime_UTC)",
      })) toutes.push({ link: asText(r.link), year: Number(r.year), games: Number(r.games) || 0 });
      await sleep(THROTTLE_MS);
    }
    brut = { pages: pages.length, alias: Object.fromEntries(alias), rows, toutes };
    await writeFile(cache, `${JSON.stringify(brut)}\n`);
  }
  const alias = new Map(Object.entries(brut.alias));
  const pageOfLink = (l) => alias.get(low(l)) ?? String(l);
  const idOfPage = new Map();
  for (const id of worlds.keys()) idOfPage.set(low(census.get(id).page), id);

  // --- fiche `Teams` de chaque entité rencontrée : second test du filtre de bruit.
  const noms = [...new Set(brut.rows.map((r) => r.team).filter(Boolean))];
  const pageOfTeam = new Map();
  for (const chunk of chunks(noms, CHUNK)) {
    const rows = await cargoAll({
      tables: "TeamRedirects",
      fields: "TeamRedirects.AllName=alias,TeamRedirects._pageName=page",
      where: `TeamRedirects.AllName IN (${sqlList(chunk)})`,
    });
    for (const r of rows) if (r.alias && r.page) pageOfTeam.set(low(r.alias), String(r.page));
    await sleep(THROTTLE_MS);
  }
  const pageDe = (nom) => pageOfTeam.get(low(nom)) ?? String(nom);
  const fiches = new Map();
  for (const chunk of chunks([...new Set(noms.map(pageDe))], CHUNK)) {
    const rows = await cargoAll({
      tables: "Teams",
      // `Short` sert au badge des clubs sans colonne, pas au filtre de bruit : la fiche est
      // déjà interrogée pour `estClub`, un champ de plus ne coûte aucune requête.
      fields: "Teams.OverviewPage=page,Teams.Name=name,Teams.Short=short,Teams.Region=region",
      where: `Teams.OverviewPage IN (${sqlList(chunk)})`,
    });
    for (const r of rows) {
      const page = asText(r.page);
      if (page) fiches.set(low(page), { name: asText(r.name), short: asText(r.short), region: asText(r.region) });
    }
    await sleep(THROTTLE_MS);
  }
  const codeDe = (nom) => codeOfName.get(low(nom)) ?? codeOfName.get(low(pageDe(nom))) ?? null;
  const estClub = (nom) => fiches.has(low(pageDe(nom))) || Boolean(codeDe(nom));

  // --- parties par personne, année et club, filtre de bruit appliqué.
  const ecartees = new Map(); // entité sans fiche → parties, pour trace dans le rapport
  const parAnnee = new Map(); // id → Map(année → Map(club → parties))
  for (const r of brut.rows) {
    const id = idOfPage.get(low(pageOfLink(r.link)));
    if (!id || !r.team || !r.year) continue;
    if (!estClub(r.team)) {
      const k = pageDe(r.team);
      ecartees.set(k, (ecartees.get(k) ?? 0) + r.games);
      continue;
    }
    if (!parAnnee.has(id)) parAnnee.set(id, new Map());
    const an = parAnnee.get(id);
    if (!an.has(r.year)) an.set(r.year, new Map());
    const m = an.get(r.year);
    m.set(r.team, (m.get(r.team) ?? 0) + r.games);
  }
  const toutesParties = new Map(); // `id|année` → parties, tous niveaux
  for (const r of brut.toutes ?? []) {
    const id = idOfPage.get(low(pageOfLink(r.link)));
    if (!id || !r.year) continue;
    const k = `${id}|${r.year}`;
    toutesParties.set(k, (toutesParties.get(k) ?? 0) + r.games);
  }

  // --- règle 5, année par année.
  const careers = {};
  const sansColonne = new Map(); // club sans colonne → { n: étapes, sigle }
  const horsNiveau = []; // années-trous où le joueur a joué, mais rien de niveau `Primary`
  const creuses = []; // années-trous sans la moindre partie : l'état c des libellés
  const ids = [...worlds.keys()].sort((a, b) => low(census.get(a).spelling).localeCompare(low(census.get(b).spelling)));
  for (const id of ids) {
    const nom = census.get(id).spelling;
    const an = parAnnee.get(id) ?? new Map();
    const annees = [...an.keys()].sort((a, b) => a - b);
    const trous = trousDe(id);
    if (!trous.length && !annees.length) continue;
    const fiche = { seen: annees.length ? [annees[0], annees.at(-1)] : null, years: {} };
    for (const y of trous) {
      const m = an.get(y);
      if (!m || !m.size) {
        // Une année-trou creuse n'est « aucune partie professionnelle recensée » que si le
        // joueur n'a joué nulle part. S'il a des parties hors niveau `Primary` — académie,
        // ligue secondaire, showmatch — on ne sait rien de recevable : on le marque, et on
        // n'écrit surtout pas qu'il n'a pas joué.
        const ailleurs = (toutesParties.get(`${id}|${y}`) ?? 0) > 0;
        fiche.years[y] = ailleurs ? { steps: [], offLevel: true } : { steps: [] };
        (ailleurs ? horsNiveau : creuses).push(`**${nom} ${y}**`);
        continue;
      }
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      const tri = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const steps = [];
      for (const [club, g] of tri) {
        if (steps.length && g / total < SEUIL_ETAPE) continue;
        const code = codeDe(club);
        if (code) { steps.push({ team: code }); continue; }
        const f = fiches.get(low(pageDe(club)));
        const label = f?.name ?? pageDe(club);
        if (steps.some((s) => s.club === label)) continue; // deux graphies d'un même club
        steps.push({ club: label });
        const vu = sansColonne.get(label) ?? { n: 0, sigle: sigleDe(f?.short) };
        vu.n += 1;
        sansColonne.set(label, vu);
      }
      fiche.years[y] = { steps };
    }
    careers[nom] = fiche;
  }

  // Sigle de chaque club sans colonne, une entrée par club et non une par étape : c'est un
  // libellé d'affichage, il n'a aucune raison d'être répété dans chaque `steps`.
  const clubs = Object.fromEntries([...sansColonne]
    .filter(([, v]) => v.sigle)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([nom, v]) => [nom, v.sigle]));

  await writeFile(join(outDir, "careers.json"), `${JSON.stringify({
    $comment: "Étapes de carrière hors Worlds calculées par scripts/fetch-worlds.mjs (règle 5 de docs/SOURCES.md) : club majoritaire de l'année, plus tout autre club à 20 % des parties ou plus, sur les seuls tournois de niveau Primary et les seules entités ayant une fiche Teams. Une année n'y figure que si elle est un trou entre deux apparitions aux Worlds. `seen` donne la première et la dernière année où une partie est recensée. `clubs` donne le sigle des clubs sans colonne, replié depuis Teams.Short comme un code de colonne — c'est le badge de leur case dans « Autres équipes ». À recopier dans data/careers.json. Voir § 14 du rapport.",
    clubs,
    careers,
  }, null, 1)}\n`);

  return {
    careers,
    clubs,
    sansColonne: [...sansColonne].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0])),
    ecartees: [...ecartees].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    horsNiveau, creuses,
  };
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
//
// Deux champs de pays, et c'est le second qui compte : `Country` est le pays de
// **naissance**, `NationalityPrimary` la **nationalité** — Biofrost est canadien né en
// Chine, Huhi américain né en France. C'est la nationalité que `data/players.json`
// enregistre, puisque c'est elle qui décide si un joueur est importé dans sa région
// (docs/SOURCES.md, section « Nationalités »). Les deux sont relevés : le rapport signale
// les joueurs chez qui ils diffèrent.
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
      fields: "Players.OverviewPage=page,Players.ID=id,Players.Name=name,Players.Country=country,Players.NationalityPrimary=nationality",
      where: `Players.OverviewPage IN (${sqlList(chunk)})`,
    });
    for (const r of rows) {
      const page = asText(r.page);
      if (page) {
        info.set(low(page), {
          id: asText(r.id), fullName: asText(r.name),
          country: asText(r.country), nationality: asText(r.nationality),
        });
      }
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
      nationality: fiche?.nationality ?? null,
      known: Boolean(fiche),
    });
  }
  await writeFile(cache, `${JSON.stringify(Object.fromEntries(out), null, 1)}\n`);
  return out;
}

// ------------------------------------------------------- recensement des personnes

// Une personne = une page canonique Leaguepedia. La règle 4 — une personne, une graphie,
// partout — se décide sur l'ensemble des 16 éditions, pas édition par édition : `Caps`
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
          country: res?.country ?? null, nationality: res?.nationality ?? null, known: Boolean(res?.known),
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
    if (!teams.has(r.team)) teams.set(r.team, { lpName: r.team, gameIds: new Set(), players: new Map(), pages: new Set(), stages: new Set() });
    const team = teams.get(r.team);
    team.gameIds.add(r.gid);
    team.pages.add(r.page);
    // Nom du tour, pour que `fetchPlaces` distingue les groupes de la ronde suisse.
    if (!/\/Play-In$/i.test(r.page ?? "")) team.stages.add(roundOf(r.gid) ?? "?");

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
    const detail = { code, lpName: team.lpName, games, threshold: limit, pages: [...team.pages].sort(), stages: [...team.stages], roles: {}, issues: [] };

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

    // Arbitrage de poste : il s'applique après coup, les règles 1 et 2 ayant déjà parlé.
    const forcedRoles = POSTES_ARBITRES[`${year} ${code}`];
    for (const [role, wanted] of Object.entries(forcedRoles ?? {})) {
      const r = detail.roles[role];
      if (!r) { detail.issues.push({ kind: "arbitrage-inapplicable", text: `${role} : POSTES_ARBITRES désigne un poste sans aucune ligne` }); continue; }
      if (Object.hasOwn(wanted, "starter")) {
        const c = r.candidates.find((x) => x.id === wanted.starter);
        if (!c) { detail.issues.push({ kind: "arbitrage-inapplicable", text: `${role} : POSTES_ARBITRES impose \`${wanted.starter}\`, qui n'a joué aucune partie à ce poste` }); continue; }
        detail.issues.push({ kind: "poste-arbitre", text: `${role} : ${c.spelling} imposé titulaire à la place de ${r.starter.spelling} (${c.games}/${games}, ${pct(c.share)}, poste majoritaire ${c.majorityRole})` });
        r.starter = c;
        if (r.second?.id === c.id) r.second = null;
      }
      if (Object.hasOwn(wanted, "second")) {
        if (wanted.second === null) {
          if (r.second) detail.issues.push({ kind: "poste-arbitre", text: `${role}* : ${r.second.spelling} retiré de la rotation, arbitré sur un autre poste` });
          r.second = null;
        } else {
          const c = r.candidates.find((x) => x.id === wanted.second);
          if (!c) { detail.issues.push({ kind: "arbitrage-inapplicable", text: `${role}* : POSTES_ARBITRES impose \`${wanted.second}\`, qui n'a joué aucune partie à ce poste` }); continue; }
          detail.issues.push({ kind: "poste-arbitre", text: `${role}* : ${c.spelling} imposé en rotation` });
          r.second = c;
        }
      }
    }

    // Un joueur ne peut pas tenir deux postes d'une même rangée : le modèle de la carte en
    // fait une case, et `npm run validate` refuse le doublon. Signalé, jamais corrigé en
    // silence — l'arbitrage revient à `POSTES_ARBITRES`.
    const held = new Map();
    for (const role of ROLES) {
      for (const [slot, c] of [["lineup", detail.roles[role]?.starter], ["shared", detail.roles[role]?.second]]) {
        if (!c) continue;
        const was = held.get(c.id);
        if (was) {
          detail.issues.push({
            kind: "joueur-sur-deux-postes",
            text: `${c.spelling} occupe deux postes de la rangée (${was} et ${role} ${slot}) ; à trancher dans POSTES_ARBITRES`,
          });
        } else held.set(c.id, `${role} ${slot}`);
      }
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
    // `PLAN_ALIASES` fait foi sur le nom d'époque ; le `name` n'est écrit que s'il diffère
    // du nom de colonne, comme dans data/teams.json aujourd'hui.
    const name = PLAN_ALIASES[code]?.[year] ?? PLAN_TEAM_NAMES[code] ?? t.lpName;
    const entry = {};
    if (name !== PLAN_TEAM_NAMES[code]) entry.name = name;
    entry.lineup = {};
    const shared = {};
    const split = [];
    const aliases = {};
    for (const role of ROLES) {
      const r = t.roles[role];
      if (!r) continue;
      entry.lineup[role] = r.starter.spelling;
      if (r.second) shared[role] = r.second.spelling;
      if (r.second?.qualified) split.push(role);
      // Pseudo porté à l'époque, quand il diffère de la graphie retenue : la rangée l'affiche,
      // l'identité du joueur restant la graphie canonique, pour un fil de carrière continu.
      for (const c of [r.starter, r.second]) {
        if (!c) continue;
        const era = eraSpelling(census.get(c.id), year);
        if (era && era !== c.spelling) aliases[c.spelling] = era;
      }
    }
    if (Object.keys(shared).length) entry.shared = shared;
    // `split` liste les postes réellement coupés en deux demi-cases, c'est-à-dire ceux dont
    // le second joueur franchit le seuil. Un second resté sous le seuil reste dans `shared`
    // sans entrer ici : sa case porte la marque `*`. Sans ce champ les fragments du lot 4
    // auraient dû être complétés à la main sur 33 colonnes.
    if (split.length) entry.split = split;
    if (Object.keys(aliases).length) entry.aliases = aliases;
    frag[code] = entry;
  }
  return {
    $comment: `Fragment Worlds ${year} produit par scripts/fetch-worlds.mjs. "name" suit la table PLAN_ALIASES et n'est présent que s'il diffère du nom de colonne. "shared" porte le second joueur, qu'il franchisse ou non le seuil de 20 %, et "split" les seuls postes dont ce second joueur franchit le seuil, donc coupés en deux demi-cases. "aliases" associe une graphie canonique au pseudo porté cette année-là. Voir detail/${year}.json et report.md.`,
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
        }
        // Poste coupé en deux demi-cases : le champ `split` de la rangée doit lister
        // exactement les postes dont le second joueur franchit le seuil.
        const wasSplit = (entry.split ?? []).includes(role);
        const nowSplit = Boolean(r.second?.qualified);
        if (wasSplit !== nowSplit) {
          diffs.push({
            year, code: t.code, kind: "demi-case",
            text: nowSplit
              ? `${role} : ${r.second.spelling} franchit le seuil (${r.second.games}/${t.games}, ${pct(r.second.share)}) ; le poste doit figurer dans "split"`
              : `${role} : teams.json met le poste dans "split", mais ${wasShared ?? "le second joueur"} reste sous le seuil${r.second ? ` (${r.second.games}/${t.games}, ${pct(r.second.share)})` : ""} ; la marque * suffit`,
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

function renderReport({ years, computed, pageCheck, census, collisions, nearCollisions, eraCandidates, caseIssues, diffs, activeWindows, places, regions, leagues, careers, teamsData, resultsData, careersData, notes, gameCounts }) {
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

  // Fenêtres d'activité : calculé contre saisi. Une colonne nouvelle n'a pas encore de
  // valeur saisie — elle n'est donc pas un écart, mais une valeur à reporter.
  const stored = new Map(teamsData.teams.map((t) => [t.code, t]));
  const activeDiffs = [];
  const activeNew = [];
  for (const [code, w] of activeWindows) {
    const team = stored.get(code);
    const calc = w.active ? `[${w.active.join(", ")}]` : "—";
    if (!team) { activeNew.push({ code, calc, w }); continue; }
    const saisi = team.active ? `[${team.active.join(", ")}]` : "—";
    if (saisi !== calc) activeDiffs.push({ code, saisi, calc, w });
  }

  // Parcours : calculé contre saisi. `F*` — qualifié pour une finale pas encore jouée — ne
  // peut pas être calculé : le classement de Leaguepedia n'est pas encore attribué.
  const placeDiffs = [];
  const placeNew = [];
  for (const [year, byCode] of places.places) {
    for (const [code, v] of Object.entries(byCode)) {
      const was = resultsData.results?.[String(year)]?.[code] ?? null;
      if (!was) { placeNew.push({ year, code, ...v }); continue; }
      if (was === v.label) continue;
      if (was.endsWith("*")) continue; // finale non jouée, arbitrage à la main
      placeDiffs.push({ year, code, was, ...v });
    }
  }

  // Région calculée contre région arrêtée par `PLAN_REGIONS`. Une rangée dont la région
  // calculée diffère est soit une erreur de la table, soit une organisation qui a changé de
  // ligue — et il faut alors décider quelle famille garde la colonne.
  const regionDiffs = [];
  const regionFlags = [];
  for (const [year, byCode] of regions) {
    for (const [code, v] of Object.entries(byCode)) {
      if (v.flag) regionFlags.push({ year, code, ...v });
      const plan = PLAN_REGIONS[code] ?? null;
      if (!plan) { regionDiffs.push({ year, code, plan: "—", ...v }); continue; }
      if (v.region !== plan) regionDiffs.push({ year, code, plan, ...v });
    }
  }

  // Étapes de carrière : calculé contre saisi. Même principe que les fenêtres et les
  // parcours — le script ne touche pas `/data`, il dit ce qui diverge.
  const etape = (st) => (st.team ? st.team : `« ${st.club} »`);
  const signature = (e) => (e?.steps?.length ? e.steps.map(etape).join(" + ") : e?.offLevel ? "hors niveau" : "aucune partie");
  const careerNew = [];
  const careerDiffs = [];
  let careerYears = 0;
  let careerSteps = 0;
  if (!careers.partiel) {
    const saisies = careersData.careers ?? {};
    for (const [nom, calc] of Object.entries(careers.careers)) {
      careerYears += Object.keys(calc.years).length;
      careerSteps += Object.values(calc.years).reduce((n, e) => n + e.steps.length, 0);
      const was = saisies[nom];
      if (!was) { careerNew.push({ nom, calc }); continue; }
      const vu = `[${(was.seen ?? []).join(", ")}]`;
      const vc = `[${(calc.seen ?? []).join(", ")}]`;
      if (vu !== vc) careerDiffs.push({ nom, text: `\`seen\` saisi ${vu}, calculé ${vc}` });
      const annees = [...new Set([...Object.keys(was.years ?? {}), ...Object.keys(calc.years)])].sort();
      for (const y of annees) {
        const a = (was.years ?? {})[y];
        const b = calc.years[y];
        if (!a) { careerDiffs.push({ nom, text: `${y} manquante — calculé ${signature(b)}` }); continue; }
        if (!b) { careerDiffs.push({ nom, text: `${y} saisie (${signature(a)}) sans trou correspondant` }); continue; }
        if (signature(a) !== signature(b)) careerDiffs.push({ nom, text: `${y} — saisi ${signature(a)}, calculé ${signature(b)}` });
      }
    }
    for (const nom of Object.keys(saisies)) {
      if (!careers.careers[nom]) careerDiffs.push({ nom, text: "saisi dans careers.json sans carrière calculée — joueur absent des lineups ?" });
    }
    // La table `clubs` tombe dans le même § 14.2 que les étapes : c'est une valeur calculée
    // puis recopiée à la main, elle relève du même invariant de contrôle.
    const sigles = careersData.clubs ?? {};
    for (const nom of [...new Set([...Object.keys(sigles), ...Object.keys(careers.clubs)])].sort()) {
      const a = sigles[nom], b = careers.clubs[nom];
      if (a === b) continue;
      if (!a) careerDiffs.push({ nom, text: `sigle de club manquant — calculé \`${b}\`` });
      else if (!b) careerDiffs.push({ nom, text: `sigle de club \`${a}\` saisi, sans club sans colonne correspondant` });
      else careerDiffs.push({ nom, text: `sigle de club saisi \`${a}\`, calculé \`${b}\`` });
    }
  }

  // Noms de ligue : calculé contre saisi. Un sigle sans nom saisi est une valeur à reporter,
  // pas un écart ; un sigle que `Leagues` ne connaît pas est un écart, le validateur exigeant
  // un nom pour chaque région.
  const leagueNew = [];
  const leagueDiffs = [];
  const storedNames = teamsData.leagueNames ?? {};
  for (const short of leagues.sigles) {
    const calc = leagues.noms.get(short)?.name ?? null;
    const saisi = storedNames[short] ?? null;
    if (!calc) { leagueDiffs.push({ short, text: `aucune ligne \`Leagues\` pour ce sigle — nom saisi « ${saisi ?? "—"} » invérifiable` }); continue; }
    if (!saisi) { leagueNew.push({ short, calc }); continue; }
    if (saisi !== calc) leagueDiffs.push({ short, text: `teams.json « ${saisi} », calculé « ${calc} »` });
  }
  for (const short of Object.keys(storedNames)) {
    if (!leagues.sigles.includes(short)) leagueDiffs.push({ short, text: "saisi dans teams.json sans région correspondante" });
  }

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
  L.push(`Règles appliquées : seuil de ${pct(THRESHOLD)} des parties de l'équipe, poste majoritaire, deux joueurs au maximum par poste — voir \`docs/SOURCES.md\`.`);

  h(2, "Résumé");
  const sections = [
    ["1", "Table année → OverviewPage", pageCheck.empty.length + pageCheck.excluded.length + pageCheck.uncovered.length + pageCheck.regional.length],
    ["2", "Égalités strictes", issuesOf("egalite").length],
    ["3", "Troisièmes joueurs au-dessus du seuil", issuesOf("troisieme-au-dessus-du-seuil").length],
    ["4", "Postes sans titulaire qualifié ou majorité indécidable", issuesOf("sans-titulaire-qualifie").length + issuesOf("poste-vide").length + issuesOf("majorite-ambigue").length + issuesOf("joueur-sur-deux-postes").length],
    ["5", "Collisions de pseudo", collisions.length, `${nearCollisions.length} en veille`],
    ["6", "Divergences de casse", caseIssues.filter((c) => c.kind === "leaguepedia" || c.kind === "data").length, `${eraCandidates.length} pseudo(s) d'époque à qualifier`],
    ["7", "Écarts avec les lineups saisies", diffs.length],
    ["8", "Noms d'équipe face à la table d'alias", aliasRows.length],
    ["9", "Rotations non retenues et échanges de poste", issuesOf("rotation-non-retenue").length + issuesOf("echange-de-poste").length],
    ["10", "Équipes hors périmètre", outOfScope.size],
    ["11", "Fenêtres d'activité", activeDiffs.length, `${activeWindows.size} colonnes`],
    ["12", "Parcours des équipes", placeDiffs.length, `${placeNew.length} à reporter`],
    ["13", "Région de chaque rangée", regionDiffs.length, `${regionFlags.length} par dernier recours`],
    ["15", "Noms de ligue", leagueDiffs.length, `${leagueNew.length} à reporter`],
  ];
  L.push("| § | Sujet | Cas |", "|---|---|---|");
  for (const [n, name, count, note] of sections) L.push(`| ${n} | ${name} | ${count}${note ? ` (${note})` : ""} |`);

  h(2, "1. Table année → OverviewPage");
  L.push("Table confrontée, à chaque exécution, à la table `Tournaments` et aux pages qui portent réellement des lignes de scoreboard. De 2011 à 2016 une édition tient sur une seule page ; les dix suivantes se répartissent sur deux sous-pages chacune, et leur page parente ne porte aucune partie — aucun double comptage.");
  L.push("");
  L.push("| Année | Pages retenues | Parties | Lignes |", "|---|---|---|---|");
  for (const year of years) {
    const pages = pageCheck.covered.get(year) ?? [];
    L.push(`| ${year} | ${pages.map((p) => `\`${p.page}\``).join("<br>") || "**aucune**"} | ${gameCounts.get(year) ?? 0} | ${pages.reduce((n, p) => n + p.rows, 0)} |`);
  }
  if (pageCheck.empty.length) {
    L.push("", `**Éditions sans aucune partie : ${pageCheck.empty.join(", ")}. La table \`PAGES\` est à corriger.**`);
  }
  const avalees = pageCheck.regional.filter((r) => r.rows > 0);
  L.push("", "**Qualifications régionales vivant sous le préfixe d'une édition** — le `LIKE` qui agrège les phases d'une édition les avalerait. Contrôle nommé, et non déduit de leur vacuité : une ligne de scoreboard ajoutée un jour sur l'une d'elles deviendrait une erreur silencieuse.", "");
  list(
    pageCheck.regional.map((r) => `**${r.year}** \`${r.page}\` — région ${r.region}, ${r.rows} ligne(s)${r.rows ? " **à exclure : ces parties entrent aujourd'hui dans la lineup**" : ", sans effet sur la collecte"}`),
    "aucune.",
  );
  if (avalees.length) {
    L.push("", `**${avalees.length} page(s) de qualification portent des lignes de scoreboard et sont comptées dans l'édition. Le préfixe \`LIKE\` ne suffit plus : il faut filtrer ces sous-pages dans \`fetchYear\`.**`);
  }
  L.push("", "**Pages de ligue « World Championship » écartées volontairement** — dans l'horizon 2011–2026, hors préfixe retenu. À confirmer : leurs parties ne doivent pas compter dans une lineup des Worlds.", "");
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
  L.push("", "**Joueurs placés sur deux postes d'une même rangée** — le modèle en fait une case et `npm run validate` refuse le doublon. Chaque cas est à trancher dans `POSTES_ARBITRES` ; le script ne corrige rien de lui-même.", "");
  list(issuesOf("joueur-sur-deux-postes"), "aucun cas.");
  L.push("", "**Postes arbitrés** — figés dans `POSTES_ARBITRES`.", "");
  list([...issuesOf("poste-arbitre"), ...issuesOf("arbitrage-inapplicable")], "aucun.");

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
  L.push("Règle 4 : une personne, une graphie, dans tout le jeu de données. La graphie proposée est la plus employée sur l'ensemble des 16 éditions ; à égalité, le titre de page Leaguepedia actuel.");
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
    ["demi-case", "Postes coupés en demi-cases divergents"],
    ["nom", "Noms d'équipe — la table d'alias fait foi, pour trace"],
  ];
  kinds.forEach(([kind, title], i) => {
    const items = diffs.filter((d) => d.kind === kind);
    h(3, `7.${i + 1} ${title} (${items.length})`);
    list(items.map((d) => `**${d.year} ${d.code}** — ${d.text}`), "aucun écart.");
  });

  h(2, "8. Noms d'équipe face à la table d'alias");
  L.push("`PLAN_ALIASES` fait foi (arbitrage du 11/11/2026) : Leaguepedia normalise ses noms d'équipe. Liste tenue pour trace, rien à trancher — c'est l'alias de la table qui est écrit dans les fragments. Justifications dans `docs/SOURCES.md`, section « Noms de colonne et doubles équipes d'une même organisation ».");
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

  h(2, "11. Fenêtres d'activité");
  L.push("Première et dernière partie de chaque organisation sur Leaguepedia, toutes compétitions confondues, calculées sur toute la lignée de pages du wiki : alias de `TeamRedirects`, prédécesseurs de `Teams.RenamedTo` — jamais ses successeurs, qui mènent à l'organisation ayant repris la suite — et `LIGNEES_ARBITREES` pour ce qu'aucun des deux ne relie. Une page qui est elle-même une colonne n'est jamais absorbée : `Clutch Gaming` et `Dignitas` gardent chacune la sienne. La borne de fin n'est posée que si **toutes** ces pages portent `IsDisbanded`.");
  L.push("", "**La borne de début est un minorant.** Une page de lignée hors de portée des trois chemins fait commencer la fenêtre trop tard : c'est pourquoi le rapport signale l'écart au lieu de remplacer la valeur saisie. Élargir une fenêtre se fait à la main, en inscrivant la page manquante dans `LIGNEES_ARBITREES` avec sa raison.");
  h(3, `11.1 Colonnes sans fenêtre saisie (${activeNew.length})`);
  L.push("Valeur à reporter dans `data/teams.json`.", "");
  list(activeNew.map((a) => `**${a.code}** — \`active\`: ${a.calc}${a.w.disbanded ? " (organisation dissoute : borne de fin posée)" : " (organisation en activité : fenêtre ouverte)"}, ${a.w.games} parties, pages ${a.w.pages.map((x) => `\`${x}\``).join(" + ")}`), "aucune.");
  h(3, `11.2 Écarts avec les fenêtres saisies (${activeDiffs.length})`);
  list(activeDiffs.map((a) => `**${a.code}** — teams.json ${a.saisi}, calculé ${a.calc} (première partie ${a.w.first ?? "—"}, dernière ${a.w.last ?? "—"}, pages ${a.w.pages.map((x) => `\`${x}\``).join(" + ")})`), "aucun écart.");

  h(2, "12. Parcours des équipes");
  L.push("`TournamentResults.Place` sur la page de l'édition, traduit en libellé de `data/results.json` : 1 → W, 2 → F, 3-4 → SF, 5-8 → QF, puis **P** si tous les scoreboards de l'équipe sont sur la page `…/Play-In`, sinon **G** ou **S** selon que les tours du Main Event s'appellent `Day 1`…`Day 8` ou `Round 1`…`Round 5`.");
  L.push("", "Un rang encore sans équipe — les deux finalistes d'une édition en cours — ne donne aucun libellé : c'est le `F*` de `data/results.json`, qui reste posé à la main et que cette section ne compte pas comme un écart.");
  h(3, `12.1 Parcours à reporter (${placeNew.length})`);
  list(placeNew.map((a) => `**${a.year} ${a.code}** — \`${a.label}\` (rang ${a.place}, ${a.how})`), "aucun.");
  h(3, `12.2 Écarts avec les parcours saisis (${placeDiffs.length})`);
  list(placeDiffs.map((a) => `**${a.year} ${a.code}** — results.json \`${a.was}\`, calculé \`${a.label}\` (rang ${a.place}, ${a.how})`), "aucun écart.");

  h(2, "13. Région de chaque rangée");
  L.push("La règle de périmètre de `docs/SOURCES.md` appliquée rangée par rangée : la famille de région vient de la **ligue réellement jouée l'année de l'édition**, jamais de `Teams.Region`, qui donne celle de l'organisation aujourd'hui. Cinq niveaux de preuve, du plus direct au dernier recours — qualification régionale des Worlds, ligue domestique de niveau `Primary`, territoire dominant sur les ligues `Primary`, territoire tous niveaux confirmé par `Teams.Region`, puis `Teams.Region` seule.");
  L.push("", "`PLAN_REGIONS` est la décision, ce calcul en est le contrôle. Une divergence est soit une erreur de la table, soit une organisation qui a changé de ligue : il faut alors décider quelle famille garde la colonne, le modèle n'en portant qu'une par colonne.");
  h(3, `13.1 Divergences avec PLAN_REGIONS (${regionDiffs.length})`);
  list(regionDiffs.map((d) => `**${d.year} ${d.code}** — table \`${d.plan}\`, calculé \`${d.region ?? "—"}\` (${d.via})`), "aucune divergence.");
  h(3, `13.2 Rangées classées par dernier recours (${regionFlags.length})`);
  L.push("`Teams.Region` donne la région d'aujourd'hui, pas celle de l'édition : chacune de ces rangées est à confirmer à la main.", "");
  list(regionFlags.map((d) => `**${d.year} ${d.code}** — \`${d.region}\` d'après ${d.via}`), "aucune.");

  h(2, "14. Étapes de carrière hors Worlds");
  if (careers.partiel) {
    L.push("_Exécution partielle : les étapes ne sont pas calculées. Un trou se mesure entre deux apparitions, et une collecte sur une partie des éditions en inventerait autant qu'elle en cacherait._");
  } else {
    L.push("La **règle 5** de `docs/SOURCES.md`, distincte des quatre règles des Worlds : club majoritaire en parties sur l'année, plus tout autre club à 20 % des parties ou plus. Deux tests de la source écartent ce qui n'est pas une étape de carrière — `Tournaments.TournamentLevel = 'Primary'`, puis l'existence d'une fiche `Teams`. Une entité déjà reliée à une colonne n'est jamais écartée par le second.");
    L.push("", "Seules les **années-trous** sont écrites : une année sans rangée de Worlds située entre deux apparitions du joueur. Avant la première et après la dernière, le fil n'a rien à relier — c'est `seen` qui porte ce qu'on en sait, et les deux bouts de #7a qui l'affichent.");
    L.push("", `**${Object.keys(careers.careers).length} joueurs, ${careerYears} années-trous, ${careerSteps} étapes.**`);
    h(3, `14.1 Carrières à reporter (${careerNew.length})`);
    L.push("Valeur à recopier depuis `careers.json` dans `data/careers.json`.", "");
    list(careerNew.map((c) => `**${c.nom}** — ${Object.entries(c.calc.years).map(([y, e]) => `${y} ${signature(e)}`).join(" · ") || "aucune année-trou"}`), "aucune.");
    h(3, `14.2 Écarts avec les étapes saisies (${careerDiffs.length})`);
    list(careerDiffs.map((d) => `**${d.nom}** — ${d.text}`), "aucun écart.");
    h(3, `14.3 Années-trous sans étape (${careers.creuses.length + careers.horsNiveau.length})`);
    L.push("Deux états à ne pas confondre. **Aucune partie recensée** est le seul qui autorise le libellé « aucune partie professionnelle recensée » ; **hors niveau** veut dire que le joueur a joué, mais seulement en académie, en ligue secondaire ou en showmatch — on ne sait alors rien de recevable, et la carte n'en dit rien.", "");
    L.push("**Aucune partie recensée**", "");
    list(careers.creuses, "aucune.");
    L.push("", "**Hors niveau `Primary`**", "");
    list(careers.horsNiveau, "aucune.");
    h(3, `14.4 Clubs traversés sans colonne (${careers.sansColonne.length})`);
    L.push("Ils vont dans « Autres équipes », avec pour badge le **sigle** replié depuis `Teams.Short` comme un code de colonne — la table `clubs` de `careers.json`, à recopier dans `data/careers.json`. Un club dont la fiche n'en porte pas d'exploitable est marqué « sans sigle » et sa case reste sans badge : on n'abrège pas un nom d'équipe de soi-même. Listés aussi pour qu'aucun ne soit en réalité une colonne que la lignée n'aurait pas reliée.", "");
    list(careers.sansColonne.map(([nom, v]) => `\`${v.sigle ?? "— sans sigle —"}\` ${nom} (${v.n})`), "aucun.");
    h(3, `14.5 Entités écartées faute de fiche Teams (${careers.ecartees.length})`);
    L.push("Second test du filtre de bruit, avec leurs parties de niveau `Primary`. Toutes doivent être des sélections ou des équipes d'un soir : un club réel qui apparaîtrait ici est à inscrire comme colonne ou à relier par `LIGNEES_ARBITREES`.", "");
    list(careers.ecartees.map(([nom, n]) => `${nom} (${n} parties)`), "aucune.");
  }

  h(2, "15. Noms de ligue");
  L.push("`Leagues.League` interrogé par `League_Short` : le nom qui se lit au survol du sigle d'une région, dans le tiroir de filtres. Le sigle seul ne disait ni ce qu'est la ligue, ni où elle se joue.");
  L.push("", "C'est le nom de la ligue **aujourd'hui**, alors qu'une famille de colonnes couvre seize ans — la LEC s'est appelée « EU LCS » la moitié de sa vie. Le sigle d'une pilule est un **nom de famille de colonnes**, pas la ligue d'une année donnée : la région d'une rangée, elle, se décide à l'année de son édition (§ 13). D'où un libellé sobre, qui ne s'énonce pas comme une affirmation historique.");
  L.push("", "**`Leagues.Region` est relevé, jamais employé.** La zone géographique de l'infobulle se dérive de `homeCountries`, qui est le territoire que la carte utilise réellement pour décider qu'un joueur est importé. Ce champ-ci est circulaire sur LMS (« LMS »), approximatif sur LCP, et contredirait la carte sur LPL (« China », quand `homeCountries` compte Taïwan et Hong Kong domestiques) : l'infobulle dirait le contraire du badge affiché à quelques pixels de là.");
  L.push("");
  L.push("| Sigle | `Leagues.League` | `Leagues.Region` (pour trace) |", "|---|---|---|");
  for (const short of leagues.sigles) {
    const v = leagues.noms.get(short);
    L.push(`| ${short} | ${v?.name ?? "**aucune ligne**"} | ${v?.region ?? "—"} |`);
  }
  h(3, `15.1 Noms à reporter (${leagueNew.length})`);
  L.push("Valeur à recopier dans la table `leagueNames` de `data/teams.json`, à côté de `regions`.", "");
  list(leagueNew.map((l) => `**${l.short}** — « ${l.calc} »`), "aucun.");
  h(3, `15.2 Écarts avec les noms saisis (${leagueDiffs.length})`);
  list(leagueDiffs.map((l) => `**${l.short}** — ${l.text}`), "aucun écart.");

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
  const [teamsData, playersData, resultsData] = await Promise.all(
    ["teams", "players", "results"].map((n) => readFile(join(ROOT, "data", `${n}.json`), "utf8").then(JSON.parse)),
  );
  // `data/careers.json` n'existe pas encore avant la première collecte du lot 5 : son absence
  // n'est pas une erreur, elle met simplement tout le § 14 en « à reporter ».
  const careersData = await readFile(join(ROOT, "data", "careers.json"), "utf8").then(JSON.parse).catch(() => ({ careers: {} }));

  console.log("Contrôle de la table année → OverviewPage…");
  const pageCheck = await checkPages(years);
  for (const y of pageCheck.empty) console.error(`  ERREUR · ${y} : aucune page porteuse de parties pour « ${PAGES[y]} »`);
  for (const u of pageCheck.uncovered) console.log(`  écartée · ${u.page}${u.hasGames ? "" : " (aucune partie)"}`);
  for (const r of pageCheck.regional) {
    const msg = `${r.page} : qualification régionale sous le préfixe de ${r.year}, ${r.rows} ligne(s)`;
    if (r.rows) console.error(`  ERREUR · ${msg} — elles entrent dans la lineup`);
    else console.log(`  sous-page · ${msg}`);
  }

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
    $comment: "Recensement des personnes rencontrées sur les 16 éditions. `page` est la page canonique Leaguepedia (redirections résolues), `spelling` la graphie proposée, `links` les titres rencontrés dans les scoreboards, `spellings` les graphies observées. `nationality` est ce que data/players.json enregistre (Players.NationalityPrimary) ; `country` est le pays de naissance, gard\u00e9 pour trace.",
    people: Object.fromEntries([...census].map(([id, p]) => [id, {
      page: p.page, spelling: p.spelling, proposed: p.proposed, arbitrated: p.arbitrated, lpId: p.lpId,
      fullName: p.fullName, country: p.country, nationality: p.nationality, known: p.known,
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
  console.log("Calcul des fenêtres d'activité (première et dernière partie, toutes compétitions)…");
  const { columns: activeWindows, lineage } = await fetchActive(outDir);
  console.log("Région de chaque colonne, édition par édition (ligue réellement jouée)…");
  const regions = await fetchRegions(computed, outDir, lineage);
  console.log("Classement de chaque équipe à son édition…");
  const places = await fetchPlaces(years, computed, outDir);
  console.log("Nom de ligue de chaque région (Leagues.League)…");
  const leagues = await fetchLeagues(outDir);
  // Les étapes hors Worlds ne se calculent que sur une collecte complète : un trou se mesure
  // entre deux apparitions, et une exécution partielle en invente autant qu'elle en cache.
  const complete = years.length === ALL_YEARS.length;
  console.log(complete ? "Étapes de carrière hors Worlds (règle 5)…" : "Étapes de carrière : ignorées (exécution partielle).");
  const careers = complete
    ? await fetchCareers({ selected, census, lineage, outDir, refresh })
    : { careers: {}, clubs: {}, sansColonne: [], ecartees: [], horsNiveau: [], creuses: [], partiel: true };
  notes.push(...places.notes);
  const reportPath = join(outDir, "report.md");
  await writeFile(reportPath, renderReport({ years, computed, pageCheck, census, collisions, nearCollisions, eraCandidates, caseIssues, diffs, activeWindows, places, regions, leagues, careers, teamsData, resultsData, careersData, notes, gameCounts }));

  console.log("");
  console.log(`Fragments : ${join(outDir, "fragments")}`);
  console.log(`Détail    : ${join(outDir, "detail")}`);
  console.log(`Activité  : ${join(outDir, "active.json")}`);
  console.log(`Parcours  : ${join(outDir, "places.json")}`);
  console.log(`Régions   : ${join(outDir, "regions.json")}`);
  console.log(`Ligues    : ${join(outDir, "leagues.json")}`);
  if (complete) console.log(`Carrières : ${join(outDir, "careers.json")}`);
  console.log(`Rapport   : ${reportPath}`);
  console.log(`${collisions.length} collision(s) de pseudo, ${caseIssues.length} divergence(s) de casse, ${diffs.length} écart(s) sur les lineups saisies.`);
  if (pageCheck.empty.length || pageCheck.regional.some((r) => r.rows)) process.exit(1);
}

main().catch((e) => {
  console.error(`Échec : ${e.message}`);
  process.exit(1);
});
