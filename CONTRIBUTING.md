# Contributing

Thanks for your interest! The most useful contributions are **data corrections** (a player at the wrong role, a missing rotation, a wrong result), always with a source. You can write in French or in English.

## Reporting a mistake

Open an issue with the "Data correction" template: team, year, what is wrong, what is right, and a link to a source (the tournament's Leaguepedia or Liquipedia page, a VOD, an article). From the map, the About panel opens it pre-filled with the team, the edition and the active filters.

## Proposing a fix

1. Fork the repository and create a branch (`fix/fnc-2020-bot`, for instance).
2. Edit the relevant file in `data/`.
3. Run `npm run validate`: the command must print "Data valid." and "Interface text valid."
4. Check it visually with `npm run dev`.
5. Add the source to `data/sources.json` and open a pull request.

No dependency is needed: Node.js 18 or later is enough.

## Data format

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

| Field | Role |
|---|---|
| `code` | Unique identifier of the column (2 to 5 characters, upper case) |
| `name` | Current name of the organisation |
| `label` / `tag` | Optional: header text, and short label in "Other teams" |
| `region` | One of the 14 families: `LCK`, `LPL`, `LEC`, `LCS`, `LMS`, `LCP`, `LJL`, `VCS`, `GPL`, `LCO`, `TCL`, `LCL`, `CBLOL`, `LLA`. It comes from the **league actually played in the edition's year**, not from the organisation's region today: see [docs/SOURCES.md](docs/SOURCES.md), section « Périmètre » |
| `active` | `[start]` or `[start, end]`: the organisation's lifetime, from its first to its last game on Leaguepedia, the end only being set if it has disbanded. Outside this window, the column is collapsed. `fetch-worlds.mjs` computes it — § 11 of its report |
| `worlds.<year>.name` | Optional: the team's name that year (`SKT T1`, `DAMWON`…) |
| `worlds.<year>.lineup` | The 5 starters, one per role: see the selection rules in [docs/SOURCES.md](docs/SOURCES.md) |
| `worlds.<year>.shared` | Optional: a player who shared the role |
| `worlds.<year>.split` | Optional: roles whose `shared` player played at least 20% of the games, and is therefore shown as a half-slot rather than a `*` |
| `worlds.<year>.aliases` | Optional: the handle actually worn that year, per player (`{ "Zven": "Niels" }`) |
| `worlds.<year>.unverified` | Optional: roles still to be checked (shown with `?`) |

Rules:

- **A player is always spelled the same way** (same case): that is what links their appearances across teams. This holds for starters **and** for the rotations in `shared`, which the validator checks the same way.
- A player who changed handles keeps **a single** spelling in `lineup` and `shared` — their identity, hence their career thread. The handle of the time is declared separately, in `aliases`: the map shows it without breaking the thread. A mere difference in case never justifies an `aliases`.
- `shared` lists a role's second player, whether they played a lot or not; `split` says which ones played enough to earn a half-slot. A role listed in `split` must have an entry in `shared`.
- The same player cannot hold two roles in one row, nor play for two teams in the same year. When the selection rules lead there anyway — an entirely rotating roster, like Epik Gamer in 2011 — the role is settled in `POSTES_ARBITRES`, at the top of the script.
- **Two people with the same handle get a disambiguator taken from Leaguepedia**, and only then: the dataset's two `Violet` are written `Violet (Ngô Mạnh Quyền)` and `Violet (Vincent Wong)` in `lineup`. The disambiguator is an identity, not a label — their slots show `Violet`, through `aliases`.
- A year is only filled in if the team played Worlds that year, and within the `active` window if one is declared.
- The starter is chosen on games actually played, not on the registered roster: at least 20% of the team's games, at the role where the player played most. [`scripts/fetch-worlds.mjs`](scripts/fetch-worlds.mjs) applies these rules and reports any divergence from `data/`.

Besides the 120 columns, `data/teams.json` carries three header tables: `years`, the list of editions; `regions`, the 14 families; and `leagueNames`, the name of the league behind each acronym — `LCK` → "LoL Champions Korea". This name is read when hovering the region pill, with its geographic area; it comes from `Leagues.League`, which `fetch-worlds.mjs` collects again and compares with `/data` (§ 15 of its report). **A region without a name is an `npm run validate` error**: it is never filled in from memory. The area, for its part, is derived from `homeCountries` and is not typed in — see [docs/SOURCES.md](docs/SOURCES.md), section « Nom de ligue et zone géographique d'une région ».

`npm run validate` also warns about any handle whose appearances are more than four editions apart: it is the safeguard against two people merged into a single career. Once checked by name, the handle goes into `HOMONYMES_VERIFIES`, at the top of [`scripts/validate-data.mjs`](scripts/validate-data.mjs).

### `data/results.json`

Each team's result per year: `W` winner, `F` final, `SF` semi-final, `QF` quarter-final, `G` groups, `S` Swiss stage, `P` play-in, `F*` final not yet played. The `labels` are read on the map and in its legend: they therefore carry **both interface languages**, and `npm run validate` requires them. `fetch-worlds.mjs` computes them from Leaguepedia's standings — § 12 of its report — except `F*`, which it cannot deduce. `ongoingYear` shows "ONGOING" next to the year; set it to `null` once the final has been played.

### `data/players.json`

Nationality (2-letter ISO code) per player, and the "domestic" countries of each region, used to spot imported players. Only add a nationality once verified: Leaguepedia's `Players.NationalityPrimary` is authoritative, not `Players.Country`, which gives the country of birth.

`homeCountries` is a **decision**, not a reading: a forgotten code silently turns every player from that country into an import, and `npm run validate` can only check the shape. The 14 lists are justified one by one in [docs/SOURCES.md](docs/SOURCES.md), section « Pays domestiques de chaque région »; a new region needs one.

`countryNames` gives each code's name **in both interface languages** — `"KR": { "fr": "Corée du Sud", "en": "South Korea" }`: the detail panel spells the country out where the slots' badge keeps `KR`, for lack of room. The English names are the ISO 3166 short names, the usual form being kept where ISO gives a long administrative one, as the French column already does. A code used by `nationality` without an entry, or an entry missing one of the two languages, is an `npm run validate` error.

### `data/careers.json`

Where each player was in the years **without a row**, between two of their Worlds appearances — which lets the thread stop skipping the gap.

```json
"clubs": {"Victory Five": "V5", "Nongshim RedForce": "NS"},
"careers": {
  "Faker": {"seen": [2013, 2026], "years": {"2014": {"steps": [{"team": "T1"}]}}},
  "Rookie": {"seen": [2014, 2026], "years": {"2022": {"steps": [{"club": "Victory Five"}]}}},
  "Bwipo": {"seen": [2018, 2026], "years": {"2023": {"steps": []}}},
  "Fudge": {"seen": [2019, 2026], "years": {"2020": {"steps": [], "offLevel": true}}}
}
```

- `team` is a **column code**, `club` a club that has no column and is shown in "Other teams". A step carries one or the other, never both. Writing a column's name as a `club` is an `npm run validate` error: the thread would go around a displayed column.
- `clubs` gives the **acronym** of each club without a column: the badge of its slot, derived from `Teams.Short` exactly like a column code, since the two are read side by side. An entry no step cites any more is an `npm run validate` error. A club **missing** from the table is accepted: its slot stays without a badge, and that is what the script writes when the source gives no abbreviation — none is invented, and the full name would crowd out the player's handle.
- Empty `steps`: **no professional game recorded** that year. With `offLevel`, the player did play, but nothing at the `Primary` level — academy, secondary league, showmatch: nothing at all is said then.
- `seen` gives the first and last years a game is recorded for them. They are the two ends of the thread, and the labels that go with them say "known appearance", never "debut" or "end of career".
- A year that is not a gap between two of the player's Worlds is an error, like a lineup outside a team's `active` window.

**Rule 5**, which selects these steps — the year's majority club, plus any other club at 20% of the games or more — is distinct from the four Worlds rules, with its own noise filter. It is described in [docs/SOURCES.md](docs/SOURCES.md), section « Hors Worlds : la règle 5 et les étapes de carrière ». `fetch-worlds.mjs` computes it in § 14 of its report; the file is copied over by hand, like the rest of `/data`.

### `data/sources.json`

Sources per year, with what each one made it possible to check. See also [docs/SOURCES.md](docs/SOURCES.md).

## Code

The site is HTML, CSS and JavaScript with no framework and no build step: two pages — the landing page `index.html` and the map `map/index.html` —, three stylesheets — `base.css` (fonts and colour tokens, shared), `styles.css` (the map), `landing.css` —, and the modules of `assets/js/` — `app.js`, `i18n.js`, `tour.js`, `report.js`, `demo.js` (the landing page's live hero: the map itself, framed with `?demo`), `landing.js`. Keep it that simple for as long as possible. There is no runtime dependency, and the fonts live in the repository; the one third-party call is the Cloudflare Web Analytics script, which only counts visits — nothing on the site may depend on it.

The interface is **bilingual**, and no displayed text is written in JavaScript: everything goes through `assets/js/i18n.js`, where each key carries its two spellings side by side — the only form in which a string missing in one language shows at a glance. In the page, `data-i18n` fills a text, `data-i18n-html` a rich text, `data-i18n-attr="title:key;aria-label:key"` attributes. A label that JavaScript writes once and for all is registered through `libelle()`, so that switching languages rewrites it without reloading the page.

The map's HTML leaves its translated elements empty. The **landing page** does not: it is the part of the site search engines index, so it also writes its English text in the HTML, next to the key. That second copy is checked — `npm run validate` runs `scripts/validate-i18n.mjs`, which refuses a key missing from the dictionary, a dictionary entry missing a language, and any gap between a page's static English and the dictionary's. Change a landing string in both places, or the check fails.

Code identifiers are in French (`GRAPHIES_ARBITREES`, `libelle()`…), and they stay so: [docs/SOURCES.md](docs/SOURCES.md) refers to them by name. Comments are in English.

## Commit messages

Short and explicit, for instance `data: Rekkles ADC for Fnatic in 2020` or `feat: nationality filter`.
