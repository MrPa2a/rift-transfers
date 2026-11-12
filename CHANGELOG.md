# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions selon [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Corrigé
- **Colonne « Autres régions » : fin des chips fantômes.** Une apparition hors colonne n'y figure plus que si elle touche la carte visible — l'édition du départ, celle du retour, et les clubs qu'une ligne traverserait sinon en silence. Mesuré sur les 31 combinaisons de régions : 1 008 chips avant, 512 après (−49 %). Un clic sur le joueur donne toujours sa carrière complète avec les années exactes, sans filtre.
- **Attache des lignes sous un poste partagé.** Les dix voies de courbe sont réparties sur la largeur pleine d'une case ; pour top droite, jungle droite, bot gauche et support gauche, la voie tombait hors de la demi-case et la ligne semblait sortir de sous le nom voisin — 14 des 17 postes partagés. La ligne descend maintenant droit sous son nom et ne rejoint sa voie qu'une fois dégagée, par un coude. Le système de voies, qui empêche deux postes de se superposer, est inchangé ; les chips pleines sont tracées à l'identique.

### Ajouté
- **Masquer et réafficher une colonne d'équipe.** Un `×` apparaît au survol de l'en-tête, et le tiroir de filtres reçoit une liste à cocher groupée par région, avec « toutes / aucune » par groupe et un « tout réafficher » — c'est elle la source de vérité, le `×` n'en est qu'un raccourci. Les joueurs d'une équipe masquée passent par « Autres équipes », exactement comme ceux d'une région masquée. Les deux filtres **se cumulent** : le masquage d'équipe agit à l'intérieur des régions affichées. La dernière colonne ne peut pas être masquée.
- **Trois états d'en-tête au clic sur une équipe** : la colonne épinglée prend un anneau d'accent, celles qui ont échangé des joueurs avec elle restent normales, les autres sont grisées. Sur les 31 colonnes voisines, 82 % sont grisées en mode « carrières complètes » et 86 % en « arrivées et départs ». L'ensemble « en lien » est dérivé des chips réellement surlignées, donc d'accord avec la période affichée ; l'en-tête « Autres équipes » est en lien dès qu'il en porte une. Le survol ne partage plus le style de la colonne épinglée.
- **Nom du pays en toute lettre** dans le panneau de détail (« Corée du Sud » et non `KR`), par une table `countryNames` dans `data/players.json`. Le badge des chips garde le code à deux lettres, faute de place. `npm run validate` refuse désormais un code de nationalité sans nom français.

### Modifié
- **Débord libre de la carte** : la marge de déplacement au-delà des bords passe d'un `160 px` fixe à `max(320px, 50 % du viewport)`, de quoi dégager la première colonne de sous le tiroir de filtres. « Tout afficher » reste le filet.
- **La barre de recherche et la légende glissent à droite du tiroir de filtres** quand il s'ouvre, au lieu de passer dessous (au-dessus de 900 px de large). Chevrons de la légende inversés : elle se déplie vers le haut.
- **La colonne « Autres régions » devient « Autres équipes »**, puisqu'elle accueille désormais aussi les équipes masquées une à une. Son sous-titre liste les régions masquées puis le nombre d'équipes masquées.
- **Colonne « Autres équipes » rangée par poste** : la rangée vient du poste, comme dans une colonne d'équipe, au lieu d'un rang dans la liste — la chip ne saute plus de ligne d'une année à l'autre et le fil ne zigzague plus. Sa largeur s'adapte au cumul par poste.

## [1.1.0] — 2026-11-11

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
