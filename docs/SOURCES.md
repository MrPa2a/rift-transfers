# Sources et méthode

Ce document explique comment les données de Rift Transfers ont été vérifiées, et comment les étendre. La liste exhaustive des sources, année par année, est aussi disponible au format machine dans [`data/sources.json`](../data/sources.json).

## Ce que représente une rangée

Une rangée = **les joueurs qui ont joué les Worlds pour l'équipe cette année-là**, et non le roster de la saison. Un joueur arrivé après les Worlds, ou parti avant, n'y figure pas ; un remplaçant inscrit qui n'a joué aucun match (« DNP ») non plus. Une équipe absente d'une édition n'a pas de rangée : aucun roster n'est déduit.

## Règles de sélection des titulaires

Quatre règles, appliquées aux **16 éditions** sans exception. Les arbitrages ponctuels qu'elles ne tranchent pas sont figés dans des tables en tête de [`scripts/fetch-worlds.mjs`](../scripts/fetch-worlds.mjs), avec leur justification.

**1. Seuil de 20 % et poste majoritaire.** Un joueur est retenu à un poste s'il y a joué **au moins 20 % des parties de l'équipe** dans le tournoi, **et** que ce poste est celui où il a le plus joué. La seconde condition écarte les échanges ponctuels : Fnatic 2013 et TSM 2013 ont inversé des postes sur une seule partie, ce qui ne crée pas un poste partagé. Elle vaut aussi pour le second joueur d'un poste. Un poste où **aucun** candidat n'a fait son poste majoritaire revient par défaut à celui qui y a le plus joué ; quand celui-là tient déjà un autre poste de la rangée — ce que le modèle de la carte interdit, un joueur étant une case — le choix est inscrit dans `POSTES_ARBITRES`. Un seul cas sur les 16 éditions, Epik Gamer 2011.

**2. Deux joueurs au maximum par poste.** Quand deux joueurs franchissent le seuil au même poste, la case est divisée en deux demi-cases, le plus titularisé à gauche. Chacune est ciblable et relie sa propre carrière. Dans les données, `lineup` porte celui de gauche, `shared` le second, et `split` liste les postes concernés. Un joueur resté **sous** le seuil n'occupe pas de demi-case : il figure dans `shared` sans être dans `split`, et la case du titulaire porte la marque `*`. À égalité stricte, le joueur de gauche est celui qui est allé au tour le plus avancé ; quand même ce critère ne départage pas — SKT 2016 et Cloud9 2019 en jungle, les deux joueurs étant allés au même tour — le choix est inscrit dans `EGALITES_ARBITREES`.

**3. Homonymes.** Le modèle identifie un joueur par son pseudo en minuscules : deux personnes au même pseudo fusionneraient en une seule carrière, sans alerte. En cas de collision réelle, et seulement dans ce cas, le pseudo reçoit un discriminant repris de Leaguepedia. Un seul cas sur les 16 éditions : deux personnes portent `Violet` et sont toutes deux affichées depuis l'extension aux régions mineures — Ngô Mạnh Quyền (Saigon Jokers 2012) et Vincent Chun Him Wong (PEACE 2021). Leurs identités s'écrivent donc `Violet (Ngô Mạnh Quyền)` et `Violet (Vincent Wong)`. **Le discriminant est une identité, pas une étiquette** : leurs cases affichent `Violet`, le pseudo qu'ils ont tous deux porté, via `PSEUDOS_EPOQUE`. Ce n'est pas une garantie de construction : `npm run validate` signale tout pseudo dont les apparitions sont séparées par plus de quatre éditions, et `fetch-worlds.mjs` recoupe les 749 personnes du recensement à chaque exécution. Dix carrières à trou ont été vérifiées nominativement et inscrites dans `HOMONYMES_VERIFIES`.

**4. Une graphie par personne.** `bengi` et `Bengi` désignent la même personne et doivent être unifiés. L'arbitrage suit trois critères, dans cet ordre : la graphie déjà employée dans `/data` si le joueur y figure, sinon la casse du titre de page canonique de Leaguepedia, sinon la graphie la plus fréquente dans les scoreboards — sur l'ensemble des éditions, jamais édition par édition, sans quoi `caPs` (une édition) l'emporterait sur `Caps` (huit). Les exceptions aux deux premiers critères sont dans `GRAPHIES_ARBITREES`.

Un joueur qui a **changé de pseudo** garde malgré tout une seule graphie dans `lineup` et `shared`, son identité, pour que son fil de carrière ne soit pas scindé ; le pseudo réellement porté cette année-là est déclaré à part dans `aliases` et c'est lui que la carte affiche. Une simple différence de casse ne justifie jamais un `aliases` : ce serait réintroduire ce que la règle 4 proscrit. Dix cas sont concernés, listés dans `PSEUDOS_EPOQUE`. Chacun est tranché sur `PlayerRedirects` : un pseudo réellement porté y survit en redirection, une coquille de scoreboard non. Le discriminant entre parenthèses d'une redirection — `Ackerman (Xiao Wang)`, `Kevin (Kevin Rubiszewski)` — appartient à Leaguepedia et non au pseudo : il est retiré, comme pour `Cyanide FI`.

## Méthode de vérification

Les **16 éditions** sont aujourd'hui dérivées d'une seule source, les tables Cargo de Leaguepedia via `Special:CargoExport`, à laquelle [`scripts/fetch-worlds.mjs`](../scripts/fetch-worlds.mjs) applique les règles de sélection. `ScoreboardPlayers` donne une ligne par joueur et par partie, d'où sortent les lineups ; `Tournaments` donne la ligue et la région de chaque organisation année par année, d'où sort le périmètre ; `ScoreboardGames` donne sa première et sa dernière partie, d'où sortent les fenêtres `active` ; `TournamentResults` donne son classement, d'où sortent les parcours. Les quatre jeux de données du dépôt en viennent donc, et relancer le script ne signale plus aucun écart avec eux — ni lineup, ni rotation, ni demi-case, ni fenêtre d'activité, ni parcours. Le script **ne les écrit jamais** : il les lit pour signaler les écarts.

Le tableau ci-dessous garde la trace de la méthode qui avait servi à établir chaque édition **avant** cette unification. Elle n'établit plus aucune rangée, mais elle les corrobore et explique les choix d'origine.

| Années | Méthode principale | Compléments |
|---|---|---|
| 2011–2012 | **Nombre de parties jouées par joueur** (Leaguepedia, `ScoreboardPlayers` via `Special:CargoExport`) — aucune méthode antérieure, ces éditions sont nées de l'unification | Classement (`TournamentResults`), bracket (`MatchSchedule`), lignée des organisations (`TeamRedirects`, `Teams`) |
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

