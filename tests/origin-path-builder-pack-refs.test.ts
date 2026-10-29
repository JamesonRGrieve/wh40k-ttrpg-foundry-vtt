/**
 * Regression guard: the origin-path builder reads the packs whose manifest flags
 * rank them for its line, and every step it shows resolves to content.
 *
 * History: the builder once resolved packs from a name list in each line's
 * config, and a name that matched no registered pack was skipped with a
 * console.warn — a SILENT failure that left every step list empty. The builder
 * now selects packs by their declared `originBuilder` / `startingEquipment`
 * ranks (`src/module/utils/line-packs.ts`), so these tests read the same flags
 * from the declared manifest and assert the ranks are well formed, every
 * home-step pack is offered, and every core step has content. They do NOT need
 * a live Foundry — configs are plain objects reached via SystemConfigRegistry
 * (see system-config-header-fields.test.ts for the same `game.i18n` stub pattern).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemConfigRegistry } from '../src/module/config/game-systems/index.ts';
import { ALL_SYSTEM_IDS, type GameSystemId } from '../src/module/config/game-systems/types.ts';
import { HAS_PRIVATE_CONTENT } from '../src/module/testing/private-content.ts';
import { type BuilderPackRole, isLineBookPack, packLineFlags } from '../src/module/utils/line-packs.ts';
import { builderPackNames, declaredPacks, stepsInPack } from './helpers/origin-pack-content.ts';

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

const SYSTEM_IDS: readonly GameSystemId[] = ALL_SYSTEM_IDS;
const ROLES: readonly BuilderPackRole[] = ['originBuilder', 'startingEquipment'];

describe.skipIf(!HAS_PRIVATE_CONTENT)('origin-path builder pack ranks are well formed', () => {
    it('the manifest declares packs (guards against an empty/garbled manifest read)', () => {
        expect(declaredPacks().length).toBeGreaterThan(0);
    });

    for (const id of SYSTEM_IDS) {
        for (const role of ROLES) {
            it(`${id}: ${role} ranks run 1..N with no gap or repeat`, () => {
                const ranks = declaredPacks()
                    .map((pack) => packLineFlags(pack))
                    .filter((flags) => flags?.line === id)
                    .map((flags) => flags?.[role])
                    .filter((rank): rank is number => rank !== undefined)
                    .sort((a, b) => a - b);
                expect(ranks).toEqual(ranks.map((_, index) => index + 1));
            });
        }

        it(`${id}: has packs ranked for exactly the builder steps it declares`, () => {
            const config = SystemConfigRegistry.get(id).getOriginStepConfig();
            expect(builderPackNames(id, 'originBuilder').length > 0).toBe(config.coreSteps.length > 0);
            expect(builderPackNames(id, 'startingEquipment').length > 0).toBe(config.equipmentStep != null);
        });
    }
});

describe.skipIf(!HAS_PRIVATE_CONTENT)('every registered home-step origin pack is offered by the builder (#222)', () => {
    // A home-step pack (DH2 home worlds, DW chapters) the builder does not read
    // leaves those origins unselectable — "no selections available".
    const homeStepGroups: { id: GameSystemId; category: string }[] = [
        { id: 'dh2', category: 'origins-homeworlds' },
        { id: 'dw', category: 'origins-chapters' },
    ];

    for (const { id, category } of homeStepGroups) {
        it(`${id}: reads every ${category} pack`, () => {
            const registered = declaredPacks()
                .filter((pack) => isLineBookPack(pack, id, category))
                .map((pack) => pack.name);
            expect(registered.length, `expected registered ${category} packs`).toBeGreaterThan(0);
            const read = new Set(builderPackNames(id, 'originBuilder'));
            const missing = registered.filter((name) => !read.has(name));
            expect(missing, `${id} home-step packs not offered by the builder: ${missing.join(', ')}`).toEqual([]);
        });
    }
});

describe.skipIf(!HAS_PRIVATE_CONTENT)('origin-path builder steps resolve to compendium content', () => {
    // A configured step renders empty unless some item in the step's packs carries
    // a matching `system.step`. This is the failure mode that hid the DH2 pack-name
    // drift, the DH1 careerPath/career mismatch, and the IM missing-step-metadata —
    // each left a wired step with zero options. Guard it for every system.
    //
    // Known pre-existing gap (NOT introduced here, tracked separately): OW's config
    // declares a `regiment` step, but its content items use `regimentType` and OW
    // chargen (a composite of home world / CO / regiment type / doctrines) is only
    // partially wired. Documented here so the guard stays green for the wired
    // systems while still catching any NEW empty step — including a future OW fix
    // narrowing this set. Tighten as OW gets wired.
    const KNOWN_EMPTY_STEPS: Partial<Record<GameSystemId, string[]>> = { ow: ['regiment'] };

    for (const id of SYSTEM_IDS) {
        it(`${id}: every core step has a matching origin item (modulo known gaps)`, () => {
            const config = SystemConfigRegistry.get(id).getOriginStepConfig();
            const availableSteps = new Set(builderPackNames(id, 'originBuilder').flatMap((pack) => stepsInPack(pack)));
            const emptySteps = config.coreSteps.map((s) => s.step).filter((step) => !availableSteps.has(step));
            expect(emptySteps, `${id} steps with no matching compendium items: ${emptySteps.join(', ')}`).toEqual(KNOWN_EMPTY_STEPS[id] ?? []);
        });
    }
});
