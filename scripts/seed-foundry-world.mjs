#!/usr/bin/env node
/**
 * Seed a Foundry V14 world's users.db with a single Gamemaster user, so the
 * Tier B e2e suite can land in /game on join. Idempotent: a second run with
 * the same user name is a no-op.
 *
 * Usage:
 *   node scripts/seed-foundry-world.mjs [worldPath]
 *   FOUNDRY_TEST_PORT=30001 node scripts/seed-foundry-world.mjs
 *
 * Defaults to the .foundry-release/data-test/Data/worlds/wh40k-e2e world.
 */

import { ClassicLevel } from 'classic-level';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WORLD_PATH = process.argv[2] ?? resolve('.foundry-release/data-test/Data/worlds/wh40k-e2e');
const USERS_DB = resolve(WORLD_PATH, 'data', 'users.db');
const GM_NAME = 'Gamemaster';
const GM_ID = 'GamemasterTest01'; // 16 chars — matches Foundry's randomID width.

mkdirSync(resolve(WORLD_PATH, 'data'), { recursive: true });

const db = new ClassicLevel(USERS_DB, { keyEncoding: 'utf8', valueEncoding: 'json' });
await db.open();

let existing;
try {
    existing = await db.get(GM_ID);
} catch (err) {
    if (err.code !== 'LEVEL_NOT_FOUND') throw err;
    existing = undefined;
}

if (!existing) {
    await db.put(GM_ID, {
        _id: GM_ID,
        name: GM_NAME,
        role: 4, // CONST.USER_ROLES.GAMEMASTER
        password: '',
        avatar: null,
        character: null,
        color: '#cc6600',
        pronouns: '',
        hotbar: {},
        permissions: {},
        flags: {},
        _stats: {
            coreVersion: '14.349',
            systemId: 'wh40k-rpg',
            systemVersion: '0.0.1',
            createdTime: Date.now(),
            modifiedTime: Date.now(),
            lastModifiedBy: null,
            compendiumSource: null,
            duplicateSource: null,
        },
    });
    console.log(`[seed-foundry-world] inserted Gamemaster user → ${USERS_DB}`);
} else {
    console.log(`[seed-foundry-world] Gamemaster user already present → ${USERS_DB}`);
}

await db.close();