## Hors Worlds : la règle 5 et les étapes de carrière

Les quatre règles ci-dessus décident d'une **rangée de Worlds** : qui a joué l'édition pour
l'équipe. La règle 5 décide d'autre chose, et c'est pourquoi elle est à part : **où était un
joueur une année sans rangée**, pour que son fil ne saute plus le trou en silence. Les
données vivent dans [`data/careers.json`](../data/careers.json), le calcul en § 14 du rapport
de collecte.

**Règle 5. Club majoritaire de l'année, plus tout autre club à 20 % des parties ou plus.**
C'est le seuil de la règle 1, transposé de l'axe des postes à l'axe du temps. Le majoritaire
seul perdait non pas du bruit mais des demi-saisons réelles, souvent dans des clubs qui *ont*
une colonne — Breathe 2022 (RNG 82 parties, BLG 52), Zven 2016 (G2 50, Origen 34), Mata 2014
(Samsung Ozone 39, Samsung White 37 — deux colonnes distinctes ici). Mesuré sur 25 joueurs : le
seuil de 20 % ramène la perte de 29 à 13 clubs-années, et 30 % ou 40 % font moins bien.

**Le contrôle de la règle 5 est la rangée de Worlds elle-même.** Appliquée aux 1 557
joueur-années *qui ont* une rangée, elle retrouve la bonne colonne **1 549 fois sur 1 557**.
Les 8 écarts sont des transferts de mi-saison où le club des Worlds pèse moins de 20 % de
l'année — Juhan 2022, Deftly 2019, Voyboy 2012, Winds 2013, Crash 2017, Kongyue et Uniboy
2020, UDYSOF 2018. Sur une année de Worlds la rangée fait foi et aucune étape n'est écrite :
le contrôle ne sert qu'à valider la règle là où la réponse est connue.

### Périmètre : l'année-trou, et elle seule

Une étape n'est écrite que pour une **année sans rangée située entre deux apparitions** du
joueur. Avant sa première et après sa dernière, le fil n'a rien à relier : ce sont les deux
bouts du fil, et c'est `seen` qui porte ce qu'on en sait.

Ce choix est aussi ce qui tient la charge de la carte. Les 419 années-trous des 749 joueurs
ajoutent **435 cases**, soit +28 % sur les 1 557 d'origine, dont 64 seulement dans « Autres
équipes ». Étendre les étapes à toute la carrière dans l'horizon en ajouterait **3 358**, dont
1 436 dans la seule colonne « Autres équipes » : la carte triplerait et changerait de sujet.

Au rendu, ces 435 cases ne paraissent qu'au survol d'un joueur ou au clic sur une équipe, et
celles dont le poste est déjà tenu cette année-là se collent au titulaire en demi-case — une
étape n'a pas de poste, elle n'en emprunte un que pour garder le couloir du fil. Au
repos le fil garde le raccourci d'avant, d'une apparition de Worlds à la suivante : les lignes
qui partent vers « Autres équipes », tout à droite de 120 colonnes, sont illisibles en masse
pour une information qui se lit un joueur à la fois.

### Filtre de bruit : deux champs de la source, aucun motif de nom

`ScoreboardPlayers` mêle aux clubs des entités qui ne sont pas des étapes de carrière.
Reconnaître « Team Fire » ou « Newbee Young » à leur orthographe serait deviner ; deux champs
de la source tranchent à leur place.

1. **`Tournaments.TournamentLevel = 'Primary'`.** Écarte les ligues secondaires et les
   académies (`Secondary` : LCK CL, LDL, LCS Academy, `FlyQuest Academy`, `Newbee Young`,
   `Team WE Future`) comme les All-Star et les showmatchs (`Showmatch` : `LPL Allstars`,
   `Team Fire`, `Team Ice`, `TeamRookie`). Sur les 8 259 lignes groupées rendues par la
   collecte, 2 567 tombent ici.
2. **Une fiche `Teams` est exigée.** Le niveau de tournoi ne prend pas les sélections
   nationales — les qualifications des Asian Games 2018 sont `Primary` — ni les sélections
   régionales coréennes du KeSPA Cup (`Seoul`, `Gyeonggi`, `Ulsan`, `Chungnam`, `Gwangju`) ni
   les équipes d'un soir de la Demacia Cup (`LCC`, `ZSM`, `Huya RST`, `FRK`). Aucune de ces
   entités n'a de fiche dans `Teams` ; 34 sont écartées à ce titre, toutes vérifiées par leur
   tournoi. Un club réel sans fiche existe — `Flamengo Esports` — mais il a une colonne, et
   une entité déjà reliée à une colonne n'est jamais écartée par ce test.

**`IsOfficial` a été essayé et écarté** : LMS, GPL, CBLOL et le LPL d'avant 2017 n'y sont pas
marqués, et le filtre viderait des années entières — 38 joueur-années en 2012, 118 en 2015,
144 en 2016.

Il reste une table explicite, et elle est **vide** : dans la fenêtre des années-trous, les
deux champs suffisent. Elle n'existe que pour le cas inverse — un club réel sans fiche `Teams`
qui n'aurait pas de colonne — et une entrée y viendrait avec sa justification écrite, comme
dans `GRAPHIES_ARBITREES`.

### Lignée d'organisation : `RenamedTo`, jamais `OrganizationPage`

