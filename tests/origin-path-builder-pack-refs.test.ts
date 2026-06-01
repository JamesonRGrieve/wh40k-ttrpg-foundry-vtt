/**
 * Regression guard: every compendium pack a game-system config lists for the
 * origin-path builder MUST be a pack name registered in system.json.
 *
 * History: the builder shows nothing for any origin step because
 * `OriginPathBuilder._loadOrigins()` resolves packs by
 * `game.packs.get('wh40k-rpg.<name>')` (with a `metadata.name` fallback), and
 * a missing pack is skipped with a console.warn — a SILENT failure. The DH2
 * config referenced `dh2-core-stats-homeworlds` while the registered packs are
 * `dh2-core-origins-homeworlds` (and BC/DW/RT/OW dropped the `-origins-` infix
 * entirely), so every pack resolved to nothing and all step lists rendered
 * empty. No test linked the config pack references to the registered packs, so
 * the drift was invisible.
 *
 * This test reads the pack names straight from system.json (the manifest
 * Foundry loads from) and asserts every `packs` / `equipmentPacks` entry across
 * all seven configs resolves. It does NOT require a live Foundry — configs are
 * plain objects reached via SystemConfigRegistry (see
 * system-config-header-fields.test.ts for the same `game.i18n` stub pattern).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemConfigRegistry } from '../src/module/config/game-systems/index.ts';
import type { GameSystemId } from '../src/module/config/game-systems/types.ts';
import { stepsInPack } from './helpers/origin-pack-content.ts';

interface I18nStub {
    localize: (key: string) => string;
    format: (key: string) => string;
}
interface GameStub {
    i18n: I18nStub;
}
interface GlobalShim {
    game?: GameStub | undefined;
}
const G = globalThis as GlobalShim;
const ORIGINAL_GAME = G.game;

beforeAll(() => {
    G.game = {
        i18n: {
            localize: (key: string): string => key,
            format: (key: string): string => key,
        },
    };
});

afterAll(() => {
    G.game = ORIGINAL_GAME;
});

/**
 * Pack names registered in system.json. `game.packs.get('wh40k-rpg.<name>')`
 * resolves by exactly this `name` field, so it is the authoritative set the
 * builder's pack references must match.
 */
function registeredPackNames(): Set<string> {
    const raw = readFileSync(resolve(__dirname, '../src/system.json'), 'utf8');
    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); cast to the minimal system.json shape we read, name narrowed below
    const manifest = JSON.parse(raw) as { packs?: ReadonlyArray<{ name?: unknown }> };
    const names = new Set<string>();
    for (const pack of manifest.packs ?? []) {
        if (typeof pack.name === 'string') names.add(pack.name);
    }
    return names;
}

const PACK_NAMES = registeredPackNames();
const SYSTEM_IDS: GameSystemId[] = ['bc', 'dh1', 'dh2', 'dw', 'im', 'ow', 'rt'];

describe('origin-path builder pack references resolve to registered compendiums', () => {
    it('system.json registers packs (guards against an empty/garbled manifest read)', () => {
        expect(PACK_NAMES.size).toBeGreaterThan(0);
    });

    for (const id of SYSTEM_IDS) {
        const config = SystemConfigRegistry.get(id).getOriginStepConfig();
        const refs = [...config.packs, ...(config.equipmentPacks ?? [])];

        it(`${id}: every configured origin/equipment pack exists in system.json`, () => {
            const missing = refs.filter((name) => !PACK_NAMES.has(name));
            expect(missing, `${id} references unregistered packs: ${missing.join(', ')}`).toEqual([]);
        });
    }
});

describe('origin-path builder steps resolve to compendium content', () => {
    // A configured step renders empty unless some item in the step's packs carries
    // a matching `system.step`. This is the failure mode that hid the DH2 pack-name
    // drift, the DH1 careerPath/career mismatch, and the IM missing-step-metadata —
    // each left a wired step with zero options. Guard it for every system that
    // declares both steps and packs (systems still unwired skip cleanly).
    //
    // Known pre-existing gap (NOT introduced here, tracked separately): OW's config
    // declares a `regiment` step, but its content items use `regimentType` and OW
    // chargen (a composite of home world / CO / regiment type / doctrines) is only
    // partially wired. Documented here so the guard stays green for the wired
    // systems while still catching any NEW empty step — including a future OW fix
    // narrowing this set. Tighten as OW gets wired.
    const KNOWN_EMPTY_STEPS: Partial<Record<GameSystemId, string[]>> = { ow: ['regiment'] };

    for (const id of SYSTEM_IDS) {
        const config = SystemConfigRegistry.get(id).getOriginStepConfig();
        if (config.coreSteps.length === 0 || config.packs.length === 0) continue;

        it(`${id}: every core step has a matching origin item (modulo known gaps)`, () => {
            const availableSteps = new Set(config.packs.flatMap((pack) => stepsInPack(pack)));
            const emptySteps = config.coreSteps.map((s) => s.step).filter((step) => !availableSteps.has(step));
            expect(emptySteps, `${id} steps with no matching compendium items: ${emptySteps.join(', ')}`).toEqual(KNOWN_EMPTY_STEPS[id] ?? []);
        });
    }
});
