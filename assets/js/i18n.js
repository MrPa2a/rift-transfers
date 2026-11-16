/*
 * Rift Transfers — socle de traduction. Aucune dépendance, aucune étape de build.
 *
 * Le dictionnaire est **plat**, et chaque clé porte ses deux graphies côte à côte plutôt que
 * d'ouvrir deux blocs `fr` et `en` séparés : c'est la seule forme où une chaîne oubliée dans une
 * langue se voit à l'œil, sur la ligne même où elle manque. Rien d'autre ne garantit qu'aucun
 * texte français ne subsiste dans l'interface anglaise.
 *
 * Les textes dérivés des **données** n'entrent pas ici : les noms de pays vivent dans
 * `players.json` et les libellés de parcours dans `results.json`, bilingues eux aussi, parce
 * qu'ils se collectent et se contrôlent comme des données. Les noms de ligue ne se traduisent
 * pas du tout — ce sont des noms propres.
 */

export const LANGS = ["fr", "en"];
const DEFAUT = "en";
const CLE_STOCKAGE = "rift-transfers:lang";

// Pluriel : la règle n'est pas la même des deux côtés. « 0 équipe » est singulier en français,
// « 0 teams » pluriel en anglais — une seule règle écrirait donc faux dans une des deux langues.
const PLURIEL = {
  fr: (n) => (Math.abs(n) >= 2 ? "other" : "one"),
  en: (n) => (n === 1 ? "one" : "other"),
};
// Ordinaux : « 2e Worlds avec l'équipe » devient « 2nd », et la forme anglaise dépend des deux
// derniers chiffres (11th, 12th, 13th, et non 11st). Le compte va de 1 à 13 sur ce jeu de
// données, mais la règle est écrite entière : elle ne coûte rien et ne se repose pas sur ça.
const ORDINAL = {
  fr: (n) => (n === 1 ? "er" : "e"),
  en: (n) => {
    const r = n % 100;
    if (r >= 11 && r <= 13) return "th";
    return ["th", "st", "nd", "rd"][n % 10] || "th";
  },
};
// `og:locale` attend un code de territoire, pas une langue seule.
const LOCALES = { fr: "fr_FR", en: "en_US" };

