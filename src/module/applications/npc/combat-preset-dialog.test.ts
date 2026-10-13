/**
 * CombatPresetDialog's preset round-trip under a scene environment (#604).
 *
 * An NPC's prepared movement carries the viewed scene's gravity (a printed
 * movement line takes the Agility Bonus shift at data prep, never into its
 * source). A preset saved in a low- or zero-gravity scene must therefore capture
 * the STORED line, or loading it would write that scene's gravity into another
 * NPC permanently.
 */
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS2545 requires `any[]` rest for mixin-class constructors; `unknown[]` is rejected.
type Constructor<T = object> = new (...args: any[]) => T;

/** Stub the Foundry globals the dialog module chain evaluates at import time. */
function installFoundryStubs(): void {
    class StubApplicationV2 {
        static DEFAULT_OPTIONS = {};
    }
    Object.assign(globalThis, {
        foundry: {
            applications: {
                api: {
                    ApplicationV2: StubApplicationV2,
                    HandlebarsApplicationMixin<T extends Constructor>(base: T): T {
                        return class extends base {};
                    },
                },
            },
            utils: { deepClone: <T>(value: T): T => structuredClone(value) },
        },
    });
}

/** The stored (printed) movement line an NPC was authored with. */
const PRINTED = { half: 3, full: 6, charge: 9, run: 18 };
/** The same line as prepared in zero gravity (difficult terrain: halved). */
const PREPARED_ZERO_G = { half: 1.5, full: 3, charge: 4.5, run: 9 };

/** The NPC slice preset creation and application read and write. */
function npcInScene(): {
    name: string;
    system: Record<string, string | number | object>;
    _source: { system: { movement: typeof PRINTED } };
    update: Mock<(changes: object) => Promise<object | undefined>>;
} {
    return {
        name: 'Void-Born Raider',
        system: {
            faction: 'Pirates',
            type: 'Troop',
            role: 'Specialist',
            threatLevel: 6,
            characteristics: { agility: { total: 35 } },
            wounds: { max: 12 },
            movement: { ...PREPARED_ZERO_G },
            size: 'average',
            initiative: { base: 3 },
            trainedSkills: {},
            weapons: {},
            armour: {},
            horde: {},
            tags: ['void'],
        },
        _source: { system: { movement: { ...PRINTED } } },
        update: vi.fn(async (_changes: object): Promise<object | undefined> => Promise.resolve(undefined)),
    };
}

describe('CombatPresetDialog presets under a scene environment (#604)', () => {
    beforeEach(() => {
        installFoundryStubs();
        vi.stubGlobal('ui', { notifications: { info: vi.fn() } });
        vi.stubGlobal('game', { i18n: { format: (key: string): string => key } });
        vi.resetModules();
    });

    it('saving a preset captures the stored movement line, not the gravity-shifted prepared one', async () => {
        const { default: CombatPresetDialog } = await import('./combat-preset-dialog.ts');
        const npc = npcInScene();
        const preset = CombatPresetDialog.createPresetFromNPC(npc, 'Raider');
        expect(preset.movement).toEqual(PRINTED);
        expect(preset.movement).not.toEqual(PREPARED_ZERO_G);
        // The capture is a copy: editing the preset never edits the NPC's source.
        preset.movement['half'] = 99;
        expect(npc._source.system.movement.half).toBe(3);
    });

    it('the other combat fields are still captured from the prepared system', async () => {
        const { default: CombatPresetDialog } = await import('./combat-preset-dialog.ts');
        const preset = CombatPresetDialog.createPresetFromNPC(npcInScene(), 'Raider', 'Boarding party');
        expect(preset).toMatchObject({
            name: 'Raider',
            description: 'Boarding party',
            faction: 'Pirates',
            threatLevel: 6,
            wounds: { max: 12 },
            tags: ['void'],
        });
    });

    it('loading the preset into another NPC writes the printed line', async () => {
        const { default: CombatPresetDialog } = await import('./combat-preset-dialog.ts');
        const preset = { ...CombatPresetDialog.createPresetFromNPC(npcInScene(), 'Raider'), id: 'p1', createdAt: 0 };
        const target = npcInScene();
        await CombatPresetDialog.applyPresetToNPC(target, preset);
        expect(target.update).toHaveBeenCalledOnce();
        expect(target.update.mock.calls[0]?.[0]).toMatchObject({ 'system.movement': PRINTED });
    });
});
