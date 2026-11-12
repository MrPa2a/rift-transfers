# Contribuer

Merci de votre intérêt ! Les contributions les plus utiles sont les **corrections de données** (un joueur au mauvais poste, une rotation manquante, un résultat erroné), toujours accompagnées d'une source.

## Signaler une erreur

Ouvrez une issue avec le modèle « Correction de données » : équipe, année, ce qui est faux, ce qui est juste, et un lien vers une source (page Leaguepedia ou Liquipedia du tournoi, VOD, article).

## Proposer une correction

1. Forkez le dépôt et créez une branche (`fix/fnc-2020-bot` par exemple).
2. Modifiez le fichier concerné dans `data/`.
3. Lancez `npm run validate` : la commande doit afficher « Données valides. »
4. Vérifiez visuellement avec `npm run dev`.
5. Ajoutez la source dans `data/sources.json` et ouvrez une pull request.

Aucune dépendance n'est nécessaire : Node.js 18 ou plus suffit.

## Format des données

### `data/teams.json`

```json
{
  "code": "FNC",
  "name": "Fnatic",
  "region": "LEC",
  "active": [2011],
  "worlds": {
    "2018": {
      "lineup": { "top": "Bwipo", "jungle": "Broxah", "mid": "Caps", "bot": "Rekkles", "support": "Hylissang" },
      "shared": { "top": "sOAZ" }
    }
  }
}
```

| Champ | Rôle |
|---|---|
| `code` | Identifiant unique de la colonne (2 à 5 caractères, majuscules) |
| `name` | Nom actuel de l'organisation |
| `label` / `tag` | Optionnels : texte de l'en-tête et étiquette courte dans « Autres équipes » |
| `region` | L'une des 14 familles : `LCK`, `LPL`, `LEC`, `LCS`, `LMS`, `LCP`, `LJL`, `VCS`, `GPL`, `LCO`, `TCL`, `LCL`, `CBLOL`, `LLA`. Elle vient de la **ligue réellement jouée l'année de l'édition**, pas de la région de l'organisation aujourd'hui : voir [docs/SOURCES.md](docs/SOURCES.md), section « Périmètre » |
| `active` | `[début]` ou `[début, fin]` : la fenêtre d'existence de l'organisation, de sa première à sa dernière partie sur Leaguepedia, la borne de fin n'étant posée que si elle est dissoute. Hors de cette fenêtre, la colonne est repliée. `fetch-worlds.mjs` la calcule — § 11 du rapport |
| `worlds.<année>.name` | Optionnel : nom de l'équipe cette année-là (`SKT T1`, `DAMWON`…) |
| `worlds.<année>.lineup` | Les 5 titulaires, un par poste : voir les règles de sélection dans [docs/SOURCES.md](docs/SOURCES.md) |
| `worlds.<année>.shared` | Optionnel : joueur qui a partagé le poste |
| `worlds.<année>.split` | Optionnel : postes dont le joueur de `shared` a joué au moins 20 % des parties, et s'affiche donc en demi-case plutôt qu'en `*` |
| `worlds.<année>.aliases` | Optionnel : pseudo réellement porté cette année-là, par joueur (`{ "Zven": "Niels" }`) |
| `worlds.<année>.unverified` | Optionnel : postes encore à vérifier (affichés avec `?`) |

Règles :

- **Un joueur s'écrit toujours de la même façon** (même casse) : c'est ce qui relie ses apparitions entre les équipes. Cela vaut pour les titulaires **et** pour les rotations de `shared`, que le validateur contrôle de la même façon.
- Un joueur qui a changé de pseudo garde **une seule** graphie dans `lineup` et `shared` — son identité, donc son fil de carrière. Le pseudo de l'époque se déclare à part, dans `aliases` : la carte l'affiche sans rompre le fil. Une simple différence de casse ne justifie jamais un `aliases`.
- `shared` recense le second joueur d'un poste, qu'il ait beaucoup joué ou non ; `split` dit lesquels ont assez joué pour mériter une demi-case. Un rôle listé dans `split` doit avoir une entrée dans `shared`.
- Un même joueur ne peut pas occuper deux postes d'une même rangée, ni jouer pour deux équipes la même année. Quand les règles de sélection y mènent malgré tout — un roster entièrement tournant, comme Epik Gamer en 2011 — le poste se tranche dans `POSTES_ARBITRES`, en tête du script.
- **Deux personnes au même pseudo reçoivent un discriminant repris de Leaguepedia**, et seulement dans ce cas : les deux `Violet` du jeu de données s'écrivent `Violet (Ngô Mạnh Quyền)` et `Violet (Vincent Wong)` dans `lineup`. Le discriminant est une identité, pas une étiquette — leurs cases affichent `Violet`, par `aliases`.
- On ne renseigne une année que si l'équipe a joué les Worlds cette année-là, et dans la fenêtre `active` si elle est déclarée.
- Le titulaire est retenu sur les parties réellement jouées, pas sur le roster inscrit : au moins 20 % des parties de l'équipe, et le poste où le joueur a le plus joué. [`scripts/fetch-worlds.mjs`](scripts/fetch-worlds.mjs) applique ces règles et signale les écarts avec `data/`.

