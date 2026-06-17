/**
 * One-time generator (#303): create per-system weaponQuality compendium packs that
 * stub-and-reference the canonical Rogue Trader docs.
 *
 * The FFG family shares the same RAW weapon-quality mechanics, so RT
 * (`rt-core-items-weapon-qualities`) owns the authored `system.mechanics`. The other
 * six systems get a parallel pack whose docs carry no mechanics of their own — each
 * sets `system.mechanicsRef` to the matching RT doc's UUID, and the boot index
 * (`weapon-quality-payloads.ts`) follows the ref. This keeps the index genuinely
 * per-system while the shared values stay authored once.
 *
 * Re-runnable: stub `_id`s are derived deterministically from `<system>:<identifier>`,
 * so a re-run overwrites in place rather than producing duplicates.
 *
 * Usage:  node scripts/generate-stub-weapon-quality-packs.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RT_PACK_NAME = 'rt-core-items-weapon-qualities';
const RT_SOURCE = join(ROOT, 'src/packs/rogue-trader', RT_PACK_NAME, '_source');

/** system id → pack directory under src/packs. RT is the canonical source, not a target. */
const TARGET_SYSTEMS = {
    bc: 'black-crusade',
    dh1: 'dark-heresy-1',
    dh2: 'dark-heresy-2',
    dw: 'deathwatch',
    ow: 'only-war',
    im: 'imperium-maledictum',
};

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Deterministic 16-char Foundry-style id from a stable key (sha256 → base62). */
function stableId(key) {
    const bytes = createHash('sha256').update(key).digest();
    let id = '';
    for (let i = 0; i < 16; i += 1) {
        id += ID_CHARS[bytes[i] % ID_CHARS.length];
    }
    return id;
}

const rtFiles = readdirSync(RT_SOURCE).filter((f) => f.endsWith('.json'));
let written = 0;

for (const [systemId, dir] of Object.entries(TARGET_SYSTEMS)) {
    const packName = `${systemId}-core-items-weapon-qualities`;
    const outDir = join(ROOT, 'src/packs', dir, packName, '_source');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    for (const file of rtFiles) {
        const rt = JSON.parse(readFileSync(join(RT_SOURCE, file), 'utf8'));
        const identifier = rt?.system?.identifier;
        if (typeof identifier !== 'string' || identifier === '') continue;

        const stubId = stableId(`${systemId}:${identifier}`);
        const stub = {
            name: rt.name,
            type: 'weaponQuality',
            img: rt.img,
            system: {
                identifier,
                hasLevel: rt.system.hasLevel ?? false,
                level: rt.system.level ?? null,
                effect: { [systemId]: '' },
                notes: { [systemId]: '' },
                description: { [systemId]: { value: '' } },
                gameSystems: [systemId],
                // Canonical mechanics live on the RT doc; follow the ref at boot.
                mechanicsRef: `Compendium.wh40k-rpg.${RT_PACK_NAME}.Item.${rt._id}`,
            },
            effects: [],
            flags: {},
            _id: stubId,
        };
        writeFileSync(join(outDir, `${identifier}_${stubId}.json`), `${JSON.stringify(stub, null, 4)}\n`);
        written += 1;
    }
}

console.log(`[generate-stub-weapon-quality-packs] wrote ${written} stub doc(s) across ${Object.keys(TARGET_SYSTEMS).length} systems (${rtFiles.length} RT docs each).`);