const T = {
  // ---------- métadonnées de la page ----------
  "page.description": {
    fr: "Carte interactive des rosters de toutes les équipes venues aux Worlds 2011–2026 de League of Legends : suivez chaque joueur d'une équipe à l'autre.",
    en: "Interactive map of the rosters of every team that came to the 2011–2026 League of Legends World Championships: follow each player from one team to the next.",
  },
  "page.og.description": {
    fr: "Les rosters des Worlds de League of Legends depuis 2011, et les transferts de chaque joueur.",
    en: "League of Legends Worlds rosters since 2011, and every player's transfers.",
  },

  // ---------- barre, axe, outils flottants ----------
  "coin.annee": { fr: "ANNÉE", en: "YEAR" },
  "vp.aria": {
    fr: "Carte des rosters, glisser pour se déplacer, molette pour zoomer",
    en: "Roster map, drag to pan, wheel to zoom",
  },
  "q.aria": { fr: "Chercher un joueur ou une équipe", en: "Search for a player or a team" },
  "qlist.aria": { fr: "Résultats de la recherche", en: "Search results" },
  "btn.filtres": { fr: "Filtres", en: "Filters" },
  "btn.filtres.titre": { fr: "Filtres et options", en: "Filters and options" },
  "btn.stats": { fr: "Stats", en: "Stats" },
  "btn.stats.titre": { fr: "Statistiques", en: "Statistics" },
  // Le bouton de langue annonce la langue **d'arrivée**, pas celle en cours : c'est ce qu'il
  // fait, et non où l'on est — la page entière le dit déjà.
  "btn.lang.code": { fr: "EN", en: "FR" },
  "btn.lang.titre": { fr: "Switch to English", en: "Passer en français" },
  "zoom.in": { fr: "Zoomer", en: "Zoom in" },
  "zoom.out": { fr: "Dézoomer", en: "Zoom out" },
  "zoom.fit": { fr: "Tout afficher", en: "Show all" },
  "legend.titre": { fr: "Légende", en: "Legend" },

  // ---------- panneau de sélection ----------
  "sel.iso": { fr: "Isoler", en: "Isolate" },
  "sel.tout": { fr: "Tout afficher", en: "Show all" },
  "sel.fermer": { fr: "Retirer la sélection", en: "Clear the selection" },
  "sel.iso.titre": {
    fr: "N'afficher que les colonnes par lesquelles la sélection est passée",
    en: "Show only the columns the selection has passed through",
  },
  "sel.iso.titre.sortir": {
    fr: "Revoir toutes les colonnes, sans perdre la sélection",
    en: "See every column again, without losing the selection",
  },
  "sel.iso.titre.morte.annee": {
    fr: "Aucune colonne de la sélection sur l'édition {annee} isolée ni ses voisines",
    en: "No column of the selection on the isolated {annee} edition or its neighbours",
  },
  "sel.iso.titre.morte.periode": {
    fr: "Aucune colonne de la sélection dans la période affichée",
    en: "No column of the selection within the displayed period",
  },

  // ---------- tiroir de filtres ----------
  "drawer.fermer": { fr: "Fermer", en: "Close" },
  "grp.periode": { fr: "Période", en: "Period" },
  "periode.de": { fr: "De", en: "From" },
  "periode.a": { fr: "à", en: "to" },
  "periode.premiere.aria": { fr: "Première édition affichée", en: "First edition displayed" },
  "periode.derniere.aria": { fr: "Dernière édition affichée", en: "Last edition displayed" },
  "grp.postes": { fr: "Postes", en: "Roles" },
  "grp.regions": { fr: "Régions", en: "Regions" },
  "grp.presence": { fr: "Présence aux Worlds", en: "Worlds appearances" },
  "presence.note": {
    fr: "Nombre d'éditions jouées par l'équipe. {n} des {total} colonnes n'en ont qu'une.",
    en: "Number of editions the team has played. {n} of the {total} columns have only one.",
  },
  "grp.equipes": { fr: "Équipes", en: "Teams" },
  "grp.options": { fr: "Options d'affichage", en: "Display options" },
  "opt.nat": { fr: "Nationalité", en: "Nationality" },
  "opt.sen": { fr: "Ancienneté dans l'équipe", en: "Tenure with the team" },
  "grp.clicEquipe": { fr: "Clic sur une équipe", en: "Clicking a team" },
  "modeInfo.titre": { fr: "Que font ces deux modes ?", en: "What do these two modes do?" },

  "ere.tout": { fr: "Tout", en: "All" },
  "ere.tout.titre": {
    fr: "Les {n} éditions, de {de} à {a}",
    en: "All {n} editions, from {de} to {a}",
  },
  "ere.moderne": { fr: "Ère moderne", en: "Modern era" },
  "ere.moderne.titre": {
    fr: "Depuis 2020 : quatre régions majeures, la LMS ayant fusionné dans la PCS",
    en: "Since 2020: four major regions, the LMS having merged into the PCS",
  },
  "ere.historique": { fr: "Ère historique", en: "Historic era" },
  "ere.historique.titre": {
    fr: "{de} à 2019 : la LMS est encore une cinquième région majeure",
    en: "{de} to 2019: the LMS is still a fifth major region",
  },

  "presence.toutes": { fr: "Toutes", en: "All" },
  "presence.toutes.titre": { fr: "Les {n} équipes", en: "All {n} teams" },
  "presence.titre": {
    fr: "{n} équipes sur {total}, venues au moins {min} fois",
    en: "{n} of {total} teams, having come at least {min} times",
  },

  "region.compte.one": { fr: "{n} colonne", en: "{n} column" },
  "region.compte.other": { fr: "{n} colonnes", en: "{n} columns" },
  "region.seuil.one": {
    fr: "{n} colonne sur {total} au seuil de présence actuel",
    en: "{n} of {total} columns at the current appearance threshold",
  },
  "region.seuil.other": {
    fr: "{n} colonnes sur {total} au seuil de présence actuel",
    en: "{n} of {total} columns at the current appearance threshold",
  },

  "teams.affichees.one": { fr: "{n} équipe affichée", en: "{n} team shown" },
  "teams.affichees.other": { fr: "{n} équipes affichées", en: "{n} teams shown" },
  "teams.affichees.sur.one": { fr: "{n} équipe affichée sur {total}", en: "{n} of {total} teams shown" },
  "teams.affichees.sur.other": { fr: "{n} équipes affichées sur {total}", en: "{n} of {total} teams shown" },
  "teams.toutes": { fr: "Toutes", en: "All" },
  "teams.aucune": { fr: "Aucune", en: "None" },
  "teams.reafficher": { fr: "Tout réafficher ({n})", en: "Show all again ({n})" },

  "mode.players": { fr: "Carrières complètes", en: "Full careers" },
  "mode.players.titre": {
    fr: "Surligne tous les joueurs passés par l'équipe, avec toute leur carrière",
    en: "Highlights every player who has been through the team, with their whole career",
  },
  "mode.lineage": { fr: "Arrivées et départs", en: "Arrivals and departures" },
  "mode.lineage.titre": {
    fr: "Ne garde que le club juste avant l'arrivée et le club juste après le départ",
    en: "Keeps only the club just before arriving and the club just after leaving",
  },

  // ---------- notes du tiroir de filtres ----------
  "notes.titre": { fr: "Sources et limites des données", en: "Data sources and limits" },
  "notes.rangee": {
    fr: "Une rangée = les joueurs qui ont joué ces Worlds pour l'équipe, pas le roster de la saison. Une case grisée = équipe absente des Worlds, sans roster inventé.",
    en: "A row = the players who played that Worlds for the team, not the season's roster. A greyed-out cell = the team was not at Worlds, with no invented roster.",
  },
  "notes.etapes": {
    fr: "<b>Au survol d'un joueur, ou au clic sur une équipe</b>, ses années sans Worlds apparaissent en cases rayées et le fil passe par elles. Une case rayée dit seulement <b>où il était</b> cette année-là : le club où il a joué le plus de parties, plus tout autre club à 20 % de son année ou davantage. Jamais un roster, jamais un poste — la source n'en donne pas. Quand le poste du fil est déjà tenu cette année-là, la case rayée se colle au titulaire en demi-case, comme un poste partagé : Nagne était chez NaJin en 2014, l'année où Ggoong y a joué les Worlds, et les deux sont vrais. Ces étapes ne valent qu'<b>entre</b> deux apparitions du joueur aux Worlds. Au repos le fil les saute : 435 cases et leurs lignes vers « Autres équipes » masqueraient la carte pour une information qui se lit un joueur à la fois.",
    en: "<b>Hovering a player, or clicking a team</b>, their years without Worlds appear as hatched cells and the thread runs through them. A hatched cell says only <b>where they were</b> that year: the club where they played the most games, plus any other club accounting for 20 % of their year or more. Never a roster, never a role — the source gives neither. When the thread's role is already taken that year, the hatched cell sits against the starter as a half-cell, like a shared role: Nagne was at NaJin in 2014, the year Ggoong played Worlds there, and both are true. These stops only count <b>between</b> two of the player's Worlds appearances. At rest the thread skips them: 435 cells and their lines towards “Other teams” would bury the map for information that is read one player at a time.",
  },
  "notes.bouts": {
    fr: "Au survol d'un joueur comme au clic sur une équipe, le fil porte ses deux bouts — premier et dernier Worlds —, posés sur la ligne qui sépare deux éditions. Sur une équipe, c'est souvent la marque de fin qui explique l'arrivée suivante. Le fil passe en pointillé sur un intervalle où <b>aucune partie professionnelle n'est recensée</b>. Ce n'est pas « sans club » : c'est ce que la source recense, et le panneau de détail dit « première » et « dernière apparition connue », jamais « début » ni « fin de carrière ».",
    en: "Hovering a player as much as clicking a team, the thread carries its two ends — first and last Worlds — set on the line that separates two editions. On a team, it is often the end mark that explains the next arrival. The thread turns dotted over an interval where <b>no professional game is on record</b>. This is not “no team”: it is what the source records, and the detail panel says “first” and “last known appearance”, never “career start” or “career end”.",
  },
  "notes.demi": {
    fr: "Un poste tenu par deux joueurs est affiché en deux demi-cases, le plus titularisé à gauche. Chacune est ciblable et relie sa propre carrière. Un joueur retenu sur moins de 20 % des parties n'occupe pas de demi-case : il reste signalé par * sur la case du titulaire.",
    en: "A role held by two players is shown as two half-cells, the more-started one on the left. Each is targetable and links its own career. A player kept on fewer than 20 % of the games takes no half-cell: they stay flagged by * on the starter's cell.",
  },
  "notes.repliee": {
    fr: "Une colonne est repliée avant la création de l'organisation et après sa disparition : ni roster, ni « Pas aux Worlds ».",
    en: "A column is folded away before the organisation was created and after it ceased to exist: no roster, and no “Not at Worlds”.",
  },
  "notes.pseudo": {
    fr: "Un joueur qui a changé de pseudo est affiché sous celui qu'il portait cette année-là, mais son fil de carrière reste continu. La recherche accepte les deux, et la ligne du pseudo d'époque porte la graphie canonique en appui.",
    en: "A player who changed handle is shown under the one they bore that year, but their career thread stays continuous. Search accepts both, and the period-handle row carries the canonical spelling underneath.",
  },
  "notes.recherche": {
    fr: "La barre cherche les <b>joueurs et les équipes</b>. Une équipe se trouve sous son code, son nom complet ou son libellé court — <code class=\"cmd\">fnatic</code>, <code class=\"cmd\">FNC</code>, <code class=\"cmd\">pain</code> —, accents et casse indifférents. Choisir une équipe fait la même chose qu'un clic sur son en-tête. Une équipe qui n'a pas de colonne à cet instant reste listée, mais inerte, avec sa raison : la trouver est déjà une réponse, et un résultat de recherche n'a pas à changer les filtres sans le dire.",
    en: "The bar searches <b>players and teams</b>. A team is found under its code, its full name or its short label — <code class=\"cmd\">fnatic</code>, <code class=\"cmd\">FNC</code>, <code class=\"cmd\">pain</code> —, accents and case ignored. Picking a team does the same thing as clicking its header. A team with no column at that moment stays listed, but inert, with its reason: finding it is already an answer, and a search result has no business changing the filters without saying so.",
  },
  "notes.isoler": {
    fr: "<b>Isoler</b> réduit les colonnes sans toucher aux filtres, et de deux façons qui se cumulent. Un clic sur une <b>année</b> de l'axe ne garde que les équipes de cette édition, plus celles d'où viennent ses joueurs et où ils vont : les deux rangées voisines restent, estompées, et n'y montrent que ces arrivées et ces sorties. Le bouton <b>Isoler</b> du panneau de détail ne garde que les colonnes par lesquelles la sélection est passée. De 19 à 40 colonnes sur 120 pour une édition, 1 à 7 pour un joueur, jusqu'à 27 pour une équipe. Rien n'est masqué en douce : un geste qui ne laisserait aucune colonne est grisé, avec sa raison, et la période comme les filtres restent où on les a mis. Le bouton redevient « Tout afficher » et rend la carte entière <b>en gardant la sélection</b> ; le × la relâche ; Échap fait les deux. Sélectionner quelqu'un d'autre reporte l'isolement sur lui, sans en sortir : on reste dans le même geste de lecture. Une équipe isolée se lit en outre joueur par joueur — <b>survoler</b> une case n'allume que la ligne de ce joueur et ne touche pas aux colonnes, le clic restant ce qui reporte l'isolement sur lui.",
    en: "<b>Isolate</b> narrows the columns without touching the filters, in two ways that stack. Clicking a <b>year</b> on the axis keeps only that edition's teams, plus those its players come from and go to: the two neighbouring rows stay, dimmed, and show only those arrivals and departures. The <b>Isolate</b> button in the detail panel keeps only the columns the selection has passed through. From 19 to 40 columns out of 120 for an edition, 1 to 7 for a player, up to 27 for a team. Nothing is hidden quietly: a gesture that would leave no column is greyed out, with its reason, and the period and the filters stay where they were put. The button turns into “Show all” and gives the whole map back <b>while keeping the selection</b>; the × releases it; Esc does both. Selecting someone else carries the isolation over to them rather than leaving it: it stays the same reading gesture, on someone else. An isolated team can furthermore be read player by player — <b>hovering</b> a cell lights up that player's line alone and leaves the columns untouched, clicking being what carries the isolation over to them.",
  },
  "notes.presence": {
    fr: "Toutes les équipes ayant joué au moins un Worlds ont leur colonne, et la carte s'ouvre sur les 120. Le filtre « Présence aux Worlds » la dégrossit d'un clic : 54 colonnes à partir de deux apparitions, 33 à partir de trois, 19 à partir de cinq.",
    en: "Every team that has played at least one Worlds has its column, and the map opens on all 120. The “Worlds appearances” filter thins it out in one click: 54 columns from two appearances up, 33 from three, 19 from five.",
  },
  "notes.autres": {
    fr: "La colonne « Autres équipes » recueille deux choses : les joueurs d'une région ou d'une équipe masquée qui croisent une équipe affichée, avec le code de leur équipe, et les clubs traversés hors Worlds qui n'ont pas de colonne, avec leur sigle — ceux-là n'apparaissent qu'au survol du joueur, mais aucun filtre ne peut les en sortir : ils ne sont jamais allés aux Worlds. Un club dont la source ne donne pas d'abréviation n'a pas de sigle, et sa case n'en porte aucun plutôt qu'une abréviation inventée. Les trois filtres se cumulent : le seuil de présence agit à l'intérieur des régions affichées, et le masquage à l'intérieur de ce qui reste. Seules y figurent les éditions qui touchent la carte visible — le départ, le retour, et les clubs qu'une ligne traverserait sinon en silence. Un clic sur le joueur donne toujours sa carrière complète avec les années exactes.",
    en: "The “Other teams” column gathers two things: players from a hidden region or a hidden team who cross paths with a displayed team, with their team's code, and the clubs passed through outside Worlds that have no column, with their tag — the latter appear only when the player is hovered, and no filter can pull them out of it: they never went to Worlds. A club the source gives no abbreviation for has no tag, and its cell carries none rather than an invented abbreviation. The three filters stack: the appearance threshold acts inside the displayed regions, and hiding inside what is left. Only the editions that touch the visible map appear there — the departure, the return, and the clubs a line would otherwise cross in silence. Clicking the player always gives their full career with the exact years.",
  },
  "notes.nationalite": {
    fr: "Nationalité : codes recoupés avec Leaguepedia ; sans code, elle n'a pas été vérifiée. « Importé » = nationalité différente des pays de la région de l'équipe, pays arrêtés région par région : Taïwan et Hong Kong comptent domestiques en LPL comme en LMS, le Vietnam l'est aussi en LCP, et l'espace post-soviétique l'est en LCL.",
    en: "Nationality: codes cross-checked against Leaguepedia; with no code, it has not been verified. “Imported” = a nationality outside the countries of the team's region, countries settled region by region: Taiwan and Hong Kong count as domestic in the LPL as in the LMS, Vietnam is domestic in the LCP too, and the post-Soviet space is domestic in the LCL.",
  },
  "notes.limites": {
    fr: "Pas encore inclus : les quatre coéquipiers d'une étape hors Worlds, et le MSI. Toutes les équipes des seize Worlds ont en revanche leur colonne, quelle que soit leur région.",
    en: "Not yet included: the four team-mates of a stop outside Worlds, and MSI. Every team from the sixteen Worlds does have its column, however, whatever its region.",
  },
  "notes.sources": {
    fr: "Méthode et sources année par année : <a href=\"https://github.com/MrPa2a/rift-transfers/blob/main/docs/SOURCES.md\" target=\"_blank\" rel=\"noopener\">docs/SOURCES.md</a>. Une erreur ? <a href=\"https://github.com/MrPa2a/rift-transfers/issues/new/choose\" target=\"_blank\" rel=\"noopener\">Signale-la</a>.",
    en: "Method and sources year by year: <a href=\"https://github.com/MrPa2a/rift-transfers/blob/main/docs/SOURCES.md\" target=\"_blank\" rel=\"noopener\">docs/SOURCES.md</a> (in French). Found an error? <a href=\"https://github.com/MrPa2a/rift-transfers/issues/new/choose\" target=\"_blank\" rel=\"noopener\">Report it</a>.",
  },
  "modeTip.html": {
    fr: "<p><b>Carrières complètes</b> · surligne tous les joueurs passés par l'équipe, avec toute leur carrière aux Worlds. Pour suivre des joueurs.</p><p><b>Arrivées et départs</b> · ne garde que le club juste avant l'arrivée et le club juste après le départ. Pour voir avec quelles équipes l'équipe échange ses joueurs.</p><p>Ce choix décide aussi des colonnes que garde le bouton <b>Isoler</b> du panneau de détail : toutes celles qu'ont traversées les joueurs de l'équipe, ou seulement les clubs d'avant et d'après.</p>",
    en: "<p><b>Full careers</b> · highlights every player who has been through the team, with their whole Worlds career. For following players.</p><p><b>Arrivals and departures</b> · keeps only the club just before arriving and the club just after leaving. For seeing which teams the team trades its players with.</p><p>This choice also decides which columns the <b>Isolate</b> button in the detail panel keeps: all those the team's players have passed through, or only the clubs before and after.</p>",
  },

  // ---------- tiroir de statistiques ----------
  "stats.titre": { fr: "Statistiques", en: "Statistics" },
  "stats.note": {
    fr: "Calculées sur les {n} équipes suivies et leurs titulaires aux Worlds {de}–{a}. Touche un nom pour le retrouver sur la carte.",
    en: "Computed over the {n} teams tracked and their Worlds starters, {de}–{a}. Tap a name to find them on the map.",
  },
  "st.most": { fr: "Le plus de Worlds", en: "Most Worlds" },
  "st.trav": { fr: "Plus grands voyageurs aux Worlds", en: "Biggest travellers at Worlds" },
  "st.trav.note": {
    fr: "Nombre d'équipes différentes <b>avec lesquelles le joueur est allé aux Worlds</b>",
    en: "Number of different teams <b>the player went to Worlds with</b>",
  },
  "st.trav.unite.one": { fr: "{n} équipe", en: "{n} team" },
  "st.trav.unite.other": { fr: "{n} équipes", en: "{n} teams" },
  "st.carr": { fr: "Plus grands voyageurs, carrière entière", en: "Biggest travellers, whole career" },
  "st.carr.note": {
    fr: "Tous les clubs traversés, Worlds ou non — les étapes hors Worlds et les clubs sans colonne compris. Entre parenthèses, la part faite aux Worlds.",
    en: "Every club passed through, Worlds or not — stops outside Worlds and clubs without a column included. In brackets, the share at Worlds.",
  },
  "st.carr.unite.one": { fr: "{n} club", en: "{n} club" },
  "st.carr.unite.other": { fr: "{n} clubs", en: "{n} clubs" },
  "st.carr.worlds": { fr: "({n} aux Worlds)", en: "({n} at Worlds)" },
  "st.stable": { fr: "Rosters inchangés", en: "Unchanged rosters" },
  "st.stable.note": {
    fr: "Même cinq titulaires sur des Worlds consécutifs",
    en: "Same five starters across consecutive Worlds",
  },
  "st.stable.unite.one": { fr: "{n} an", en: "{n} year" },
  "st.stable.unite.other": { fr: "{n} ans", en: "{n} years" },
  "st.flow": { fr: "Flux entre régions", en: "Flows between regions" },
  "st.flow.note": {
    fr: "Changements d'équipe d'un Worlds à l'autre. Ligne : région quittée, colonne : région rejointe.",
    en: "Team changes from one Worlds to the next. Row: region left, column: region joined.",
  },
  "st.imp": { fr: "Joueurs importés", en: "Imported players" },
  "st.imp.note": {
    fr: "Titulaires dont la nationalité n'est pas celle de la région de l'équipe",
    en: "Starters whose nationality is not that of the team's region",
  },
  "stats.absente": { fr: "équipe absente du jeu de données", en: "team absent from the dataset" },
  "stats.voir": { fr: "Voir la colonne {nom} sur la carte", en: "Show the {nom} column on the map" },

  // ---------- cases, en-têtes et axe de la carte ----------
  "zone.et": { fr: " et ", en: " and " },
  "chip.worlds": { fr: "{nom}{alias}{nat} · {poste} · {equipe} {annee}", en: "{nom}{alias}{nat} · {poste} · {equipe} {annee}" },
  "chip.etape": {
    fr: "{nom}{nat} · chez {club} en {annee} · pas aux Worlds cette année-là",
    en: "{nom}{nat} · at {club} in {annee} · not at Worlds that year",
  },
  "chip.alias": { fr: " ({pseudo} à l'époque)", en: " ({pseudo} at the time)" },
  "chip.sen": { fr: " · {rang} Worlds avec l'équipe", en: " · {rang} Worlds with the team" },
  "chip.duo": { fr: " · poste partagé avec {nom}", en: " · role shared with {nom}" },
  "chip.rotation": { fr: " · rotation avec {nom}", en: " · rotation with {nom}" },
  "chip.doute": { fr: " · à vérifier", en: " · to be checked" },
  "cell.absent": { fr: "Pas aux Worlds", en: "Not at Worlds" },
  "hdr.autres": { fr: "Autres équipes", en: "Other teams" },
  "hdr.autres.titre": {
    fr: "Joueurs passés par des équipes qui ne sont pas affichées",
    en: "Players who have been through teams that are not displayed",
  },
  "hdr.equipe.titre": {
    fr: "{nom} · cliquer pour épingler l'équipe, recliquer pour relâcher",
    en: "{nom} · click to pin the team, click again to release",
  },
  "hdr.masquer.aria": { fr: "Masquer {nom}", en: "Hide {nom}" },
  "hdr.masquer.titre": { fr: "Masquer cette colonne", en: "Hide this column" },
  "hdr.dehors.one": { fr: "{n} équipe", en: "{n} team" },
  "hdr.dehors.other": { fr: "{n} équipes", en: "{n} teams" },
  "rail.ongoing": { fr: "EN COURS", en: "ONGOING" },
  "rail.isolee": {
    fr: "Édition isolée · cliquer pour revenir à la carte entière",
    en: "Edition isolated · click to return to the whole map",
  },
  "rail.morte": {
    fr: "La sélection isolée n'a aucune colonne sur {annee} ni ses voisines",
    en: "The isolated selection has no column on {annee} or its neighbours",
  },
  "rail.deplacer": { fr: "Déplacer l'isolement sur {annee}", en: "Move the isolation to {annee}" },
  "rail.isoler": {
    fr: "N'afficher que les équipes de {annee}, et celles d'où viennent ses joueurs et où ils vont",
    en: "Show only the teams of {annee}, and those its players come from and go to",
  },

  // ---------- refus : pourquoi une équipe n'a pas de colonne ----------
  "refus.periode": {
    fr: "aucune édition dans la période affichée",
    en: "no edition within the displayed period",
  },
  "refus.seuil.one": {
    fr: "{n} apparition, sous le seuil de présence",
    en: "{n} appearance, below the appearance threshold",
  },
  "refus.seuil.other": {
    fr: "{n} apparitions, sous le seuil de présence",
    en: "{n} appearances, below the appearance threshold",
  },
  "refus.region": { fr: "région {region} décochée", en: "{region} region unchecked" },
  "refus.masquee": { fr: "colonne masquée", en: "column hidden" },
  "refus.horsAnnee": {
    fr: "aucune rangée sur l'édition {annee} isolée ni ses voisines",
    en: "no row on the isolated {annee} edition or its neighbours",
  },
  "refus.horsIso": { fr: "hors de l'isolement en cours", en: "outside the current isolation" },

  // ---------- panneau de détail ----------
  "detail.void": {
    fr: "{annee} · aucune partie professionnelle recensée",
    en: "{annee} · no professional game on record",
  },
  "detail.bornes": {
    fr: "première apparition connue : {de} · dernière apparition connue : {a}",
    en: "first known appearance: {de} · last known appearance: {a}",
  },
  "detail.lineage.depuis": { fr: "Arrivées depuis : ", en: "Arrivals from: " },
  "detail.lineage.vers": { fr: "Départs vers : ", en: "Departures to: " },
  "detail.lineage.debut": { fr: "· {n} premiers Worlds ici", en: "· {n} first Worlds here" },
  "detail.lineage.aucun": { fr: "aucun", en: "none" },
  "detail.equipe": {
    fr: "{n} joueurs titulaires aux Worlds depuis {annee}, carrières complètes surlignées.",
    en: "{n} players started at Worlds since {annee}, full careers highlighted.",
  },

  // ---------- légende ----------
  "leg.fil": {
    fr: "changement d'équipe, coloré par poste — le fil bascule en son milieu quand le joueur change de poste",
    en: "team change, coloured by role — the thread switches at its midpoint when the player changes role",
  },
  "leg.demi": {
    fr: "poste tenu par deux joueurs, chacun ciblable · <b>*</b> rotation ponctuelle (survol pour le nom)",
    en: "role held by two players, each targetable · <b>*</b> occasional rotation (hover for the name)",
  },
  "leg.demi.doute": { fr: " · <b>?</b> à vérifier", en: " · <b>?</b> to be checked" },
  "leg.parcours": { fr: "parcours de l'équipe", en: "the team's run" },
  "leg.bouts": {
    fr: "au survol d'un joueur ou au clic sur une équipe, les deux bouts du fil, posés sur la ligne entre deux éditions : premier et dernier Worlds du joueur",
    en: "hovering a player or clicking a team, the thread's two ends, set on the line between two editions: the player's first and last Worlds",
  },
  "leg.nat": { fr: "nationalité", en: "nationality" },
  "leg.nat.imp": { fr: "joueur importé", en: "imported player" },
  "leg.sen": { fr: "{de} → {a} Worlds avec l'équipe", en: "{de} → {a} Worlds with the team" },
  "leg.step.badge": { fr: "Club", en: "Club" },
  "leg.step": {
    fr: "au survol d'un joueur ou au clic sur une équipe : où il était les années sans Worlds, et le fil passe par là",
    en: "hovering a player or clicking a team: where they were in the years without Worlds, and the thread runs through there",
  },
  "leg.void": {
    fr: "au survol, fil en pointillé : aucune partie professionnelle recensée sur l'intervalle",
    en: "hovering, dotted thread: no professional game on record over the interval",
  },
  "leg.autres": {
    fr: "Autres équipes : joueurs des régions et des équipes masquées, et les clubs traversés qui n'ont pas de colonne",
    en: "Other teams: players from hidden regions and hidden teams, and the clubs passed through that have no column",
  },
  "leg.lineage": {
    fr: "Arrivées et départs : club d'avant et club d'après",
    en: "Arrivals and departures: the club before and the club after",
  },
  "leg.annee": {
    fr: "<b>Édition {annee} isolée</b> : ses équipes, plus celles d'où viennent ses joueurs et où ils vont. Les deux rangées voisines sont estompées et ne montrent que ces arrivées et ces sorties. Cliquer une voisine y déplace l'isolement, cliquer {annee} en sort.",
    en: "<b>{annee} edition isolated</b>: its teams, plus those its players come from and go to. The two neighbouring rows are dimmed and show only those arrivals and departures. Clicking a neighbour moves the isolation there, clicking {annee} leaves it.",
  },
  "leg.iso": {
    fr: "<b>Sélection isolée</b> : seules les colonnes par lesquelles elle est passée. « Tout afficher » revient à la carte entière en gardant la sélection ; le × la relâche ; Échap fait les deux. Sélectionner quelqu'un d'autre reporte l'isolement sur lui.",
    en: "<b>Selection isolated</b>: only the columns it has passed through. “Show all” returns to the whole map while keeping the selection; the × releases it; Esc does both. Selecting someone else carries the isolation over to them.",
  },
  "leg.iso.survol": {
    fr: " Survoler un joueur n'allume que sa ligne, sans toucher aux colonnes.",
    en: " Hovering a player lights up their line alone, leaving the columns untouched.",
  },
  "leg.geste": {
    fr: "Glisser pour se déplacer · molette ou pincer pour zoomer",
    en: "Drag to pan · wheel or pinch to zoom",
  },

  // ---------- recherche ----------
  "rech.joueurs": { fr: "Joueurs", en: "Players" },
  "rech.equipes": { fr: "Équipes", en: "Teams" },
  "rech.reste.one": { fr: "+ {n} autre — précisez la recherche", en: "+ {n} more — narrow the search" },
  "rech.reste.other": { fr: "+ {n} autres — précisez la recherche", en: "+ {n} more — narrow the search" },
  "rech.vide": {
    fr: "Aucun joueur ni aucune équipe de ce nom.",
    en: "No player or team by that name.",
  },

  // ---------- erreur de chargement ----------
  "load.titre": { fr: "Impossible de charger les données.", en: "Could not load the data." },
  "load.corps": {
    fr: "Le site doit être servi par un serveur web (par exemple <code class=\"cmd\">npm run dev</code>), pas ouvert directement depuis le disque.",
    en: "The site has to be served by a web server (<code class=\"cmd\">npm run dev</code>, for instance), not opened straight from disk.",
  },
  "load.detail": { fr: "Détail :", en: "Details:" },
};

