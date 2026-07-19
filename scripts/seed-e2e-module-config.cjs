#!/usr/bin/env node
/*
 * seed-e2e-module-config.cjs <world-dir>
 *
 * Pre-seed a Foundry world's `core.moduleConfiguration` setting so the world
 * BOOTS with Item Piles + socketlib + lib-wrapper all active — giving the modules
 * a clean, complete init (item-piles-ready fires, socketlib wires, our
 * integration applies). This is the world-PROVISIONING step that lets the
 * skip-gated real-module Tier B spec (tests/e2e/item-piles-module.spec.ts)
 * actually RUN instead of skipping. Runtime enabling (set + reload) was rejected:
 * it half-activates and pollutes the shared world (see that spec's header).
 *
 * Writes directly into the world's settings LevelDB (created if absent) as a
 * Setting document — the same shape Foundry's ClientSettings persists
 * (common/documents/setting.mjs): { _id, key, value: <JSON string>, user, _stats }
 * under the `!settings!<id>` key. A directory-backed ClassicLevel DB is NOT a
 * legacy NEDB `.db` file, so this does not trip Foundry's NEDB migration (the
 * hazard the setup script warns about for users.db).
 *
 * Idempotent + preserving: merges the three modules into any existing
 * moduleConfiguration (keeping other modules' state) rather than clobbering it.
 * No-op cleanly when the module cache isn't installed (nothing to enable).
 */
const path = require('node:path');
const fs = require('node:fs');

const REPO_ROOT = path.resolve(__dirname, '..');
const { ClassicLevel } = require(path.join(REPO_ROOT, '.foundry-release', 'node_modules', 'classic-level'));

// The modules the real-module e2e tier needs co-active. Only seed those whose
// binaries are actually present in the cache, so a partial cache never enables a
// missing module (which would make Foundry disable the dependents at boot).
const WANTED = ['lib-wrapper', 'socketlib', 'item-piles'];
const SETTING_ID = 'e2eModuleCfgSeed'; // 16-char stable id
const SETTING_KEY = 'core.moduleConfiguration';

function installedModules() {
    const cacheDir = path.join(REPO_ROOT, '.foundry-test-modules');
    return WANTED.filter((id) => fs.existsSync(path.join(cacheDir, id, 'module.json')));
}

async function main() {
    const worldDir = process.argv[2];
    if (!worldDir) {
        console.error('usage: seed-e2e-module-config.cjs <world-dir>');
        process.exit(2);
    }
    const enable = installedModules();
    if (enable.length === 0) {
        console.log('[seed-e2e-module-config] module cache empty — nothing to enable, skipping');
        return;
    }

    const settingsDir = path.join(worldDir, 'data', 'settings');
    fs.mkdirSync(settingsDir, { recursive: true });
    const db = new ClassicLevel(settingsDir, { valueEncoding: 'json' });
    await db.open();
    try {
        // Find an existing moduleConfiguration Setting (any id) to preserve+merge.
        let existingKey = `!settings!${SETTING_ID}`;
        let current = {};
        for await (const [k, v] of db.iterator()) {
            if (v && v.key === SETTING_KEY) {
                existingKey = k;
                try {
                    current = typeof v.value === 'string' ? JSON.parse(v.value) : (v.value ?? {});
                } catch {
                    current = {};
                }
                break;
            }
        }
        const merged = { ...current };
        for (const id of enable) merged[id] = true;

        const doc = {
            _id: SETTING_ID,
            key: SETTING_KEY,
            value: JSON.stringify(merged), // JSONField persists as a JSON string
            user: null,
            _stats: {
                compendiumSource: null,
                duplicateSource: null,
                coreVersion: null,
                systemId: null,
                systemVersion: null,
                createdTime: null,
                modifiedTime: null,
                lastModifiedBy: null,
            },
        };
        // If an existing record lived under a different id, drop it so there is
        // exactly one moduleConfiguration setting.
        if (existingKey !== `!settings!${SETTING_ID}`) await db.del(existingKey);
        await db.put(`!settings!${SETTING_ID}`, doc);
        console.log(`[seed-e2e-module-config] enabled ${enable.join(', ')} in ${settingsDir}`);
    } finally {
        await db.close();
    }
}
main().catch((e) => {
    console.error('[seed-e2e-module-config] failed:', e);
    process.exit(1);
});
