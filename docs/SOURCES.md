# Sources et méthode

Ce document explique comment les données de Rift Transfers ont été vérifiées, et comment les étendre. La liste exhaustive des sources, année par année, est aussi disponible au format machine dans [`data/sources.json`](../data/sources.json).

## Ce que représente une rangée

Une rangée = **les cinq joueurs qui ont joué les Worlds pour l'équipe cette année-là**, et non le roster de la saison. Un joueur arrivé après les Worlds, ou parti avant, n'apparaît pas dans la rangée.

- Quand deux joueurs se sont partagé un poste pendant le tournoi, le titulaire affiché est **celui qui a joué le plus de matchs**. L'autre est indiqué dans `shared` et apparaît au survol (`*` sur la carte).
- Un remplaçant inscrit qui n'a joué aucun match (« DNP ») n'est pas affiché.
- Une équipe absente des Worlds une année donnée n'a pas de rangée cette année-là : aucun roster n'est déduit.

## Méthode de vérification

| Années | Méthode principale | Compléments |
|---|---|---|
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

## Étendre la carte avant 2017

Pistes, de la plus fiable à la plus manuelle :

1. **Matchs joués ensemble 2012–2016** : le jeu de données *LeagueOfLegendsCompetitiveNetwork* couvre déjà ces années (fichier `sub_edge_lists/WORLDS`). Même méthode que pour 2017–2020.
2. **Oracle's Elixir** : les fichiers de matchs commencent en 2014 ([téléchargement](https://oracleselixir.com/tools/downloads)). Même filtre `league` + date qu'en 2022–2024.
3. **Liquipedia** : les pages des anciennes éditions (`https://liquipedia.net/leagueoflegends/World_Championship/2016`, etc.) affichent les rosters avec les remplaçants « DNP » (le format a fonctionné pour 2017 et 2021).
4. **Leaguepedia** : pages `…/Team_Rosters` de chaque tournoi, avec le nombre de matchs par joueur. À consulter dans un navigateur.

Points d'attention pour ces années :

- Plusieurs organisations alignaient deux équipes (Samsung White / Samsung Blue en 2014, SK Telecom T1 K / S en 2013). Ce sont des équipes distinctes : il faut décider si elles partagent une colonne.
- Les noms d'équipe changent souvent : utiliser le champ `name` de chaque édition (comme `SKT T1` dans la colonne T1).
- Ajouter les nouvelles années à `years` dans `data/teams.json`, les résultats dans `data/results.json` et les sources dans `data/sources.json`, puis lancer `npm run validate`.

## Licences des sources

- Leaguepedia et Liquipedia : contenus sous licence **CC BY-SA 3.0**.
- Oracle's Elixir : données mises à disposition par Tim Sevenhuysen, à citer en cas de réutilisation.
- Les rosters et résultats sont des faits ; ce dépôt les cite et ne reproduit pas les pages d'origine.