Un club traversé est soit une colonne, soit « Autres équipes ». Le rattachement se fait par la
lignée que `fetchActive()` ferme déjà pour les fenêtres `active` : alias de `TeamRedirects`,
prédécesseurs de `Teams.RenamedTo`, et `LIGNEES_ARBITREES`. Vingt et un clubs s'y rattachent
sans qu'aucune table soit écrite — `Snake Esports` → LNG, `Team Curse` → TL, `Incredible
Miracle` et `Kingzone DragonX` → DRX, `KSV eSports` → GEN, `Gamers2` → G2, `OpTic Gaming` →
IMT, `Boba Marines` → GAM, `Team Secret (Vietnamese Team)` → TSW.

`Teams.RenamedTo` ne porte pas toujours un **titre de page** : il porte le nom sous lequel
l'équipe a continué, qui n'est parfois qu'une redirection. `Kingzone DragonX` est renommée en
« DragonX », alias de la page `DRX` : comparer les chaînes brutes coupait la lignée là. La
cible est donc résolue par `TeamRedirects` avant d'être comparée.

**`Teams.OrganizationPage` n'est pas employée.** Elle ne diverge que sur dix clubs, et aucun
ne doit rejoindre la colonne qu'elle désigne :

| club | org Leaguepedia | colonne visée | pourquoi non |
| --- | --- | --- | --- |
| `SK Telecom T1 S` | SK Telecom T1 | T1 | jumelle de 2013-2014, jamais allée aux Worlds |
| `Taipei Snipers`, `Taipei Berserkers` | Taipei Assassins | TPA | idem |
| `Team WE Future`, `Team WE Academy` | Team WE | WE | formations secondaires |
| `SK Gaming Prime`, `SuperMassive TNG`, `Team Liquid Academy` | — | SK, SUP, TL | idem |
| `Vikings Gaming` | Vikings Gaming | MVK / SGB / MVKE | trois colonnes, ambigu par construction |

C'est la même décision que pour GEN / SSB et SKT K / S : deux équipes d'une même organisation
sont deux équipes, et seule celle qui a joué les Worlds a une colonne.

Une seule entrée a été ajoutée à `LIGNEES_ARBITREES` pour la règle 5, et c'est le revers exact
de cette décision : **`SK Telecom T1 K` → T1**. Cette page est la branche qui a gagné les
Worlds 2013, c'est-à-dire la rangée `T1 2013` elle-même, que `PLAN_ALIASES` nomme déjà
« SKT T1 K ». Ni `TeamRedirects` ni `RenamedTo` ne la relient à `T1` ; sans l'entrée, l'année
2014 de Faker, Bengi et Piglet tomberait dans « Autres équipes » avec la colonne T1 juste à
côté. Sa jumelle `SK Telecom T1 S` reste dehors.

### Une étape n'a pas de région

La règle de périmètre — la région d'une rangée est celle de l'édition — décide **à quelle
colonne appartient une rangée**, le modèle n'en portant qu'une région par colonne. Une étape
n'ajoute aucune colonne : elle ne décide donc rien. Elle se pose dans la colonne du club
traversé et hérite de sa région comme d'un **emplacement sur la carte**, pas comme d'une
affirmation sur la ligue jouée cette année-là.

Mesuré : sur les 371 étapes d'année-trou rattachées à une colonne, **327** tombent dans une
colonne dont la région est bien l'une de celles que le joueur a jouées cette année-là, 14 non,
30 ne sont pas décidables (régions Leaguepedia `Asia`, `International`, sans famille). Onze
des quatorze sont la migration de la colonne elle-même, déjà arbitrée au niveau de la colonne
— LMS → LCP pour `TPA`, `AHQ` et `MCX`, GPL → VCS pour `SAJ` et `GAM`. Restent **trois** cas
où le joueur était réellement ailleurs : Edward 2013 (`GMB`), Flame 2016 (`IMT`) et Josedeodo
2025 (`ISG`), tous trois des clubs rejoints en fin d'année civile. Trois cas sur 371 ne
justifient pas de rouvrir le calcul de région étape par étape.

### Ce que la carte a le droit de dire

Après la collecte, une année de joueur est dans l'un de cinq états. Le mot employé ne doit
jamais affirmer plus que la source : un joueur peut être en académie, dans une ligue hors
couverture Leaguepedia, ou simplement n'avoir pas requalifié.

| état | ce qu'on sait | ce qui s'écrit | à ne jamais écrire |
| --- | --- | --- | --- |
| a | a joué les Worlds pour une équipe suivie | la case habituelle | — |
| b | a joué pour un club, pas aux Worlds | « chez X en N » | — |
| c | zéro partie recensée sur l'année | « aucune partie professionnelle recensée » | « sans équipe », « sans club » |
| d | plus aucune partie après N | « dernière apparition connue : N » | « fin de carrière », « retraite » |
| e | aucune partie avant N | « première apparition connue : N » | « débuts », « rookie » |

Un sixième cas existe et n'a **pas** de libellé : une année-trou où le joueur a joué, mais
rien qui soit de niveau `Primary` — dix cas, marqués `offLevel` dans les données. L'état c ne
lui convient pas, puisqu'il a joué ; aucun autre non plus, puisqu'on ne retient pas ces
parties. La carte n'en dit donc rien, et c'est la bonne réponse.

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

## Périmètre : la région d'une rangée est celle de l'édition

La carte suit **cinq ligues** — LCK, LPL, LEC, LCS, LMS. Savoir si une organisation en relève
est la décision qui définit le périmètre, et elle ne se lit pas dans `Teams.Region` :
ce champ donne la région de l'organisation **aujourd'hui**. Il range 100 Thieves et KaBuM!
sous la même étiquette « Americas », Hong Kong Attitude et PSG Talon sous « Asia Pacific »,
Moscow Five sous « Europe » mais Gambit Esports sous « CIS », et il fait avaler par l'EMEA
d'aujourd'hui la Turquie, qui a toujours eu sa propre ligue.

**La règle.** Toutes les équipes des seize éditions ont une colonne — plus aucune n'est hors
périmètre. Ce que la règle décide, c'est **à quelle région appartient chaque rangée** : celle
de la ligue que l'organisation a disputée **l'année de cette édition**, prise sous le nom
qu'elle portait alors. La région se décide donc **rangée par rangée**, jamais organisation par
organisation, et un libellé de région est toujours un **nom de ligue**.

| Région | Ligues qui comptent (`Tournaments.League` ~ `Tournaments.Region`) |
|---|---|
| `LCK` | `LoL The Champions` ~ Korea (2012-2014), `LoL Champions Korea` ~ Korea (2015–), `OGN` ~ Korea |
| `LPL` | `Tencent LoL Pro League` ~ China (2013–) |
| `LEC` | `Europe League Championship Series` ~ Europe (2013-2018), `LoL EMEA Championship` ~ Europe puis ~ EMEA (2019–) |
| `LCS` | `North America League Championship Series` ~ North America (2013-2018), `League of Legends Championship Series` ~ North America (2019-2024, 2026–), `League of Legends Championship of The Americas North` ~ Americas (2025) |
| `LMS` | `LoL Master Series` ~ LMS (2015-2019) |
| `LCP` | `Pacific Championship Series` ~ Asia Pacific (2020-2024), `League of Legends Championship Pacific` ~ Asia Pacific (2025–) |
| `LJL` | `LoL Japan League` ~ Japan puis ~ Asia Pacific |
| `VCS` | `Vietnam Championship Series` ~ Vietnam, et les circuits vietnamiens antérieurs rangés sous `SEA` |
| `GPL` | `Garena Premier League` ~ SEA et les circuits qui lui succèdent, pour l'Asie du Sud-Est hors Vietnam |
| `LCO` | `Oceanic Pro League` ~ Oceania (2015-2020), `LoL Circuit Oceania` ~ Oceania puis ~ Asia Pacific (2021-2023) |
| `TCL` | `Turkish Championship League` ~ Turkey |
| `LCL` | `LoL Continental League` ~ CIS |
| `CBLOL` | `Circuit Brazilian League of Legends` ~ Brazil, `Brazil Regional Finals` |
| `LLA` | `Liga Latinoamerica` ~ Latin America, `Liga Latinoamérica Norte` ~ LAN, `Copa Latinoamérica Sur` ~ LAS, et les coupes latino-américaines antérieures |

**La règle est exécutable.** `fetchRegions()` l'applique à chaque exécution et la § 13 du
rapport confronte le résultat à `PLAN_REGIONS`, qui porte la décision : les **300 rangées**
sont reproduites, et quatre seulement reposent sur le dernier recours.

Trois niveaux de preuve, dans cet ordre, tous tirés de la même source :

1. **la qualification régionale des Worlds de l'année** — un tournoi de ligue
   `World Championship` dont la `Region` est régionale, ou une page de `Regional Finals`.
   C'est l'énoncé le plus direct qui existe : il dit de quelle région l'équipe est *sortie*.
   `Season 2/Regional Finals/Europe` range CLG EU en `LEC`, `/North America` range CLG Prime
   en `LCS`, `/Taiwan` — que Leaguepedia étiquette **region LMS** — range les Taipei Assassins
   en `LMS` dès 2012 ;
2. **la ligue domestique de l'année**, de niveau `Primary`, confrontée à la table ci-dessus ;
3. **le territoire dominant de l'année**, compté en tournois de niveau `Primary` seulement.
   Les éditions de 2011 et 2012 précèdent toutes les ligues : Team WE y relève de `LPL` parce
   que son calendrier 2012 est chinois, Dignitas de `LCS` parce que le sien est
   nord-américain. Le niveau `Primary` est indispensable : sans lui, les deux coupes
   européennes jouées par Dark Passage en 2014 l'emporteraient sur ses cinq journées de TCL.

Deux garde-fous :

- **une participation invitée dans une ligue étrangère ne vaut pas appartenance.** CLG Prime,
  CLG EU et Team WE ont tous trois joué les *Champions* coréens de 2012 en invités. Quand le
  territoire dominant de l'année contredit la ligue et pèse plus du double en tournois, c'est
  le territoire qui l'emporte ;
- **le dernier recours est `Teams.Region`**, et il est signalé comme tel. Un seul cas sur les
  300 rangées des 16 éditions : `Samsung Ozone` 2013, dont Leaguepedia ne garde aucun tournoi
  domestique — ses résultats 2013 vivent sur la page `MVP Ozone`, que `TeamRedirects` ne relie
  pas à `Samsung White`.

**Contrôle.** La règle reproduit les **300 rangées** du jeu de données, sans exception, et
quatre seulement reposent sur son dernier recours. C'est ce qui permet de s'y fier.

### La frontière LMS / PCS

C'est le cas limite le plus net, et la règle le tranche sans arbitrage : **Hong Kong Attitude
(2017, 2019) est dans le périmètre, PSG Talon (2020-2026) non.** Ce qui les sépare n'est ni le
territoire — HKA est hongkongaise, PSG Talon taïwanaise, et la LMS couvrait Taïwan, Hong Kong
et Macao — ni l'organisation, mais **la ligue de l'année** : HKA a joué la `LoL Master Series`,
PSG Talon la `Pacific Championship Series` puis la `League of Legends Championship Pacific`.

La LMS s'arrête donc en **2019**, et c'est déjà un invariant des données : aucune rangée `LMS`
ne porte une année postérieure. La PCS et la LCP sont des familles de région nouvelles, du
ressort de #8c.

Pourquoi la LCS, elle, se prolonge dans la `LTA North` de 2025 alors que la LMS ne se prolonge
pas dans la PCS ? **Parce que le territoire doit être conservé.** La `LTA North` est
l'Amérique du Nord seule, nommée comme conférence d'une structure plus large : la même
colonne, renommée. La PCS ajoute l'Asie du Sud-Est au territoire de la LMS, et la LCP y ajoute
encore le Japon, le Vietnam et l'Océanie : c'est une région plus vaste, pas la même renommée.
Une ligue suivie se prolonge dans son successeur **seulement si celui-ci couvre le même
territoire**.

La même exigence vaut dans l'autre sens, avant 2015. De 2012 à 2014, les équipes de Taïwan et
de Hong Kong jouaient la **GPL**, dont la région Leaguepedia est `SEA` et qui couvrait aussi
le Vietnam, la Thaïlande, les Philippines et Singapour : sa région ne désigne donc pas le
territoire. Quand le seul signal de l'année est la GPL, c'est la `Teams.Location` de
l'organisation qui décide, et seules **Taïwan, Hong Kong et Macao** donnent `LMS` — ce qui
retient les Taipei Assassins, ahq et Gamania Bears, et écarte les Saigon Jokers, Mineski et
Bangkok Titans. Cette dérogation est bornée à l'époque **où aucune ligue ne couvrait le
territoire** : elle ne s'étend jamais à une édition où il en existe une.

### Deux régions Leaguepedia qui n'en sont pas

Deux de ses libellés de région couvrent **plusieurs** familles du projet : leur nom ne désigne
alors aucun territoire, et c'est la `Teams.Location` de l'organisation qui décide.

- **`SEA`** est la région de la GPL puis des circuits qui lui succèdent, de Taïwan au Vietnam
  en passant par la Thaïlande, les Philippines et Singapour. Taïwan, Hong Kong et Macao
  relèvent de la `LMS` — c'est ce qui rattache les Taipei Assassins et ahq avant 2015 — le
  Vietnam de la `VCS`, et le reste demeure `GPL`. Sans cette distinction, la Saigon Jokers de
  2012 et les Bangkok Titans de 2015 tomberaient dans la même région que les Taipei Assassins ;
- **`Americas`** est celle de la LTA South 2025, qui fusionne pour une saison le CBLOL et la
  LLA. Cette fusion ne succède ni à l'un ni à l'autre — le CBLOL rouvre en 2026 — et c'est
  donc la localisation qui tranche sa seule rangée : Vivo Keyd Stars est brésilienne, elle va
  en `CBLOL`. Le pendant nord, `LTA North`, ne pose pas le problème : il couvre l'Amérique du
  Nord seule et prolonge donc la `LCS`.

### La voie du wildcard n'est jamais une région suivie

Une équipe sortie d'un *International Wildcard* ne s'est qualifiée par aucune des cinq ligues,
et n'entre donc pas dans le périmètre quel que soit son calendrier par ailleurs.
**GamingGear.eu** (2013) est le cas qui le montre : son calendrier est européen à dix
tournois sur douze, mais ses seuls tournois de niveau `Primary` sont le wildcard de la
Gamescom 2013 et les Worlds, et sa `Teams.Region` est `CIS`. Dark Passage (2014), KaBuM!
(2014), Bangkok Titans et paiN (2015), INTZ et Albus NoX Luna (2016) sont dans le même cas.

### Les organisations à cheval sur deux régions

Le périmètre se décidant rangée par rangée, une organisation peut avoir des rangées dans deux
familles de région. Trois formes, et une seule qui pose vraiment question :

- **deux pages d'organisation distinctes**, et le problème n'existe pas : `Moscow Five` (2012,
  Europe) et `Gambit Gaming` (2013, EU LCS) ont chacune la sienne, `Gambit Esports` (2017,
  2018, LCL) une troisième. Deux colonnes dans le périmètre, une hors. Même mécanique que
  CLG / CLG EU : une page d'organisation, une colonne ;
- **une organisation qui change de ligue sans changer de territoire** : aucun cas ;
- **une organisation qui change de région** : un seul cas, `LYON`. `TeamRedirects` ramène
  `Six Karma` et `Movistar R7` à la page `LYON (2024 American Team)` — une seule organisation,
  latino-américaine de 2018 à 2024 (rangées 2020, 2023 et 2024, région `Latin America`), puis
  nord-américaine en 2026 (rangée `LCS`). **L'extension aux régions mineures l'a tranché sans
  qu'il faille en décider** : `Movistar R7` a sa propre page d'organisation, donc sa propre
  colonne, en `LLA` — et une page qui est elle-même une colonne n'est jamais absorbée dans la
  lignée d'une autre. La colonne `LYON` ne porte donc que la rangée 2026, et sa fenêtre
  `active` part de `Six Karma` en 2021. C'est le même critère que pour CLG / CLG EU et pour
  Clutch Gaming / Dignitas : une page d'organisation, une colonne.

### Code de colonne

Le code dérive de `Teams.Short`, replié en ASCII majuscule sans ponctuation puis tronqué à
cinq caractères — la forme qu'impose `npm run validate` (`^[A-Z0-9]{2,5}$`) : `aAa` → `AAA`,
`CLG.EU` → `CLGEU`, `LØS` → `LOS`, `100T` et `M5` inchangés. Les collisions se départagent
dans cet ordre : une colonne **déjà publiée** garde son code, sinon il va à l'organisation qui
a joué le plus de parties aux Worlds et l'autre prend son discriminant Leaguepedia replié de
la même façon (`Evil Geniuses.NA` → `EGNA`) ; à défaut de discriminant, l'initiale du second
mot de son nom — `Gambit Esports` devient `GMBE`, `Gambit Gaming` gardant `GMB`. C'est le seul
départage qu'ait demandé les 120 colonnes. Quand `Teams.Short` manque — un cas, `Flamengo
Esports` — le code dérive du nom de la page.

Le **nom** de la colonne est celui de la page d'organisation, privé du discriminant de
désambiguïsation du wiki : `Griffin (Korean Team)` → Griffin, `Rogue (European Team)` → Rogue,
`Evil Geniuses.NA` → Evil Geniuses, `LYON (2024 American Team)` → LYON. Ce discriminant sépare
des pages homonymes, il ne fait pas partie du nom.

## Parcours des équipes

`data/results.json` dit jusqu'où chaque équipe est allée. C'était la dernière donnée encore
établie à la main ; elle vient maintenant de `TournamentResults.Place` sur la page de
l'édition, traduite ainsi :

- **1 → `W`, 2 → `F`, 3-4 → `SF`, 5-8 → `QF`** ;
- au-delà, **`P`** si *tous* les scoreboards de l'équipe sont sur la page `…/Play-In` : elle
  n'a pas atteint le Main Event. Le test porte sur les pages qui comptent réellement ses
  parties, équipe par équipe — une coupure par rang serait à retrouver à chaque édition ;
- sinon **`G`** ou **`S`**, selon les noms de tours du Main Event : `Group Stage` ou
  `Day 1`…`Day 8` de 2011 à 2022, `Round 1`…`Round 5` depuis 2023. Le Play-In est écarté du
  test, lui aussi employant `Round 2`.

**Contrôle** : la § 12 du rapport confronte le calcul à ce qui est saisi, et reproduit les
**300 parcours** sans exception. Seul `F*` — qualifié pour une finale pas encore jouée — reste
posé à la main : Leaguepedia n'attribue pas encore ces deux rangs, et les y laisse à `null`.

## Noms de colonne et doubles équipes d'une même organisation

Le nom d'une colonne est celui de l'organisation **aujourd'hui** ; le nom qu'elle portait à une édition donnée vit dans le champ `name` de la rangée. Les deux sont arrêtés dans `PLAN_TEAM_NAMES` et `PLAN_ALIASES`, en tête de `fetch-worlds.mjs` — Leaguepedia normalise les siens et ne fait donc pas foi.

Plusieurs organisations ont aligné **deux équipes à la même édition**. Ce sont des équipes distinctes, et elles reçoivent donc deux rangées : l'une rejoint la colonne de l'organisation, l'autre reçoit la sienne.

| Édition | Équipes | Colonne de l'org | Colonne propre |
|---|---|---|---|
| Season 2 (2012) | CLG Prime / Counter Logic Gaming Europe | `CLG` ← CLG Prime | `CLGEU`, `active [2012, 2012]` |
| 2013 | SK Telecom T1 K / S | `T1` ← SKT T1 K | — (S n'a pas joué les Worlds) |
| 2014 | Samsung White / Samsung Blue | `GEN` ← Samsung White | `SSB` |

**Le cas CLG, arbitré le 12/11/2026.** Il est le plus épineux des trois, la branche européenne ayant ensuite quitté l'organisation — on pouvait donc défendre que ce soit elle qui garde la colonne. C'est la source qui tranche, sans qu'il faille en décider : `TeamRedirects` ramène `CLG Prime` à la page d'organisation `Counter Logic Gaming` (région North America, sigle `CLG`), tandis que `Counter Logic Gaming Europe` a sa **propre page d'organisation** (région Europe, sigle `CLG.EU`, dissoute). Leaguepedia traite donc CLG Prime comme la continuité de l'org et CLG EU comme une org à part. La colonne `CLG` — qui court déjà de 2011 à 2023 — revient à CLG Prime ; CLG EU reçoit `CLGEU`.

Sa fenêtre `active` suit la règle commune, première et dernière partie sur Leaguepedia toutes compétitions confondues : du 17/06/2012 au 15/12/2012, soit `[2012, 2012]`. La borne de fin est posée parce que l'organisation est dissoute. La colonne est rangée en `LEC`, l'équipe étant européenne — libellé anachronique, comme partout avant 2019.

## Corrections et arbitrages apportés par l'extension à 2011–2012

Les deux premières éditions sont nées directement de l'unification : aucune rangée n'y a été corrigée, puisqu'aucune n'existait. Le pipeline a tourné **sans modification** — seuil de 20 %, poste majoritaire, deux joueurs par poste. Quatre points ont demandé un arbitrage.

| Cas | Décision | Raison |
|---|---|---|
| `BeBe` (TPA 2012 et 2014) | **BeBe** | La fréquence seule basculerait sur `bebe` (9 lignes en 2012 contre 6 en 2014), mais les deux premiers critères de la règle 4 disent tous deux `BeBe` : c'est la graphie de `/data` et celle du titre de page canonique. Dans `GRAPHIES_ARBITREES` |
| `Cyanide FI` (FNC 2011) | **Cyanide**, pas d'`aliases` | Les 11 lignes de 2011 l'écrivent ainsi, mais `FI` est le suffixe de désambiguïsation de Leaguepedia — qui garde aussi `CyanideFI` en redirection — et non un pseudo porté : sa page et son `Players.ID` disent l'un et l'autre `Cyanide`. Dans `COQUILLES_ECARTEES` |
| Chauster (CLG 2011) | **top** | Son poste majoritaire est indécidable, 3 parties en top et 3 en bot. `top` est retenu parce que `bot` revient à bigfatlp (3 sur 6, et bot *est* son poste majoritaire) : déplacer Chauster en bot laisserait le top sans aucun candidat qualifié. Le rapport continue de le signaler en § 4 |
| Classements 2011 | place → libellé | La Season 1 nomme ses tours « Round 1 » à « Round 3 », et non « Quarterfinals » : c'est `MatchSchedule` qui dit où chaque équipe s'est arrêtée, et le classement de `TournamentResults` qui se traduit ensuite comme aux autres éditions (1 → `W`, 2 → `F`, 3-4 → `SF`, 5-8 → `QF`, au-delà → `G`) |

**Un effet de la règle 1 mérite d'être connu** : en 2011 les postes n'étaient pas fixes. Fnatic a fait jouer Shushei 5 fois en top et 6 fois en mid, xPeke 3 et 5 — leur poste majoritaire étant mid, la règle 1 les écarte tous deux du top, qui revient à `wewillfailer` (3 parties sur 11, son poste majoritaire). Ce n'est pas une anomalie mais la règle appliquée telle qu'elle est écrite, sur un roster réellement tournant. Le rapport liste ces onze écartés en § 9.

## Corrections et arbitrages apportés par l'extension aux cinq régions majeures

Le lot a porté la carte de 33 à **66 colonnes** et de 170 à **215 rangées**, sans toucher aux
cinq régions ni à la palette : les 33 organisations ajoutées relevaient déjà d'une des cinq
ligues suivies à l'année où elles ont joué. Elles sortent du § 10 du rapport — les équipes
rencontrées hors périmètre — passé à la règle de la section « Périmètre » ci-dessus : des 89
organisations hors périmètre, 33 entrent, 56 non.

Le pipeline a tourné **sans modification des règles de sélection**. Six points ont demandé un
arbitrage ou une correction.

| Cas | Décision | Raison |
|---|---|---|
| Epik Gamer 2011, bot | **Dyrus** | Roster entièrement tournant sur 7 parties : le bot a été joué par Westrice (3), Dyrus (2) et Doublelift (2), sans être le poste majoritaire d'aucun. La règle 1 n'y qualifie personne et le script y place Westrice par défaut, alors qu'il tient déjà le top (4/7, son poste majoritaire) ; Doublelift tient le support (5/7, le sien). **Cinq joueurs pour cinq postes** : seul le déplacement de Dyrus ne laisse aucun poste vide, et l'affectation est donc forcée, pas choisie. Le top perd sa demi-case. Dans `POSTES_ARBITRES` |
| `Kev1n` (GDE 2011, SK 2012) | **Kev1n**, alias 2011 `Kevin` | La fréquence seule donnerait `Kevin` (5 lignes en 2011 contre 3 en 2012), mais ce n'est pas une différence de casse : c'est un renommage, et l'identité d'un joueur renommé est la graphie de sa page canonique — comme `Jensen` contre `Incarnati0n`. Dans `GRAPHIES_ARBITREES` et `PSEUDOS_EPOQUE` |
| `GoSu Pepper` (M5 2012), `CndyPnda` (GDE 2011), `ackerman` (LMQ 2014) | **pseudos d'époque** | Tous trois survivent en redirection dans `PlayerRedirects`, aux côtés du pseudo retenu. Dans `PSEUDOS_EPOQUE` |
| `homeCountries.LEC` | **+ `RU`, `AM`, `EE`** | Les rosters de Moscow Five (2012) et de Gambit Gaming (2013) sont russes, arméniens et estoniens. La CIS n'avait pas encore de ligue — la LCL n'ouvre qu'en 2015 — et ses joueurs comptaient comme résidents européens : sans ces trois codes, `isImport` les donnerait tous importés |
| `Haro`, `LokeN` et les 360 autres nationalités | **confirmées** | Le script ne relevait que `Players.Country`, le pays de **naissance**, alors que c'est `NationalityPrimary` qui fait foi. Corrigé : les 362 nationalités déjà saisies sont toutes confirmées, et les 119 nouvelles reposent sur le bon champ — ce qui change `Dan Dinh` (né aux Philippines, américain), `nuc` (né au Maroc, français) et `Dhokla` (né en Inde, américain) |
| `active` de `KT`, `TES`, `KC`, `TL` | **élargies** | La règle écrite — première et dernière partie sur Leaguepedia, toutes compétitions confondues — n'avait jamais été appliquée que de mémoire. Calculée, elle reproduit 29 des 33 fenêtres saisies et corrige les quatre autres : `KT` à 2012 (`KT Rolster Bullets`), `TES` à 2017 (`Topsports Gaming`), `KC` à 2020 (`Kameto Corp`), `TL` à 2012 (`Team Curse`) |

Deux effets de la règle 1 méritent d'être connus sur ces éditions anciennes, et le rapport
continue de les signaler en § 4 : **Reyk** (Team gamed!de 2011) a joué autant en mid qu'en top,
son poste majoritaire est indécidable et `mid` est retenu par défaut ; **Chauster** (CLG 2011)
est le cas symétrique, déjà documenté plus haut.

## Corrections et arbitrages apportés par l'extension aux régions mineures

Le lot a porté la carte de 66 à **120 colonnes** et de 215 à **300 rangées** : toutes les
équipes des seize éditions ont désormais une colonne, et le § 10 du rapport — les équipes
rencontrées hors périmètre — est vide. Neuf familles de région sont nées, toutes nommées
d'après une ligue : `LCP`, `LJL`, `VCS`, `GPL`, `LCO`, `TCL`, `LCL`, `CBLOL`, `LLA`. Le
pipeline a de nouveau tourné **sans modification des règles de sélection**.

| Cas | Décision | Raison |
|---|---|---|
| `Violet` | **`Violet (Ngô Mạnh Quyền)`** et **`Violet (Vincent Wong)`** | **Première collision réelle de pseudo du jeu de données.** Deux personnes portent `Violet` et sont désormais toutes deux affichées — Saigon Jokers 2012 et PEACE 2021. La règle 3 veut alors un discriminant repris de Leaguepedia, et ce sont les titres de leurs pages canoniques qui le portent. Sans cela, leurs deux carrières fusionneraient sans alerte. Le discriminant est une **identité**, pas une étiquette : leurs cases affichent `Violet`, via `PSEUDOS_EPOQUE` |
| `M1ssion` (2020, 2022) | **`Mission`** en pseudo d'époque | Chen Hsiao-Hsien s'écrit `M1ssion` de 2017 à 2019 — la graphie que `/data` porte déjà, premier critère de la règle 4 — puis `Mission` sur ses six lignes de 2020 comme sur ses six de 2022. Un `1` contre un `i` est un renommage, pas une différence de casse |
| `ackerman` (LMQ 2014) | **écarté**, la rangée affiche `GoDlike` | Le pseudo était réel et `PlayerRedirects` le garde sous `Ackerman (Xiao Wang)`, mais **une autre personne le porte dans les données** depuis ce lot : Gabriel Agustin Aparicio, chez LØS en 2026. Un pseudo d'époque ne doit jamais usurper celui d'un joueur affiché, et `npm run validate` le refuse. Dans `COQUILLES_ECARTEES` |
| `active` de `LYON` | **[2021]** au lieu de [2018] | `Movistar R7` devient une colonne à part entière, et une page qui est elle-même une colonne n'est jamais absorbée dans la lignée d'une autre. La fenêtre de LYON part donc de `Six Karma`, en 2021 |
| Six carrières à trou | **vérifiées** | `Josedeodo`, `Isles`, `Betty`, `HolyPhoenix`, `dyNquedo` et `tinowns` réapparaissent après cinq à sept éditions d'absence. Une seule page Leaguepedia et un seul nom civil chacun : inscrits dans `HOMONYMES_VERIFIES` |

Trois organisations changent de nom **vers une autre colonne du jeu de données** —
`Young Generation` → `Phong Vũ Buffalo`, `Team Whales` → `Team Secret Whales`,
`MGN Vikings Esports` → `MVK Esports`. Elles gardent chacune leur colonne, par le critère déjà
posé pour `Clutch Gaming` et `Dignitas` : une page d'organisation, une colonne.

## Collecter une édition

```
node scripts/fetch-worlds.mjs          # les 16 éditions
node scripts/fetch-worlds.mjs 2027     # une seule
```

Le script interroge `ScoreboardPlayers`, applique les quatre règles, et écrit dans `.fetch-worlds/` (ignoré par git) un fragment au format `teams.json` par édition, le détail des parties par joueur, et un rapport des cas qu'il ne sait pas trancher. Il **ne modifie jamais** `/data`, qu'il se contente de lire pour signaler les écarts : relancé après une saisie, il ne doit plus rien signaler.

La table année → `OverviewPage` est revérifiée à chaque exécution contre la table `Tournaments`. De 2011 à 2016 une édition tient sur une seule page ; depuis 2017 elle se répartit entre `…/Play-In` et `…/Main Event`, la page parente ne portant aucune ligne — un préfixe `LIKE` les agrège sans double comptage.

**Une édition abrite des qualifications régionales sous son préfixe.** `Season 1 World Championship/Qualifiers/Europe` et `/North America` sont les deux seules du jeu de données, et le `LIKE` les avalerait. Elles ne portent aujourd'hui aucune ligne de scoreboard — aucun filtre de date n'est donc nécessaire, à aucune édition — mais l'exclusion ne repose pas sur ce hasard : `checkPages()` les énumère nommément, en § 1 du rapport, et le script **échoue** si l'une d'elles se met à porter des parties. Le discriminant est la région : une page d'édition et ses phases sont « International », une qualification porte le nom de sa région. Les `Season 2/Regional Finals/*` échappent au problème autrement : elles ne vivent pas sous le préfixe `Season 2 World Championship`.

Deux pièges subsistent pour qui filtrerait par nom, et le script les écarte explicitement : `2023 Worlds Qualifying Series` et les six éditions `IEM … World Championship`.

Oracle's Elixir a été écartée pour les éditions anciennes : téléchargement manuel, et les copies publiques ne couvrent pas 2014-2016.

Deux pièges de l'API, vérifiés :

- `CargoExport` sérialise en **nombre JSON** toute valeur qui ressemble à un nombre : le pseudo `369` arrive en `369`, pas en `"369"`.
- Le champ `Link` du scoreboard est le titre de page **au moment de la partie**, donc parfois une redirection : `Clearlove7` (2017) et `Clearlove` (2018) sont la même personne. La table `PlayerRedirects` donne la page canonique — 796 titres se ramènent à 749 personnes sur les 16 éditions.

Points d'attention pour ces années :

- Les noms d'équipe changent souvent : utiliser le champ `name` de chaque édition (comme `SKT T1 K` dans la colonne T1). Leaguepedia normalise les siens — il écrit `TSM` pour Team SoloMid et `SK Telecom T1` pour SKT T1 K — donc ils ne font pas foi : c'est la table `PLAN_ALIASES` de `fetch-worlds.mjs` qui tranche, et la section « Noms de colonne et doubles équipes » ci-dessous qui la justifie.
- La fenêtre `active` de chaque organisation vient de sa première et de sa dernière partie sur Leaguepedia, toutes compétitions confondues. La borne de fin n'est posée que pour les orgs dissoutes. **`fetch-worlds.mjs` la calcule** depuis `ScoreboardGames` et `Teams.IsDisbanded`, et la § 11 du rapport la confronte à ce qui est saisi : appliquée aux 33 colonnes d'avant le lot 4, elle en reproduit 29 à l'identique, et elle couvre aujourd'hui les 120 sans divergence. Le script ne l'écrit pas dans `/data`. La borne de début est un **minorant** — une page de lignée qu'aucun des trois chemins de résolution n'atteint la fait commencer trop tard — d'où `LIGNEES_ARBITREES`, qui rattache `KT Rolster Bullets`, `KT Rolster Arrows` et `NaJin e-mFire` à leurs colonnes.
- **Les libellés de région sont anachroniques sur les éditions anciennes**, et les extensions à 2011–2012 puis aux 33 colonnes du lot 4 l'accentuent : aucune des cinq ligues n'existait encore. La carte range les équipes dans cinq régions au nom d'aujourd'hui, mais `LMS` n'a existé que de 2015 à 2019 — les colonnes `TPA` et `GAB` portent pourtant des rangées 2012, 2013 et 2014, quand Taïwan relevait encore de la GPL — `LCK` s'appelait OGN Champions en 2013 et `LoL The Champions` en 2012, année de la rangée `AZF`, `LEC` était l'EU LCS jusqu'en 2019 et y sont rangées `CLGEU`, `AAA`, `GDE` et `M5` pour des équipes de 2011 et 2012 qualifiées par un simple tournoi régional, `LCS` n'a démarré qu'en 2013 alors que `TSM`, `CLG`, `EPIK` et `DIG` portent des rangées 2011 ou 2012, et `LPL` n'a démarré qu'en 2013 alors qu'`IG` et `WE` portent des rangées 2012. Trois libellés désignent par ailleurs une ligue plus large que leur nom : `LEC` couvre l'EMEA depuis 2019, `LCS` la conférence nord de la LTA en 2025, et `LMS` le territoire taïwanais avant la création de la ligue. Ces libellés servent à regrouper les colonnes, pas à nommer la ligue de l'époque — la règle qui décide de l'appartenance est celle de la section « Périmètre », et elle se fonde sur la ligue réellement jouée.
- Ajouter les nouvelles années à `years` dans `data/teams.json`, les résultats dans `data/results.json` et les sources dans `data/sources.json`, puis lancer `npm run validate`.

## Nationalités

Table `Players` de Leaguepedia. Attention : `Country` est le pays de **naissance**, et c'est `NationalityPrimary` qui donne la nationalité quand les deux diffèrent — Biofrost est canadien né en Chine, Huhi américain né en France. C'est la **nationalité** qui est retenue dans `data/players.json`, puisque c'est elle qui détermine si un joueur est importé dans sa région.

Sur les 198 nationalités déjà saisies avant l'extension à 2013–2026, cette règle en confirme 196 ; les deux dernières étaient fausses et ont été corrigées — `Haro` et `LokeN`, dans le tableau ci-dessus. Le script ne relevait pourtant que `Country` jusqu'au lot des cinq régions majeures : la règle était écrite, pas outillée. Depuis, il relève les deux champs, et `NationalityPrimary` confirme les **362** nationalités saisies sans exception. Les **481** d'aujourd'hui en viennent toutes.

Un cas limite mérite d'être connu : `Spica` (TSM 2020) est noté **CN**. Il est né en Chine, de citoyenneté chinoise, mais résidait en Amérique du Nord et comptait comme joueur local pour la LCS. Le projet enregistre la **nationalité**, pas la résidence sportive — c'est déjà le cas d'`Impact` et de `CoreJJ`, notés `KR` alors qu'ils jouaient en Amérique du Nord. Il apparaît donc comme joueur importé.

## Pays domestiques de chaque région

`homeCountries` dit qui compte comme joueur **local** dans une région : c'est lui qui décide
si un joueur est importé, et **un code oublié fait passer tout joueur de ce pays pour un
importé, en silence**. `npm run validate` vérifie que chaque région a une liste non vide et
que ses codes sont des ISO à deux lettres — il ne peut rien dire de leur justesse. Chaque
liste est donc une décision, prise une fois, ici.

| Région | Pays domestiques | Pourquoi |
|---|---|---|
| `LCK` | KR | — |
| `LPL` | CN, TW, HK | Taïwan et Hong Kong comptaient comme résidents en LPL |
| `LEC` | les 22 pays d'Europe de l'Ouest déjà listés, plus RU, AM, EE | Moscow Five et Gambit Gaming jouaient le circuit européen avant la LCL, et la résidence EU LCS incluait l'espace post-soviétique |
| `LCS` | US, CA | La résidence nord-américaine ; un joueur d'une autre nationalité y est importé même s'il y réside |
| `LMS` | TW, HK | Le territoire de la ligue |
| `LCP` | TW, HK, VN | Le noyau de la PCS, plus le Vietnam que la LCP absorbe en 2025 |
| `LJL` | JP | Les vingt Coréens de ses rosters sont des importés, et c'est le fait marquant de la ligue |
| `VCS` | VN | — |
| `GPL` | TH, PH, SG | Les trois seuls pays représentés dans ses rangées, Taïwan et le Vietnam ayant leur propre région |
| `LCO` | AU, NZ | La résidence océanienne de l'OPL puis de la LCO |
| `TCL` | TR | — |
| `LCL` | RU, UA, BY, KZ, AM, LT, LV, EE | L'espace post-soviétique, Baltes compris : `GamingGear.eu` est lituanienne et `Blasting` letton, tous deux locaux dans leur région |
| `CBLOL` | BR | — |
| `LLA` | MX, AR, CL, PE, CO, UY, VE | Les pays hispanophones d'Amérique latine ; le Brésil a sa propre ligue et y est donc importé |

Ces listes **n'énumèrent que ce que les données portent**, et sont à compléter quand une
édition amène une nationalité nouvelle — c'est précisément le genre d'omission qu'aucun
contrôle automatique ne rattrape. Un cas est resté dehors sciemment : `Innaxe`, bulgare chez
Unicorns of Love en 2019, est un importé en LCL.

## Licences des sources

- Leaguepedia et Liquipedia : contenus sous licence **CC BY-SA 3.0**.
- Oracle's Elixir : données mises à disposition par Tim Sevenhuysen, à citer en cas de réutilisation.
- Les rosters et résultats sont des faits ; ce dépôt les cite et ne reproduit pas les pages d'origine.