`npm run validate` signale aussi, en avertissement, tout pseudo dont les apparitions sont séparées par plus de quatre éditions : c'est le garde-fou contre deux personnes fondues en une seule carrière. Après vérification nominative, le pseudo s'inscrit dans `HOMONYMES_VERIFIES`, en tête de [`scripts/validate-data.mjs`](scripts/validate-data.mjs).

### `data/results.json`

Parcours de chaque équipe par année : `W` vainqueur, `F` finale, `SF` demi-finale, `QF` quart, `G` groupes, `S` phase suisse, `P` play-in, `F*` finale pas encore jouée. `fetch-worlds.mjs` les calcule depuis le classement de Leaguepedia — § 12 du rapport — sauf `F*`, qu'il ne peut pas déduire. `ongoingYear` affiche « EN COURS » à côté de l'année ; passez-le à `null` une fois la finale jouée.

### `data/players.json`

Nationalité (code ISO à 2 lettres) par joueur, et pays « domestiques » de chaque région pour repérer les joueurs importés. N'ajoutez une nationalité que si elle est vérifiée : c'est `Players.NationalityPrimary` de Leaguepedia qui fait foi, et non `Players.Country`, qui donne le pays de naissance.

`homeCountries` est une **décision**, pas un relevé : un code oublié fait passer tout joueur de ce pays pour un importé, en silence, et `npm run validate` ne peut vérifier que la forme. Les 14 listes sont justifiées une à une dans [docs/SOURCES.md](docs/SOURCES.md), section « Pays domestiques de chaque région » ; une région nouvelle en exige une.

`countryNames` donne le nom français de chaque code : le panneau de détail écrit « Corée du Sud » là où le badge des chips garde `KR`, faute de place. Un code employé par `nationality` sans entrée dans `countryNames` est une erreur de `npm run validate`.

### `data/careers.json`

Où était chaque joueur les années **sans rangée**, entre deux de ses apparitions aux Worlds — ce qui permet au fil de ne plus sauter le trou.

```json
"clubs": {"Victory Five": "V5", "Nongshim RedForce": "NS"},
"careers": {
  "Faker": {"seen": [2013, 2026], "years": {"2014": {"steps": [{"team": "T1"}]}}},
  "Rookie": {"seen": [2014, 2026], "years": {"2022": {"steps": [{"club": "Victory Five"}]}}},
  "Bwipo": {"seen": [2018, 2026], "years": {"2023": {"steps": []}}},
  "Fudge": {"seen": [2019, 2026], "years": {"2020": {"steps": [], "offLevel": true}}}
}
```

- `team` est un **code de colonne**, `club` un club qui n'en a pas et qui s'affiche dans « Autres équipes ». Une étape porte l'un ou l'autre, jamais les deux. Écrire en `club` le nom d'une colonne est une erreur de `npm run validate` : le fil contournerait une colonne affichée.
- `clubs` donne le **sigle** de chaque club sans colonne : le badge de sa case, replié depuis `Teams.Short` exactement comme un code de colonne, puisque les deux se lisent côte à côte. Une entrée que plus aucune étape ne cite est une erreur de `npm run validate`. Un club **absent** de la table est accepté : sa case reste sans badge, et c'est ce que le script écrit quand la source ne donne pas d'abréviation — on n'en invente pas, et le nom entier écraserait le pseudo du joueur.
- `steps` vide : **aucune partie professionnelle recensée** cette année-là. Avec `offLevel`, le joueur a joué, mais rien qui soit de niveau `Primary` — académie, ligue secondaire, showmatch : on n'en dit alors rien du tout.
- `seen` donne la première et la dernière année où une partie lui est recensée. Ce sont les deux bouts de son fil, et les libellés qui vont avec disent « apparition connue », jamais « début » ni « fin de carrière ».
- Une année qui n'est pas un trou entre deux Worlds du joueur est une erreur, comme une lineup hors de la fenêtre `active` d'une équipe.

La **règle 5** qui retient ces étapes — club majoritaire de l'année, plus tout autre club à 20 % des parties ou plus — est distincte des quatre règles des Worlds, avec son propre filtre de bruit. Elle est décrite dans [docs/SOURCES.md](docs/SOURCES.md), section « Hors Worlds : la règle 5 et les étapes de carrière ». `fetch-worlds.mjs` la calcule en § 14 du rapport ; le fichier se recopie à la main, comme le reste de `/data`.

### `data/sources.json`

Sources par année, avec ce que chacune a permis de vérifier. Voir aussi [docs/SOURCES.md](docs/SOURCES.md).

## Code

Le site est en HTML, CSS et JavaScript sans framework ni étape de build : `index.html`, `assets/css/styles.css`, `assets/js/app.js`. Gardez cette simplicité tant que possible.

## Messages de commit

Format court et explicite, par exemple `data: Rekkles ADC de Fnatic en 2020` ou `feat: filtre par nationalité`.
