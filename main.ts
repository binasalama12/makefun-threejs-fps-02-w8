// Citadel Heights — the hand-in program (Node 22, standard library only).
//
// The game itself lives in game/ as plain static files: the browser loads them as
// ES modules, pulls three.js in through an import map, and never touches the
// network. This program's whole job is delivery. It mirrors game/ and
// screenshots/ from beside this file into the output directory and then writes
// dossier.json there with buildDossier from the vendored make.fun library — the
// dossier is the summary the judge reads, so it must be produced by that library
// and nothing else.
//
// On the platform the output directory is /output. Anywhere else, point
// MAKEFUN_OUTPUT_DIR at a scratch folder to rehearse the hand-in:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The caps below are the scorer's own limits, passed through so this program
// refuses exactly what the scorer would refuse: the dossier text ceiling, at
// most 4 screenshots of 256 KiB each, and game/ held to 993 entries and 48 MiB.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);
