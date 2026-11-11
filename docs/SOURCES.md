# Sources et méthode

Ce document explique comment les données de Rift Transfers ont été vérifiées, et comment les étendre. La liste exhaustive des sources, année par année, est aussi disponible au format machine dans [`data/sources.json`](../data/sources.json).

## Ce que représente une rangée

Une rangée = **les joueurs qui ont joué les Worlds pour l'équipe cette année-là**, et non le roster de la saison. Un joueur arrivé après les Worlds, ou parti avant, n'y figure pas ; un remplaçant inscrit qui n'a joué aucun match (« DNP ») non plus. Une équipe absente d'une édition n'a pas de rangée : aucun roster n'est déduit.

## Règles de sélection des titulaires

Quatre règles, appliquées aux **14 éditions** sans exception. Les arbitrages ponctuels qu'elles ne tranchent pas sont figés dans des tables en tête de [`scripts/fetch-worlds.mjs`](../scripts/fetch-worlds.mjs), avec leur justification.

**1. Seuil de 20 % et poste majoritaire.** Un joueur est retenu à un poste s'il y a joué **au moins 20 % des parties de l'équipe** dans le tournoi, **et** que ce poste est celui où il a le plus joué. La seconde condition écarte les échanges ponctuels : Fnatic 2013 et TSM 2013 ont inversé des postes sur une seule partie, ce qui ne crée pas un poste partagé. Elle vaut aussi pour le second joueur d'un poste.

**2. Deux joueurs au maximum par poste.** Quand deux joueurs franchissent le seuil au même poste, la case est divisée en deux demi-cases, le plus titularisé à gauche. Chacune est ciblable et relie sa propre carrière. Dans les données, `lineup` porte celui de gauche, `shared` le second, et `split` liste les postes concernés. Un joueur resté **sous** le seuil n'occupe pas de demi-case : il figure dans `shared` sans être dans `split`, et la case du titulaire porte la marque `*`. À égalité stricte, le joueur de gauche est celui qui est allé au tour le plus avancé ; quand même ce critère ne départage pas — SKT 2016 et Cloud9 2019 en jungle, les deux joueurs étant allés au même tour — le choix est inscrit dans `EGALITES_ARBITREES`.

**3. Homonymes.** Le modèle identifie un joueur par son pseudo en minuscules : deux personnes au même pseudo fusionneraient en une seule carrière, sans alerte. En cas de collision réelle, et seulement dans ce cas, le pseudo reçoit un discriminant repris de Leaguepedia (`Ziv (Chen Yi)`). Sur les 14 éditions, aucune collision n'existe — un seul `Ziv` y apparaît. Ce n'est pas une garantie de construction : `npm run validate` signale tout pseudo dont les apparitions sont séparées par plus de quatre éditions, et `fetch-worlds.mjs` recoupe les 687 personnes du recensement à chaque exécution.

**4. Une graphie par personne.** `bengi` et `Bengi` désignent la même personne et doivent être unifiés. L'arbitrage suit trois critères, dans cet ordre : la graphie déjà employée dans `/data` si le joueur y figure, sinon la casse du titre de page canonique de Leaguepedia, sinon la graphie la plus fréquente dans les scoreboards — sur l'ensemble des éditions, jamais édition par édition, sans quoi `caPs` (une édition) l'emporterait sur `Caps` (huit). Les exceptions aux deux premiers critères sont dans `GRAPHIES_ARBITREES`.

Un joueur qui a **changé de pseudo** garde malgré tout une seule graphie dans `lineup` et `shared`, son identité, pour que son fil de carrière ne soit pas scindé ; le pseudo réellement porté cette année-là est déclaré à part dans `aliases` et c'est lui que la carte affiche. Une simple différence de casse ne justifie jamais un `aliases` : ce serait réintroduire ce que la règle 4 proscrit. Six cas sont concernés, listés dans `PSEUDOS_EPOQUE`.

## Méthode de vérification

Les **14 éditions** sont aujourd'hui dérivées d'une seule source, `ScoreboardPlayers` de Leaguepedia via `Special:CargoExport` : une ligne par joueur et par partie, à laquelle [`scripts/fetch-worlds.mjs`](../scripts/fetch-worlds.mjs) applique les règles de sélection. Relancer le script ne signale plus aucun écart avec `data/teams.json`.

Le tableau ci-dessous garde la trace de la méthode qui avait servi à établir chaque édition **avant** cette unification. Elle n'établit plus aucune rangée, mais elle les corrobore et explique les choix d'origine.

