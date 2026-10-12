/**
 * Tech-Use Repair resolution (#444) and the xenos Forbidden Lore step (#136).
 *
 * `ObjectStateActionData` in repair mode applies the line's printed rule: on
 * DH2 a failure by 4+ degrees destroys the item (core p. 142). A line with no
 * printed rule (`rules: null`) never destroys. A repair that spends a xenos
 * lore insight clears it whatever the outcome. `XenosLoreActionData` records
 * the insight only on a success.
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
const { ObjectStateActionData, XenosLoreActionData } = await import('../src/module/rolls/action-data.ts');
const { DH2_ITEM_REPAIR_RULES } = await import('../src/module/config/game-systems/dh2-config.ts');

afterAll(() => {
    Object.assign(stubs, ORIGINAL);
});

/** An item standing in for a real Foundry Item — only the surface the actions write. */
interface FakeItem {
    id: string;
    name: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update payloads are open-ended Records
    updates: Array<Record<string, unknown>>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update payloads are open-ended Records
    update: (patch: Record<string, unknown>) => Promise<FakeItem>;
}

function makeItem(): FakeItem {
    const item: FakeItem = {
        id: 'item1',
        name: 'Shuriken Pistol',
        updates: [],
        update: async (patch): Promise<FakeItem> => {
            item.updates.push(patch);
            return Promise.resolve(item);
        },
    };
    return item;
}

type AnyAction = InstanceType<typeof ObjectStateActionData> | InstanceType<typeof XenosLoreActionData>;

/** Bind a resolved roll outcome onto an action, mirroring the live pipeline. */
function resolve(action: AnyAction, outcome: { success: boolean; dos?: number; dof?: number }): void {
    action.rollData.success = outcome.success;
    action.rollData.dos = outcome.dos ?? 0;
    action.rollData.dof = outcome.dof ?? 0;
}

function cardText(action: AnyAction): string {
    return action.effectOutput.map((e) => e.effect).join(' ');
}

describe('ObjectStateActionData — Tech-Use Repair (#444, DH2 core p. 142)', () => {
    it('clears the broken / jammed state on a success', async () => {
        const item = makeItem();
        const action = new ObjectStateActionData('repair', item, { rules: DH2_ITEM_REPAIR_RULES, consumesXenosInsight: false });
        resolve(action, { success: true, dos: 1 });
        await action.descriptionText();
        expect(item.updates).toEqual([{ 'system.state.broken': false, 'system.jammed': false }]);
    });

    // Regression (#444): a failed repair used to leave the item merely broken however badly it failed.
    it('destroys the item on a failure by four or more degrees', async () => {
        const item = makeItem();
        const action = new ObjectStateActionData('repair', item, { rules: DH2_ITEM_REPAIR_RULES, consumesXenosInsight: false });
        resolve(action, { success: false, dof: 4 });
        await action.descriptionText();
        expect(item.updates).toEqual([{ 'system.state.destroyed': true, 'system.state.broken': true }]);
        expect(cardText(action)).toContain('WH40K.SkillUse.Object.RepairDestroyed');
    });

    it('leaves the item broken on a failure by three degrees', async () => {
        const item = makeItem();
        const action = new ObjectStateActionData('repair', item, { rules: DH2_ITEM_REPAIR_RULES, consumesXenosInsight: false });
        resolve(action, { success: false, dof: 3 });
        await action.descriptionText();
        expect(item.updates).toEqual([]);
        expect(cardText(action)).toContain('WH40K.SkillUse.Object.RepairFailed');
    });

    it('never destroys on a line whose book prints no repair rule', async () => {
        const item = makeItem();
        const action = new ObjectStateActionData('repair', item);
        resolve(action, { success: false, dof: 6 });
        await action.descriptionText();
        expect(item.updates).toEqual([]);
    });

    it('spends a xenos lore insight on the attempt, whatever the outcome (#136)', async () => {
        const item = makeItem();
        const action = new ObjectStateActionData('repair', item, { rules: DH2_ITEM_REPAIR_RULES, consumesXenosInsight: true });
        resolve(action, { success: false, dof: 1 });
        await action.descriptionText();
        expect(item.updates).toEqual([{ 'flags.wh40k-rpg.-=xenosRepairInsight': null }]);
    });
});

describe('XenosLoreActionData — the Hard (−20) Forbidden Lore step (#136, Enemies Without p. 42)', () => {
    it('records the degrees of success as the roller’s insight on a success', async () => {
        const item = makeItem();
        const action = new XenosLoreActionData(item, 'Actor.acolyte');
        resolve(action, { success: true, dos: 3 });
        await action.descriptionText();
        expect(item.updates).toEqual([{ 'flags.wh40k-rpg.xenosRepairInsight': { actorUuid: 'Actor.acolyte', degrees: 3 } }]);
        expect(cardText(action)).toContain('WH40K.SkillUse.Object.XenosLoreSucceeded');
    });

    it('records nothing on a failure', async () => {
        const item = makeItem();
        const action = new XenosLoreActionData(item, 'Actor.acolyte');
        resolve(action, { success: false, dof: 2 });
        await action.descriptionText();
        expect(item.updates).toEqual([]);
        expect(cardText(action)).toContain('WH40K.SkillUse.Object.XenosLoreFailed');
    });
});
