/**
 * Personal weapon-modification resolution (#136, the DH2 core rules).
 *
 * `FitModificationActionData` attaches the modification and uses up the parts
 * on a success. On DH2 a failure loses the parts, and 2+ degrees of failure
 * make the weapon Unreliable (or strip Reliable). A line printing only a plain
 * Trade (Armourer) test keeps the parts on a failure. `RemoveModificationActionData`
 * always detaches the modification and returns the parts only on a success.
 * Either attempt spends a xenos lore insight (a DH2 supplement's rule).
 */

import { afterAll, describe, expect, it } from 'vitest';
import { buildApplicationV2Api, type ApplicationV2Api } from '../src/module/testing/app-v2-stub.ts';

interface FoundryStub {
    applications: { api: ApplicationV2Api; handlebars: { renderTemplate: () => Promise<string> } };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with framework-defined key/value types.
    utils: { Collection: new () => Map<unknown, unknown> };
}
interface GameStub {
    i18n: { localize: (key: string) => string; format: (key: string, data?: Record<string, string>) => string };
    user: { id: string };
    settings: { get: () => boolean };
    wh40k: { log: () => void; error: () => void };
}
interface FoundryStubs {
    foundry?: FoundryStub | undefined;
    game?: GameStub | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the stub shape; `declare global` cannot augment globalThis from a test file without leaking into global scope.
const stubs = globalThis as unknown as FoundryStubs;
const ORIGINAL = { foundry: stubs.foundry, game: stubs.game };

stubs.foundry = {
    applications: { api: buildApplicationV2Api(), handlebars: { renderTemplate: async (): Promise<string> => Promise.resolve('') } },
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with arbitrary key/value types per the framework type.
    utils: { Collection: class FakeCollection extends Map<unknown, unknown> {} },
};
stubs.game = {
    i18n: {
        localize: (key: string): string => key,
        format: (key: string, data?: Record<string, string>): string => `${key}|${JSON.stringify(data ?? {})}`,
    },
    user: { id: 'test' },
    settings: { get: (): boolean => false },
    wh40k: {
        log: (): void => {
            /* noop */
        },
        error: (): void => {
            /* noop */
        },
    },
};

// Imports must come AFTER the stubs so module-init code finds the shims.
const { FitModificationActionData, RemoveModificationActionData } = await import('../src/module/rolls/weapon-modification-action-data.ts');
const { DH2_WEAPON_MODIFICATION_RULES } = await import('../src/module/config/game-systems/dh2-config.ts');
const { TRADE_ARMOURER_FITTING_RULES } = await import('../src/module/config/game-systems/base-system-config.ts');

afterAll(() => {
    Object.assign(stubs, ORIGINAL);
});

type Entry = {
    uuid: string;
    name: string;
    active: boolean;
    category: string;
    cachedModifiers: { damage: number; penetration: number; toHit: number; range: number; weight: number };
};

function entry(uuid: string, name: string): Entry {
    return { uuid, name, active: true, category: 'accessory', cachedModifiers: { damage: 0, penetration: 0, toHit: 0, range: 0, weight: 0 } };
}

/** A weapon standing in for a real Foundry Item: only the surface the actions read and write. */
interface FakeWeapon {
    name: string;
    system: { modifications: Entry[]; special: string[] };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update payloads are open-ended Records
    updates: Array<Record<string, unknown>>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update payloads are open-ended Records
    update: (patch: Record<string, unknown>) => Promise<FakeWeapon>;
}

function makeWeapon(special: string[] = [], modifications: Entry[] = []): FakeWeapon {
    const weapon: FakeWeapon = {
        name: 'Lasgun',
        system: { modifications, special },
        updates: [],
        update: async (patch): Promise<FakeWeapon> => {
            weapon.updates.push(patch);
            return Promise.resolve(weapon);
        },
    };
    return weapon;
}

interface FakeParts {
    name: string;
    system: { quantity: number };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update payloads are open-ended Records
    updates: Array<Record<string, unknown>>;
    deleted: boolean;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update payloads are open-ended Records
    update: (patch: Record<string, unknown>) => Promise<FakeParts>;
    delete: () => Promise<FakeParts>;
}

function makeParts(quantity = 1): FakeParts {
    const parts: FakeParts = {
        name: 'Red-Dot Laser Sight',
        system: { quantity },
        updates: [],
        deleted: false,
        update: async (patch): Promise<FakeParts> => {
            parts.updates.push(patch);
            return Promise.resolve(parts);
        },
        delete: async (): Promise<FakeParts> => {
            parts.deleted = true;
            return Promise.resolve(parts);
        },
    };
    return parts;
}

type AnyAction = InstanceType<typeof FitModificationActionData> | InstanceType<typeof RemoveModificationActionData>;

/** Bind a resolved roll outcome onto an action, mirroring the live pipeline. */
function resolve(action: AnyAction, outcome: { success: boolean; dos?: number; dof?: number }): void {
    action.rollData.success = outcome.success;
    action.rollData.dos = outcome.dos ?? 0;
    action.rollData.dof = outcome.dof ?? 0;
}

function cardText(action: AnyAction): string {
    return action.effectOutput.map((e) => e.effect).join(' ');
}

const SIGHT = entry('Compendium.wh40k-rpg.dh2-weapon-mods.Item.sight', 'Red-Dot Laser Sight');

describe('FitModificationActionData — Trade (Armourer) fitting (DH2)', () => {
    it('fits the modification and uses up the last set of parts on a success', async () => {
        const weapon = makeWeapon();
        const parts = makeParts();
        const action = new FitModificationActionData(weapon, parts, SIGHT, DH2_WEAPON_MODIFICATION_RULES, false);
        resolve(action, { success: true, dos: 2 });
        await action.descriptionText();
        expect(weapon.updates).toEqual([{ 'system.modifications': [SIGHT] }]);
        expect(parts.deleted).toBe(true);
        expect(cardText(action)).toContain('WH40K.WeaponModification.Fitted');
    });

    it('shrinks a stack of parts by one instead of deleting it', async () => {
        const parts = makeParts(3);
        const action = new FitModificationActionData(makeWeapon(), parts, SIGHT, DH2_WEAPON_MODIFICATION_RULES, false);
        resolve(action, { success: true });
        await action.descriptionText();
        expect(parts.updates).toEqual([{ 'system.quantity': 2 }]);
        expect(parts.deleted).toBe(false);
    });

    it('DH2: a failure by one degree loses the parts and leaves the weapon alone', async () => {
        const weapon = makeWeapon();
        const parts = makeParts();
        const action = new FitModificationActionData(weapon, parts, SIGHT, DH2_WEAPON_MODIFICATION_RULES, false);
        resolve(action, { success: false, dof: 1 });
        await action.descriptionText();
        expect(weapon.updates).toEqual([]);
        expect(parts.deleted).toBe(true);
        expect(cardText(action)).toContain('WH40K.WeaponModification.FitFailedPartsLost');
    });

    it('DH2: two or more degrees of failure make the weapon Unreliable', async () => {
        const weapon = makeWeapon(['tearing']);
        const action = new FitModificationActionData(weapon, makeParts(), SIGHT, DH2_WEAPON_MODIFICATION_RULES, false);
        resolve(action, { success: false, dof: 2 });
        await action.descriptionText();
        expect(weapon.updates).toEqual([{ 'system.special': ['tearing', 'unreliable'] }]);
        expect(cardText(action)).toContain('WH40K.WeaponModification.WeaponDamaged');
    });

    it('DH2: a Reliable weapon loses Reliable instead', async () => {
        const weapon = makeWeapon(['reliable']);
        const action = new FitModificationActionData(weapon, makeParts(), SIGHT, DH2_WEAPON_MODIFICATION_RULES, false);
        resolve(action, { success: false, dof: 3 });
        await action.descriptionText();
        expect(weapon.updates).toEqual([{ 'system.special': [] }]);
    });

    it('DH1 / RT / OW: a failed plain test keeps the parts and the weapon', async () => {
        const weapon = makeWeapon();
        const parts = makeParts();
        const action = new FitModificationActionData(weapon, parts, SIGHT, TRADE_ARMOURER_FITTING_RULES, false);
        resolve(action, { success: false, dof: 4 });
        await action.descriptionText();
        expect(weapon.updates).toEqual([]);
        expect(parts.deleted).toBe(false);
        expect(cardText(action)).toContain('WH40K.WeaponModification.FitFailed|');
    });

    it('spends a xenos lore insight on the attempt, whatever the outcome', async () => {
        const weapon = makeWeapon();
        const action = new FitModificationActionData(weapon, makeParts(), SIGHT, DH2_WEAPON_MODIFICATION_RULES, true);
        resolve(action, { success: false, dof: 1 });
        await action.descriptionText();
        expect(weapon.updates).toEqual([{ 'flags.wh40k-rpg.-=xenosRepairInsight': null }]);
    });
});

describe('RemoveModificationActionData — Tech-Use removal (DH2)', () => {
    const GRIP = entry('Compendium.wh40k-rpg.dh2-weapon-mods.Item.grip', 'Custom Grip');

    function recoverer(available: boolean): { calls: number; recover: () => Promise<boolean> } {
        const state = {
            calls: 0,
            recover: async (): Promise<boolean> => {
                state.calls += 1;
                return Promise.resolve(available);
            },
        };
        return state;
    }

    it('detaches the modification and returns its parts on a success', async () => {
        const weapon = makeWeapon([], [SIGHT, GRIP]);
        const parts = recoverer(true);
        const action = new RemoveModificationActionData(weapon, GRIP, parts.recover, false);
        resolve(action, { success: true });
        await action.descriptionText();
        expect(weapon.updates).toEqual([{ 'system.modifications': [SIGHT] }]);
        expect(parts.calls).toBe(1);
        expect(cardText(action)).toContain('WH40K.WeaponModification.RemovedPartsKept');
    });

    it('still detaches the modification on a failure, but the parts are lost', async () => {
        const weapon = makeWeapon([], [GRIP]);
        const parts = recoverer(true);
        const action = new RemoveModificationActionData(weapon, GRIP, parts.recover, true);
        resolve(action, { success: false, dof: 1 });
        await action.descriptionText();
        expect(weapon.updates).toEqual([{ 'flags.wh40k-rpg.-=xenosRepairInsight': null, 'system.modifications': [] }]);
        expect(parts.calls).toBe(0);
        expect(cardText(action)).toContain('WH40K.WeaponModification.RemovedPartsLost');
    });

    it('reports when the parts’ source document is gone', async () => {
        const action = new RemoveModificationActionData(makeWeapon([], [GRIP]), GRIP, recoverer(false).recover, false);
        resolve(action, { success: true });
        await action.descriptionText();
        expect(cardText(action)).toContain('WH40K.WeaponModification.RemovedPartsMissing');
    });
});
