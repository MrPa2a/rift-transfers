# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions selon [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- `scripts/fetch-worlds.mjs` : collecte des titulaires des 14 éditions depuis Leaguepedia, application des règles de sélection, et rapport des cas à arbitrer.
- Région **LMS** et 11 colonnes historiques : TSM, ahq, CLG, Flash Wolves, OMG, NaJin, H2K, Origen, LGD, Taipei Assassins, Samsung Blue.
- Éditions **2013 à 2016** : 46 rangées, 4 classements, 111 nationalités.
- Neuf rangées qui manquaient sur 2017–2026 : TSM 2017 et 2020, ahq 2017 et 2019, Flash Wolves 2017 et 2018, Splyce 2019, J Team 2019, LGD 2020.
- Six rotations qui manquaient sur 2017–2026 : Haru, Rascal, Ambition, Duke, Deftly, Burdol.
- Champ `active` sur chaque équipe (fenêtre d'existence de l'organisation), champs `aliases` (pseudo porté cette année-là) et `split` (postes affichés en demi-cases) par rangée.
- **Filtre de période** : deux listes d'années et trois préréglages (Tout, Ère moderne 2020→, Ère historique 2013–2019). La coupure tombe en 2020, année où la LMS cesse d'être une région majeure — c'est la rupture la plus nette du jeu de données, là où 2017 était au contraire sa transition la plus continue.
- **Postes partagés en deux demi-cases** : chacune est ciblable, survolable et relie sa propre carrière ; les deux fils d'un même poste suivent des voies distinctes.
- **Repli des colonnes** hors de la fenêtre d'activité de l'organisation : ni roster, ni « Pas aux Worlds ».

### Corrigé
- FlyQuest 2020 : **Solo** au top, et non V1per, qui n'était pas inscrit au roster de l'événement.
- Nationalités de `Haro` (chinois, pas coréen) et de `LokeN` (coréen, pas chinois).

### Modifié
- Règles de sélection des titulaires : seuil de 20 % des parties de l'équipe et poste majoritaire, au lieu du seul « plus de matchs joués ». Deux joueurs au maximum par poste.
- Validateur : rotations de `shared` contrôlées comme les titulaires, cohérence de `active`, champ `aliases`, `homeCountries` obligatoire par région, et détection des homonymes probables.

## [1.0.0] — 2026-11-11

### Ajouté
- Carte plein écran des rosters des Worlds 2017–2026 : 21 équipes, déplacement et zoom.
- Sélection d'un joueur ou d'une équipe (carrières complètes, arrivées et départs).
- Filtres par poste et par région, colonne « Autres régions ».
- Options nationalité et ancienneté, parcours des équipes, statistiques.
- Données en JSON avec sources par année, script de validation et CI.

### Données
- Audit complet des titulaires aux Worlds (voir docs/SOURCES.md) : corrections KT 2018, Fnatic 2020 et 2021, RNG 2021, DK 2024 ; rotations départagées au nombre de matchs ; MAD Lions 2020 et 2022 ajoutés.
