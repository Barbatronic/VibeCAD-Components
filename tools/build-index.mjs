#!/usr/bin/env node
/**
 * Construit index.json, le catalogue lu par VibeCAD : la bibliothèque (library.json), puis une
 * collection par dossier, chacune avec ses composants (fiches <id>.json). Un composant est
 * l'ensemble des fichiers de même nom : <id>.vibecad, <id>.step, <id>.png, <id>.json.
 *
 *   node tools/build-index.mjs           écrit index.json
 *   node tools/build-index.mjs --check   vérifie seulement (index à jour, fichiers présents)
 *
 * Aucune dépendance : Node 18 ou plus.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const errors = [];
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const library = readJson(join(ROOT, 'library.json'));
const collections = readdirSync(ROOT)
  .filter((d) => !d.startsWith('.') && !['tools', 'node_modules'].includes(d) && statSync(join(ROOT, d)).isDirectory())
  .sort()
  .map((dir) => {
    const meta = existsSync(join(ROOT, dir, 'collection.json')) ? readJson(join(ROOT, dir, 'collection.json')) : {};
    const files = readdirSync(join(ROOT, dir));
    const ids = [...new Set(files.filter((f) => /\.(vibecad|step)$/.test(f)).map((f) => f.replace(/\.(vibecad|step)$/, '')))].sort((a, b) =>
      a.localeCompare(b, 'fr', { numeric: true }),
    );
    const components = ids.map((id) => {
      const sheet = files.includes(`${id}.json`) ? readJson(join(ROOT, dir, `${id}.json`)) : { id, name: id };
      const file = (ext) => (files.includes(`${id}.${ext}`) ? `${dir}/${id}.${ext}` : null);
      const entry = { ...sheet, id, files: { vibecad: file('vibecad'), step: file('step'), preview: file('png') } };
      if (!entry.files.vibecad && !entry.files.step) errors.push(`${dir}/${id} : ni .vibecad ni .step`);
      if (!entry.files.preview) errors.push(`${dir}/${id} : vignette ${id}.png manquante`);
      return entry;
    });
    return { id: dir, name: meta.name ?? dir, description: meta.description ?? '', components };
  })
  .filter((c) => c.components.length > 0);

const index = { format: 'vibecad-library', version: 1, ...library, collections };

// Tableau des composants du README, entre les deux marqueurs.
const START = '<!-- composants:début (généré par tools/build-index.mjs) -->';
const END = '<!-- composants:fin -->';
const table = collections
  .map((c) => {
    const rows = c.components.map((k) => {
      const img = k.files.preview ? `<img src="${k.files.preview}" width="96" alt="">` : '';
      const files = [k.files.vibecad && `[.vibecad](${k.files.vibecad})`, k.files.step && `[.step](${k.files.step})`].filter(Boolean).join(' · ');
      return `| ${img} | **${k.name}**<br>${k.description ?? ''} | ${files} |`;
    });
    return [`### ${c.name} (\`${c.id}/\`)`, '', c.description, '', '| | Composant | Fichiers |', '|---|---|---|', ...rows].join('\n');
  })
  .join('\n\n');
const readmePath = join(ROOT, 'README.md');
const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : '';
const a = readme.indexOf(START);
const b = readme.indexOf(END);
const nextReadme = a >= 0 && b > a ? `${readme.slice(0, a)}${START}\n${table}\n${readme.slice(b)}` : readme;
if (check && nextReadme !== readme) errors.push('README.md : tableau des composants pas à jour : lancer node tools/build-index.mjs');
const text = JSON.stringify(index, null, 2) + '\n';
const current = existsSync(join(ROOT, 'index.json')) ? readFileSync(join(ROOT, 'index.json'), 'utf8') : '';
if (check && current !== text) errors.push('index.json n’est pas à jour : lancer node tools/build-index.mjs');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
if (!check) {
  writeFileSync(join(ROOT, 'index.json'), text);
  if (nextReadme !== readme) writeFileSync(readmePath, nextReadme);
}
const count = collections.reduce((n, c) => n + c.components.length, 0);
console.log(`${check ? 'Index à jour' : 'index.json écrit'} : ${collections.length} collections, ${count} composants.`);
