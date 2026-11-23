/*
 * Rift Transfers — pre-filled GitHub issues.
 *
 * The "About" panel offers two reports, one per issue form in .github/ISSUE_TEMPLATE/. GitHub
 * fills an issue form from the URL: `template` names the file, and every other parameter is the
 * `id` of a field. This module is the only place that knows those file names and field ids — rename
 * one in a template and it has to change here too, or the field simply stays empty.
 *
 * The context block is written in **English** whatever the interface language, and it does not go
 * through i18n.js: it is not interface text but a technical report read by the maintainer, like
 * the console messages, and keeping one wording makes reports comparable with one another. The
 * visitor sees it on GitHub, in an editable field, before anything is sent.
 */

export const DEPOT = "https://github.com/MrPa2a/rift-transfers";

// Template file name, and the field ids it declares.
const FORMULAIRES = {
  bug: { template: "bug.yml", titre: "[Bug] ", contexte: "context" },
  donnees: { template: "data-correction.yml", titre: "[Data] ", contexte: "context", equipe: "team" },
};

// What the map knows about itself, as a few short lines. `etat` is built by app.js — this module
// sees no `state`, only what it is handed.
function contexte(e) {
  const liste = (choisis, tous) => (choisis.length === tous.length ? "all" : choisis.length ? choisis.join(", ") : "none");
  const tactile = matchMedia("(pointer: coarse)").matches ? "yes" : "no";
  const ecran = `${innerWidth}×${innerHeight} viewport, pixel ratio ${devicePixelRatio || 1}, screen ${screen.width}×${screen.height}, touch ${tactile}`;
  const langues = (navigator.languages?.length ? navigator.languages : [navigator.language]).join(", ");
  const options = [e.nationalite && "nationality", e.anciennete && "tenure"].filter(Boolean);
  const isolement = [e.annee != null && `edition ${e.annee}`, e.isole && "selection"].filter(Boolean);
  return [
    `- Link: ${e.lien}`,
    `- Browser: ${navigator.userAgent}`,
    `- Screen: ${ecran}`,
    `- Language: ${e.langue} (browser: ${langues})`,
    `- Period: ${e.periode[0]}–${e.periode[1]}`,
    `- Roles: ${liste(e.postes, e.tousPostes)}`,
    `- Regions: ${liste(e.regions, e.toutesRegions)}`,
    `- Worlds appearances: ${e.minApps}+`,
    `- Hidden columns: ${e.masquees.length ? e.masquees.join(", ") : "none"}`,
    `- Options: ${options.length ? options.join(", ") : "none"}`,
    `- Team click mode: ${e.modeEquipe}`,
    `- Selection: ${e.selection || "none"}`,
    `- Isolation: ${isolement.length ? isolement.join(" + ") : "none"}`,
    `- Zoom: ${e.zoom}%`,
  ].join("\n");
}

// `type`: "bug" or "donnees". The data form also gets its "Team and year" field when the map
// names one — a pinned team, an isolated edition, or both.
export function urlRapport(type, etat) {
  const f = FORMULAIRES[type];
  const url = new URL(`${DEPOT}/issues/new`);
  url.searchParams.set("template", f.template);
  url.searchParams.set("title", f.titre);
  url.searchParams.set(f.contexte, contexte(etat));
  if (f.equipe) {
    const equipe = [etat.equipe, etat.annee].filter((v) => v != null).join(" ");
    if (equipe) url.searchParams.set(f.equipe, equipe);
  }
  return url.href;
}
