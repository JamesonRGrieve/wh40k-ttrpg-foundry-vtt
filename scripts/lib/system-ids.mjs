// Single source for the seven game-system ids in the build scripts.
//
// The canonical definition is `ALL_SYSTEM_IDS` in
// src/module/config/game-systems/types.ts (the `GameSystemId` tuple). The
// scripts are plain Node ESM and cannot import that .ts at runtime, so this
// module re-derives the list from the source text rather than hardcoding a
// copy that could silently diverge from the type. Order matches the tuple.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TYPES_PATH = resolve(process.cwd(), 'src/module/config/game-systems/types.ts');

function deriveSystemIds() {
    const src = readFileSync(TYPES_PATH, 'utf8');
    const m = src.match(/export const ALL_SYSTEM_IDS\s*=\s*\[([^\]]*)\]\s*as const/);
    if (!m) {
        throw new Error(
            `[system-ids] could not find ALL_SYSTEM_IDS in ${TYPES_PATH}. ` +
                'Has the GameSystemId tuple moved or changed shape?',
        );
    }
    const ids = m[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    if (ids.length === 0) throw new Error('[system-ids] derived an empty system-id list.');
    return ids;
}

export const SYSTEM_IDS = deriveSystemIds();
