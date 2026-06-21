import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';
import type { EffectCreationData, EffectPayload } from './effect-creation-dialog.ts';

/** The dialog's form-input shape (re-exported from the source so the test asserts against the real type). */
type EffectData = EffectCreationData;

/**
 * Tests for EffectCreationDialog's payload builders (#341).
 *
 * The dialog `extends DialogV2`, which is evaluated at module-load, so the
 * Foundry globals it references must be installed before the dynamic import.
 * The builders are static and pure (given the stubbed globals), so we exercise
 * them directly without instantiating the dialog or booting ApplicationV2.
 */

const ADD_MODE = 2;

// Minimal shape of the static surface the tests reach into. Returns are the
// concrete EffectPayload imported from the source (#341).
interface EffectBuilders {
    _buildEffectData: (args: { label: string; changeKey: string; value: number; icon: string; data: EffectData }) => EffectPayload;
    _applyDuration: (effectData: EffectPayload, data: EffectData) => EffectPayload;
    _createCharacteristicData: (data: EffectData) => EffectPayload | null;
    _createSkillData: (data: EffectData) => EffectPayload | null;
    _createCombatData: (data: EffectData) => EffectPayload | null;
    _createConditionData: (data: EffectData) => EffectPayload | null;
}

/** A minimal valid EffectPayload literal for tests that only assert on `duration`. */
function emptyPayload(): EffectPayload {
    return { name: '', icon: '', changes: [], flags: { 'wh40k-rpg': { nature: 'harmful' } } };
}

/** Narrow a builder's `EffectPayload | null` result to a non-null payload for assertions. */
function assertPayload(payload: EffectPayload | null): EffectPayload {
    expect(payload).not.toBeNull();
    if (payload === null) throw new Error('expected a non-null EffectPayload');
    return payload;
}

function installGlobals(combat: { round: number; turn: number } | null): void {
    Object.assign(globalThis, {
        CONST: { ACTIVE_EFFECT_MODES: { ADD: ADD_MODE } },
        CONFIG: { WH40K: { characteristics: { weaponSkill: { label: 'Weapon Skill' } } } },
        game: { combat },
        foundry: {
            applications: { api: { DialogV2: class {} } },
            utils: { deepClone: <T>(o: T): T => structuredClone(o) },
        },
    });
}

async function loadBuilders(): Promise<EffectBuilders | undefined> {
    const mod = await importModelOrSkip(import('./effect-creation-dialog.ts'));
    if (mod === undefined) return undefined;
    return mod.default;
}

describe('EffectCreationDialog payload builders (#341)', () => {
    beforeEach(() => {
        installGlobals({ round: 3, turn: 1 });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('_buildEffectData assembles the single-change payload with nature + sign', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = Builders._buildEffectData({
            label: 'Strength',
            changeKey: 'system.characteristics.strength.modifier',
            value: 10,
            icon: 'icons/svg/upgrade.svg',
            data: { effectType: 'custom' },
        });

        expect(effect.name).toBe('Strength +10');
        expect(effect.icon).toBe('icons/svg/upgrade.svg');
        expect(effect.changes).toEqual([{ key: 'system.characteristics.strength.modifier', mode: ADD_MODE, value: 10 }]);
        expect(effect.flags['wh40k-rpg'].nature).toBe('beneficial');
        expect(effect.duration).toBeUndefined();
    });

    it('_buildEffectData marks negative values harmful and omits the + sign', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = Builders._buildEffectData({
            label: 'Agility',
            changeKey: 'system.characteristics.agility.modifier',
            value: -20,
            icon: 'icons/svg/upgrade.svg',
            data: { effectType: 'custom' },
        });

        expect(effect.name).toBe('Agility -20');
        expect(effect.flags['wh40k-rpg'].nature).toBe('harmful');
    });

    it('_applyDuration adds a combat-anchored duration block when rounds > 0', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = Builders._applyDuration(emptyPayload(), { effectType: 'custom', duration: { rounds: '5' } });
        expect(effect.duration).toEqual({ rounds: 5, startRound: 3, startTurn: 1 });
    });

    it('_applyDuration defaults startRound/startTurn to 0 with no active combat', async () => {
        installGlobals(null);
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = Builders._applyDuration(emptyPayload(), { effectType: 'custom', duration: { rounds: '2' } });
        expect(effect.duration).toEqual({ rounds: 2, startRound: 0, startTurn: 0 });
    });

    it('_applyDuration leaves the payload untouched when rounds is 0 or absent', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        expect(Builders._applyDuration(emptyPayload(), { effectType: 'custom' }).duration).toBeUndefined();
        expect(Builders._applyDuration(emptyPayload(), { effectType: 'custom', duration: { rounds: '0' } }).duration).toBeUndefined();
    });

    it('_createCharacteristicData resolves the CONFIG label and routes through _buildEffectData', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = assertPayload(
            Builders._createCharacteristicData({ effectType: 'characteristic', characteristic: 'weaponSkill', modifierValue: '15', duration: { rounds: '4' } }),
        );

        expect(effect.name).toBe('Weapon Skill +15');
        expect(effect.changes[0]?.key).toBe('system.characteristics.weaponSkill.modifier');
        expect(effect.duration).toEqual({ rounds: 4, startRound: 3, startTurn: 1 });
    });

    it('_createCharacteristicData falls back to a capitalised label when CONFIG lacks one', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = assertPayload(Builders._createCharacteristicData({ effectType: 'characteristic', characteristic: 'strength', modifierValue: '5' }));
        expect(effect.name).toBe('Strength +5');
    });

    it('_createSkillData builds a skill-bonus change', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = assertPayload(Builders._createSkillData({ effectType: 'skill', skill: 'dodge', modifierValue: '10' }));
        expect(effect.name).toBe('Dodge +10');
        expect(effect.changes[0]?.key).toBe('system.skills.dodge.bonus');
    });

    it('_createCombatData builds a combat change with the combat icon', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = assertPayload(Builders._createCombatData({ effectType: 'combat', combatType: 'attack', modifierValue: '-10' }));
        expect(effect.name).toBe('Attack -10');
        expect(effect.icon).toBe('icons/svg/combat.svg');
        expect(effect.changes[0]?.key).toBe('system.combat.attack');
        expect(effect.flags['wh40k-rpg'].nature).toBe('harmful');
    });

    it('the modifier builders return null when value is 0 or the target is missing', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        expect(Builders._createCharacteristicData({ effectType: 'characteristic', characteristic: 'strength', modifierValue: '0' })).toBeNull();
        expect(Builders._createSkillData({ effectType: 'skill', modifierValue: '5' })).toBeNull();
        expect(Builders._createCombatData({ effectType: 'combat', combatType: 'attack', modifierValue: '0' })).toBeNull();
    });

    it('_createConditionData clones a known condition and applies the shared duration block', async () => {
        const Builders = await loadBuilders();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when DialogV2 runtime is unavailable, not an assertion branch
        if (Builders === undefined) return;

        const effect = assertPayload(Builders._createConditionData({ effectType: 'condition', conditionId: 'prone', duration: { rounds: '2' } }));
        expect(effect.name).toBe('Prone');
        expect(effect.changes[0]?.key).toBe('system.combat.defense');
        expect(effect.duration).toEqual({ rounds: 2, startRound: 3, startTurn: 1 });

        expect(Builders._createConditionData({ effectType: 'condition', conditionId: 'nonexistent' })).toBeNull();
    });
});
