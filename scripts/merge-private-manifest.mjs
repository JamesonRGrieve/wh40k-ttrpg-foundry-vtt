#!/usr/bin/env node
/**
 * Merge the private pack declarations (`src/packs-private/system.packs.json`) into
 * a built manifest — run by the campaign deploy right after it merges the private
 * packs into `dist/packs`. Public builds never run this, so their manifest keeps
 * only the public packs. See scripts/lib/pack-manifest.mjs.
 *
 * Usage: node scripts/merge-private-manifest.mjs [dist/system.json] [fragment]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergePackManifest, PRIVATE_PACK_MANIFEST } from './lib/pack-manifest.mjs';

const target = resolve(process.argv[2] ?? 'dist/system.json');
const fragmentFile = resolve(process.argv[3] ?? PRIVATE_PACK_MANIFEST);

const system = JSON.parse(readFileSync(target, 'utf8'));
const fragment = JSON.parse(readFileSync(fragmentFile, 'utf8'));
const merged = mergePackManifest(system, fragment);
writeFileSync(target, `${JSON.stringify(merged, null, 4)}\n`);
console.log(`merge-private-manifest: ${target} packs ${(system.packs ?? []).length} -> ${merged.packs.length}, packFolders -> ${merged.packFolders.length}`);
