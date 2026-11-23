#!/usr/bin/env node
// Checks the interface text: the dictionary of assets/js/i18n.js, and the pages that use it.
// Usage: node scripts/validate-i18n.mjs   (run by `npm run validate`, after validate-data.mjs)
//
// Three checks, no dependency:
//  1. every dictionary key carries both languages, and nothing else;
//  2. every key a page names — `data-i18n`, `data-i18n-html`, `data-i18n-attr` — exists;
//  3. wherever a page **also** writes the English text itself, that text is the dictionary's,
//     to the letter (whitespace aside). The landing page does so everywhere — it is the indexable
//     part of the site, read by crawlers that do not run the script — and the map does so in its
//     <head> metas. Two copies of one string are the drift the side-by-side dictionary exists to
//     prevent: this check is what makes the second copy safe.
import { readFile } from "node:fs/promises";
import { DICTIONNAIRE } from "../assets/js/i18n.js";

const LANGS = ["fr", "en"];
// Pages to read, and whether every translated element must carry its English text in the HTML.
const PAGES = [
  { fichier: "index.html", statique: true },
  { fichier: "map/index.html", statique: false },
];
// Elements that cannot hold text: their key only ever drives attributes.
const VIDES = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

const errors = [];

// --- 1. the dictionary
for (const [cle, entree] of Object.entries(DICTIONNAIRE)) {
  const manque = LANGS.filter((l) => typeof entree[l] !== "string");
  if (manque.length) errors.push(`i18n.js "${cle}": missing ${manque.join(", ")}`);
  const extra = Object.keys(entree).filter((l) => !LANGS.includes(l));
  if (extra.length) errors.push(`i18n.js "${cle}": unknown language ${extra.join(", ")}`);
}

// --- 2 and 3. the pages
const blanc = (s) => s.replace(/\s+/g, " ").trim();
const ENTITES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
const decoder = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (brut, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITES[e.toLowerCase()] ?? brut;
});
// What `textContent` would give: tags dropped, entities decoded.
const texte = (html) => blanc(decoder(html.replace(/<[^>]*>/g, "")));
const attributs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(([, n, v]) => [n.toLowerCase(), decoder(v)]));

// Content of the element whose opening tag ends at `fin`: scan forward, counting nested elements
// of the same name, to its matching closing tag.
function contenu(html, nom, fin) {
  const re = new RegExp(`<(/?)${nom}\\b[^>]*>`, "gi");
  re.lastIndex = fin;
  let profondeur = 1, m;
  while ((m = re.exec(html))) {
    profondeur += m[1] ? -1 : 1;
    if (!profondeur) return html.slice(fin, m.index);
  }
  return null;
}

for (const { fichier, statique } of PAGES) {
  // Comments and scripts are not page text: a key quoted in a comment is not a key in use.
  const html = (await readFile(new URL(`../${fichier}`, import.meta.url), "utf8"))
    .replace(/<!--[\s\S]*?-->/g, (c) => " ".repeat(c.length))
    .replace(/<script\b[\s\S]*?<\/script>/gi, (c) => " ".repeat(c.length));
  const anglais = (cle, ou) => {
    const entree = DICTIONNAIRE[cle];
    if (!entree) { errors.push(`${fichier} ${ou}: unknown key "${cle}"`); return null; }
    return entree.en;
  };
  for (const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*>/gi)) {
    const tag = m[0], nom = m[1].toLowerCase(), attrs = attributs(tag);
    const ligne = html.slice(0, m.index).split("\n").length;
    const ou = `line ${ligne} <${nom}>`;

    for (const type of ["data-i18n", "data-i18n-html"]) {
      const cle = attrs[type];
      if (!cle) continue;
      const en = anglais(cle, ou);
      if (en == null || VIDES.has(nom)) continue;
      const brut = contenu(html, nom, m.index + tag.length);
      if (brut == null) { errors.push(`${fichier} ${ou}: no closing tag`); continue; }
      // A text key is compared as text, a rich-text key as the markup it injects.
      const ecrit = type === "data-i18n" ? texte(brut) : blanc(brut);
      const attendu = blanc(en);
      if (!ecrit) {
        if (statique && attendu) errors.push(`${fichier} ${ou}: "${cle}" has no static text — this page must carry its English in the HTML`);
      } else if (ecrit !== attendu) {
        errors.push(`${fichier} ${ou}: static text differs from the English of "${cle}"\n    page: ${ecrit}\n    i18n: ${attendu}`);
      }
    }

    if (attrs["data-i18n-attr"]) {
      for (const paire of attrs["data-i18n-attr"].split(";")) {
        const i = paire.indexOf(":");
        if (i <= 0) { errors.push(`${fichier} ${ou}: malformed data-i18n-attr "${paire}"`); continue; }
        const nomAttr = paire.slice(0, i).trim().toLowerCase(), cle = paire.slice(i + 1).trim();
        const en = anglais(cle, ou);
        if (en == null) continue;
        const ecrit = attrs[nomAttr];
        if (ecrit == null) {
          if (statique) errors.push(`${fichier} ${ou}: "${nomAttr}" is not written — this page must carry its English in the HTML`);
        } else if (blanc(ecrit) !== blanc(en)) {
          errors.push(`${fichier} ${ou}: ${nomAttr} differs from the English of "${cle}"\n    page: ${blanc(ecrit)}\n    i18n: ${blanc(en)}`);
        }
      }
    }
  }
}

console.log(`${Object.keys(DICTIONNAIRE).length} interface keys, ${PAGES.length} pages.`);
if (errors.length) {
  for (const e of errors) console.error(`  ERROR · ${e}`);
  console.error(`${errors.length} error(s).`);
  process.exit(1);
}
console.log("Interface text valid.");
