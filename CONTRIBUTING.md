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
| `label` / `tag` | Optionnels : texte de l'en-tête et étiquette courte dans « Autres régions » |
| `region` | `LCK`, `LPL`, `LEC` ou `LCS` |
| `worlds.<année>.name` | Optionnel : nom de l'équipe cette année-là (`SKT T1`, `DAMWON`…) |
| `worlds.<année>.lineup` | Les 5 joueurs ayant joué le plus de matchs à chaque poste pendant le tournoi |
| `worlds.<année>.shared` | Optionnel : joueur qui a partagé le poste |
| `worlds.<année>.unverified` | Optionnel : postes encore à vérifier (affichés avec `?`) |

Règles :

- **Un joueur s'écrit toujours de la même façon** (même casse) : c'est ce qui relie ses apparitions entre les équipes.
- On ne renseigne une année que si l'équipe a joué les Worlds cette année-là.
- Le titulaire est celui qui a joué le plus de matchs, pas celui qui était inscrit comme titulaire.

### `data/results.json`

Parcours de chaque équipe par année : `W` vainqueur, `F` finale, `SF` demi-finale, `QF` quart, `G` groupes, `S` phase suisse, `P` play-in, `F*` finale pas encore jouée. `ongoingYear` affiche « EN COURS » à côté de l'année ; passez-le à `null` une fois la finale jouée.

### `data/players.json`

Nationalité (code ISO à 2 lettres) par joueur, et pays « domestiques » de chaque région pour repérer les joueurs importés. N'ajoutez une nationalité que si elle est vérifiée.

### `data/sources.json`

Sources par année, avec ce que chacune a permis de vérifier. Voir aussi [docs/SOURCES.md](docs/SOURCES.md).

## Code

Le site est en HTML, CSS et JavaScript sans framework ni étape de build : `index.html`, `assets/css/styles.css`, `assets/js/app.js`. Gardez cette simplicité tant que possible.

## Messages de commit

Format court et explicite, par exemple `data: Rekkles ADC de Fnatic en 2020` ou `feat: filtre par nationalité`.