// ---------- résolution de la langue ----------
// `?lang=` > `localStorage` > `navigator.languages` > `en`. Pas de géo-IP : ce serait un appel
// réseau externe, et la langue déclarée du navigateur est de toute façon le meilleur signal.
//
// Un `?lang=` n'est **pas** mémorisé : c'est une variante d'URL, pas un choix. Seul le
// sélecteur écrit dans `localStorage` — sans quoi un lien partagé en anglais changerait la
// langue par défaut de qui le suit.
const lu = (cle) => { try { return localStorage.getItem(cle); } catch { return null; } };
function resoudre() {
  const demande = new URLSearchParams(location.search).get("lang");
  if (LANGS.includes(demande)) return demande;
  const garde = lu(CLE_STOCKAGE);
  if (LANGS.includes(garde)) return garde;
  for (const etiquette of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const base = String(etiquette || "").toLowerCase().split("-")[0];
    if (LANGS.includes(base)) return base;
  }
  return DEFAUT;
}

let langue = resoudre();
export const lang = () => langue;

// ---------- lecture du dictionnaire ----------
const remplir = (texte, params) => (params
  ? texte.replace(/\{(\w+)\}/g, (brut, cle) => (cle in params ? String(params[cle]) : brut))
  : texte);

export function t(cle, params) {
  const entree = T[cle];
  if (!entree) {
    // Une clé absente est un bug, pas un cas à gérer : elle s'affiche telle quelle pour qu'on
    // la voie à la relecture, et la console le dit.
    console.warn(`i18n : clé inconnue « ${cle} »`);
    return cle;
  }
  return remplir(entree[langue] ?? entree[DEFAUT] ?? cle, params);
}
// Pluriel : `tn("hdr.dehors", 3)` lit `hdr.dehors.other` et passe `n` en paramètre.
export const tn = (cle, n, params) => t(`${cle}.${PLURIEL[langue](n)}`, { n, ...params });
export const ord = (n) => `${n}${ORDINAL[langue](n)}`;