| Années | Méthode principale | Compléments |
|---|---|---|
| 2013–2016 | **Nombre de parties jouées par joueur** (Leaguepedia, `ScoreboardPlayers` via `Special:CargoExport`) | Classements Wikipédia, identité canonique des joueurs (`PlayerRedirects`, `Players`) |
| 2017 | Participants Liquipedia, matchs joués ensemble (Leaguepedia) | — |
| 2018 | Liste officielle Riot « Meet the teams », matchs joués ensemble | Résultats Liquipedia |
| 2019–2020 | Matchs joués ensemble aux Worlds (Leaguepedia) | Résultats Wikipedia |
| 2021 | Participants Liquipedia avec remplaçants « DNP » | Articles sur Bean / Upset |
| 2022–2024 | **Nombre de matchs joués par joueur** (Oracle's Elixir) | Finales sur Wikipedia |
| 2025 | Finale (Wikipedia), rosters inscrits, rotation BLG (RotoWire) | Carrières Leaguepedia |
| 2026 | **Nombre de matchs joués par joueur** (export Leaguepedia) | Liste des qualifiés |

### Matchs joués par joueur (2022–2024, 2026)

Les fichiers de matchs d'Oracle's Elixir contiennent une ligne par joueur et par partie. En filtrant `league = WLDs` **et** les dates à partir du premier jour du tournoi (les qualifications régionales portent aussi l'étiquette `WLDs`), on obtient pour chaque équipe le nombre de parties jouées par chaque joueur à chaque poste.

### Matchs joués ensemble (2017–2020)

Le jeu de données *LeagueOfLegendsCompetitiveNetwork* (scrapé sur Leaguepedia) donne, pour chaque paire de joueurs, le nombre de matchs joués ensemble aux Worlds, **toutes éditions 2012–2021 confondues**. Il ne contient pas les Worlds 2021.

- Une lineup est validée si les 10 paires de joueurs ont joué ensemble.
- Pour départager une rotation, on utilise une paire qui n'existe qu'une seule année. Exemple : Bwipo et Caps n'ont joué ensemble qu'en 2018 (13 matchs), sOAZ et Hylissang aussi (4 matchs) → Bwipo est le titulaire de Fnatic en 2018.
- Exemple de déduction : Ambition a 33 matchs avec CuVee (17 en 2016 + 16 en 2017) et Haru 6 matchs (les 6 matchs de Gen.G en 2018) → Ambition titulaire en 2017, Haru en 2018.

## Corrections apportées lors de l'audit du 11/11/2026

| Équipe | Avant | Après | Raison |
|---|---|---|---|
| KT 2018 | Kiin (top) | Smeb | Kiin jouait chez Afreeca |
| Fnatic 2020 | Upset (bot) | Rekkles | Upset arrive chez Fnatic en 2021 |
| Fnatic 2021 | Upset (bot) | Bean | Upset rentré avant le tournoi (DNP) |
| RNG 2021 | Breathe (top) | Xiaohu | Breathe titulaire à partir de 2022 |
| DK 2024 | Kellin (support) | Moham | 9 matchs sur 9 |
| SKT 2019 | Mata (support) | Effort, rotation Mata | 12 matchs contre 2 |
| BLG 2025 | Beichuan (jungle) | Shad0w, rotation Beichuan | Shad0w titulaire à partir du 2e tour |
| MAD Lions 2020, 2022 | absent | ajouté | Éliminé en play-in |

T1 2025 : **Doran** était bien le top laner (Zeus était chez Hanwha Life).

## Corrections apportées par l'extension à 2013–2026

Les règles de sélection ayant été unifiées sur les 14 éditions, les rangées de 2017 à 2026 ont été recalculées à partir de Leaguepedia. Elles étaient justes, à une exception près, mais incomplètes.

| Équipe | Avant | Après | Raison |
|---|---|---|---|
| FlyQuest 2020 | V1per (top) | **Solo** | Solo a joué les 6 parties sur 6 ; V1per n'est pas même inscrit au roster de l'événement |
| `Haro` (nationalité) | KR | **CN** | Chen Wen-Lin, chinois. Aucun joueur coréen ne porte ce pseudo sur Leaguepedia |
| `LokeN` (nationalité) | CN | **KR** | Lee Dong-wook, coréen |

Neuf rangées manquaient, toutes des organisations que la carte ne suivait pas encore : **TSM** 2017 et 2020, **ahq** 2017 et 2019, **Flash Wolves** 2017 et 2018, **Splyce** 2019 (quarts de finale), **J Team** 2019 et **LGD** 2020.

Six rotations manquaient également, parce que l'ancienne méthode ne relevait que celles qu'elle croisait : Haru (Samsung Galaxy 2017), Rascal (Longzhu 2017), Ambition (Gen.G 2018), Duke (Invictus Gaming 2018), Deftly (Cloud9 2019) et Burdol (Gen.G 2021).

## Collecter une édition

```
node scripts/fetch-worlds.mjs          # les 14 éditions
node scripts/fetch-worlds.mjs 2027     # une seule
```

Le script interroge `ScoreboardPlayers`, applique les quatre règles, et écrit dans `.fetch-worlds/` (ignoré par git) un fragment au format `teams.json` par édition, le détail des parties par joueur, et un rapport des cas qu'il ne sait pas trancher. Il **ne modifie jamais** `/data`, qu'il se contente de lire pour signaler les écarts : relancé après une saisie, il ne doit plus rien signaler.

La table année → `OverviewPage` est revérifiée à chaque exécution contre la table `Tournaments`. De 2013 à 2016 une édition tient sur une seule page ; depuis 2017 elle se répartit entre `…/Play-In` et `…/Main Event`, la page parente ne portant aucune ligne — un préfixe `LIKE` les agrège sans double comptage. **Aucun filtre de date n'est nécessaire**, à aucune édition : aucune qualification régionale ne vit sous le préfixe d'une édition. Trois pièges existent en revanche pour qui filtrerait par nom, et le script les écarte explicitement : `2023 Worlds Qualifying Series`, les six éditions `IEM … World Championship`, et `Season 1`/`Season 2 World Championship`.

Oracle's Elixir a été écartée pour les éditions anciennes : téléchargement manuel, et les copies publiques ne couvrent pas 2014-2016.

Deux pièges de l'API, vérifiés :

- `CargoExport` sérialise en **nombre JSON** toute valeur qui ressemble à un nombre : le pseudo `369` arrive en `369`, pas en `"369"`.
- Le champ `Link` du scoreboard est le titre de page **au moment de la partie**, donc parfois une redirection : `Clearlove7` (2017) et `Clearlove` (2018) sont la même personne. La table `PlayerRedirects` donne la page canonique — 725 titres se ramènent à 687 personnes sur les 14 éditions.

Points d'attention pour ces années :

- Plusieurs organisations alignaient deux équipes (Samsung White / Samsung Blue en 2014, SK Telecom T1 K / S en 2013). Ce sont des équipes distinctes : Samsung White rejoint la colonne `GEN`, Samsung Blue reçoit la sienne.
- Les noms d'équipe changent souvent : utiliser le champ `name` de chaque édition (comme `SKT T1 K` dans la colonne T1). Leaguepedia normalise les siens — il écrit `TSM` pour Team SoloMid et `SK Telecom T1` pour SKT T1 K — donc ils ne font pas foi : c'est l'annexe du plan qui tranche.
- La fenêtre `active` de chaque organisation vient de sa première et de sa dernière partie sur Leaguepedia, toutes compétitions confondues. La borne de fin n'est posée que pour les orgs dissoutes.
- **Les libellés de région sont anachroniques sur les éditions anciennes.** La carte range les équipes dans cinq régions au nom d'aujourd'hui, mais `LMS` n'a existé que de 2015 à 2019 — la colonne `TPA` porte pourtant une rangée 2014, quand Taïwan relevait encore de la GPL — `LCK` s'appelait OGN Champions en 2013, `LEC` était l'EU LCS jusqu'en 2019, et `LPL` n'a démarré qu'en 2013. Ces libellés servent à regrouper les colonnes, pas à nommer la ligue de l'époque.
- Ajouter les nouvelles années à `years` dans `data/teams.json`, les résultats dans `data/results.json` et les sources dans `data/sources.json`, puis lancer `npm run validate`.

## Nationalités

Table `Players` de Leaguepedia. Attention : `Country` est le pays de **naissance**, et c'est `NationalityPrimary` qui donne la nationalité quand les deux diffèrent — Biofrost est canadien né en Chine, Huhi américain né en France. C'est la **nationalité** qui est retenue dans `data/players.json`, puisque c'est elle qui détermine si un joueur est importé dans sa région.

Sur les 198 nationalités déjà saisies avant l'extension, cette règle en confirme 196 ; les deux dernières étaient fausses et ont été corrigées — `Haro` et `LokeN`, dans le tableau ci-dessus.

Un cas limite mérite d'être connu : `Spica` (TSM 2020) est noté **CN**. Il est né en Chine, de citoyenneté chinoise, mais résidait en Amérique du Nord et comptait comme joueur local pour la LCS. Le projet enregistre la **nationalité**, pas la résidence sportive — c'est déjà le cas d'`Impact` et de `CoreJJ`, notés `KR` alors qu'ils jouaient en Amérique du Nord. Il apparaît donc comme joueur importé.

## Licences des sources

- Leaguepedia et Liquipedia : contenus sous licence **CC BY-SA 3.0**.
- Oracle's Elixir : données mises à disposition par Tim Sevenhuysen, à citer en cas de réutilisation.
- Les rosters et résultats sont des faits ; ce dépôt les cite et ne reproduit pas les pages d'origine.
