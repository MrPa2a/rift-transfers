# Rift Transfers

Carte interactive des rosters des grandes équipes de League of Legends aux **Worlds 2017 → 2026**. Chaque équipe est une colonne, chaque édition des Worlds une rangée, et chaque joueur un fil coloré par poste : on suit sa carrière d'une équipe à l'autre, ou la vie d'une équipe en descendant sa colonne.

![Aperçu de Rift Transfers](docs/screenshot.png)

## Fonctionnalités

- Carte plein écran : déplacement à la souris ou au doigt, zoom à la molette ou au pincement.
- 21 équipes des quatre grandes régions (LCK, LPL, LEC, LCS), 2017 à 2026.
- Survol ou clic sur un joueur pour isoler toute sa carrière ; clic sur une équipe pour voir ses joueurs, ou seulement ses arrivées et départs.
- Filtres par poste et par région. Une région masquée laisse une colonne « Autres régions » pour garder la trace des transferts.
- Options : nationalité (avec repérage des joueurs importés) et ancienneté dans l'équipe.
- Parcours de chaque équipe à chaque édition, et statistiques (joueurs les plus présents, rosters stables, flux entre régions, imports).

## Les données

Une rangée montre **les cinq joueurs qui ont joué les Worlds pour l'équipe**, et non le roster de la saison. Quand un poste a été partagé, le titulaire affiché est celui qui a joué le plus de matchs (`*` sur la carte).

Toutes les données sont dans [`data/`](data/) au format JSON, avec leurs sources :

| Fichier | Contenu |
|---|---|
| [`teams.json`](data/teams.json) | Équipes et titulaires par édition |
| [`results.json`](data/results.json) | Parcours de chaque équipe |
| [`players.json`](data/players.json) | Nationalités vérifiées |
| [`sources.json`](data/sources.json) | Sources année par année |

La méthode de vérification (nombre de matchs joués par joueur, matchs joués ensemble…) et les pistes pour remonter avant 2017 sont décrites dans [docs/SOURCES.md](docs/SOURCES.md).

## Lancer le projet en local

Prérequis : Node.js 18 ou plus. Aucune dépendance à installer.

```bash
npm run dev        # http://localhost:5173
npm run validate   # vérifie la cohérence des données
```

Le site doit être servi par un serveur web : ouvrir `index.html` directement depuis le disque ne permet pas de charger les fichiers JSON.

## Structure

```
index.html              # page unique
assets/css/styles.css   # styles (thème clair et sombre)
assets/js/app.js        # chargement des données et rendu de la carte
data/                   # données JSON et sources
docs/SOURCES.md         # méthode, sources, extension avant 2017
scripts/serve.mjs       # serveur de développement sans dépendance
scripts/validate-data.mjs
```

## Contribuer

Une erreur dans un roster ? Ouvrez une issue avec une source, ou proposez directement la correction : voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Code sous licence [MIT](LICENSE). Les données sont compilées à partir des sources citées dans [docs/SOURCES.md](docs/SOURCES.md), qui gardent leurs propres licences (Leaguepedia et Liquipedia : CC BY-SA 3.0).

Projet de fan, non affilié à Riot Games. League of Legends est une marque de Riot Games, Inc.