// ---------- application au document ----------
// Trois attributs, et pas un de plus : le texte, le texte riche, et les attributs. Le texte
// français ne vit **pas** dans le HTML — sinon il y aurait deux sources pour la même chaîne, et
// c'est exactement la dérive que la table fr/en côte à côte cherche à rendre impossible.
export function appliquer(racine = document) {
  racine.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  racine.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  racine.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    for (const paire of el.dataset.i18nAttr.split(";")) {
      const i = paire.indexOf(":");
      if (i > 0) el.setAttribute(paire.slice(0, i).trim(), t(paire.slice(i + 1).trim()));
    }
  });
}

// En-tête du document : la langue déclarée, la description et les métas de partage. `og:title`
// ne bouge pas — c'est le nom du projet.
function appliquerEntete() {
  document.documentElement.lang = langue;
  const poser = (selecteur, valeur) => {
    const el = document.querySelector(selecteur);
    if (el) el.setAttribute("content", valeur);
  };
  poser('meta[name="description"]', t("page.description"));
  poser('meta[property="og:description"]', t("page.og.description"));
  poser('meta[property="og:locale"]', LOCALES[langue]);
}

const abonnes = new Set();
// Un changement de langue ne recharge pas la page : la carte est un outil qu'on a déjà réglé —
// période, filtres, zoom, sélection — et un rechargement rendrait tout ça. Les abonnés
// reconstruisent ce que le dictionnaire ne peut pas atteindre seul : les libellés que le
// JavaScript écrit, et la carte elle-même.
export const surChangement = (fn) => abonnes.add(fn);

export function setLang(nouvelle) {
  if (!LANGS.includes(nouvelle) || nouvelle === langue) return;
  langue = nouvelle;
  try { localStorage.setItem(CLE_STOCKAGE, nouvelle); } catch { /* navigation privée : le choix ne survit pas à l'onglet, et c'est tout */ }
  // L'URL porte la langue choisie, sans navigation : le lien reste partageable tel quel, et
  // c'est la variante que `hreflang` déclarera.
  const url = new URL(location.href);
  url.searchParams.set("lang", nouvelle);
  history.replaceState(null, "", url);
  appliquerEntete();
  appliquer(document);
  abonnes.forEach((fn) => fn());
}

appliquerEntete();
appliquer(document);
