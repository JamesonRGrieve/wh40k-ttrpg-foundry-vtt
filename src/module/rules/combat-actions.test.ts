import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    allCombatActions,
    calculateCombatActionModifier,
    combatActionAttackModifier,
    combatActionCost,
    combatActionCostLabel,
    type CombatActionModifierInput,
    configuredActionType,
    isChargeAction,
} from './combat-actions';

/** An owned talent as the stub actor carries it: document identifier + picked specialisation. */
interface StubTalent {
    identifier: string;
    specialization?: string;
}

function mockRollData(action: string, weaponAttackBonus: number, talents: StubTalent[] = [], isMelee = true, gameSystemId = 'dh2'): CombatActionModifierInput {
    const items = talents.map((t) => ({
        type: 'talent',
        name: 'Any Display Name',
        system: { identifier: t.identifier, specialization: t.specialization ?? '' },
    }));
    return {
        actions: { [action]: action },
        action,
        isCalledShot: false,
        calledShotLocation: '',
        // The weapon's own attackBonus lives on modifiers['attack'] (set by RollData.update()).
        modifiers: { attack: weaponAttackBonus },
        expandedBuckets: {},
        // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the talent-owning actor (#517)
        sourceActor: { items } as unknown as CombatActionModifierInput['sourceActor'],
        // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the weapon's melee/ranged flavour
        weapon: { isMelee, isRanged: !isMelee } as unknown as CombatActionModifierInput['weapon'],
        twoWeaponPlan: null,
        gameSystemId,
    };
}

/**
 * Combat actions registry coverage (#119) — the core rules' "Actions in Combat"
 * lists the named combat actions DH2 RAW supports.
 *
 * The registry in `combat-actions.ts:allCombatActions()` carries the
 * canonical list; these tests pin coverage so a future refactor cannot
 * silently drop an action. Runtime mechanics for Overwatch (kill-zone
 * trigger), Suppressing Fire → Pinning, and Stun (SB+1d10 vs TB+head
 * armour) remain follow-up scope — this test ensures the actions
 * themselves are at least registered.
 */
const REQUIRED_ACTIONS: ReadonlyArray<string> = [
    'Standard Attack',
    'Throw',
    'Aim',
    'All Out Attack',
    'Brace Heavy Weapon',
    'Called Shot',
    'Charge',
    'Defensive Stance',
    'Delay',
    'Disengage',
    'Evasion',
    'Feint',
    'Full Auto Burst',
    'Grapple',
    'Guarded Action',
    'Jump or Leap',
    'Knock Down',
    'Lightning Attack',
    'Manoeuvre',
    'Overwatch',
    'Ready',
    'Reload',
    'Semi-Auto Burst',
    'Stun',
    'Suppressing Fire - Semi',
    'Suppressing Fire - Full',
    'Swift Attack',
    'Two-Weapon Fighting',
    'Unjam',
    'Tactical Advance',
];

/**
 * Per-action attack-roll modifier values pinned from RAW. Only actions
 * that emit a numeric BS/WS modifier appear here; pure tactical actions
 * (Aim, Defensive Stance, Delay etc.) don't carry one.
 */
const EXPECTED_ATTACK_MODIFIERS: Readonly<Record<string, number>> = {
    // RAW Rate-of-Fire to-hit modifiers (#231): semi-auto +0, full-auto -10
    // (Full Auto Burst was wrongly +20, read as a bonus not the RAW penalty).
    // Standard Attack carries NO inherent to-hit bonus in DH2e RAW — the +10
    // single-shot/strike bonus from #231 was incorrect and is reverted to +0 (#383).
    'Standard Attack': 0,
    'Throw': 0,
    'All Out Attack': 30,
    'Called Shot': -20,
    'Charge': 20,
    'Guarded Action': -10,
    'Lightning Attack': -10,
    'Swift Attack': 0,
};

/**
 * The burst bonus each line prints (#607). DH1, DW and RT cores: Semi-Auto +10,
 * Full Auto +20. DH2, BC and OW cores:
 * Semi-Auto +0, Full Auto −10.
 */
const BURST_MODIFIERS_BY_LINE: ReadonlyArray<readonly [string, number, number]> = [
    ['dh1', 10, 20],
    ['dw', 10, 20],
    ['rt', 10, 20],
    ['dh2', 0, -10],
    ['bc', 0, -10],
    ['ow', 0, -10],
];

describe('combat-actions registry (#119)', () => {
    const actions = allCombatActions();
    const actionsByName = new Map(actions.map((a) => [a.name, a]));

    it('registers every RAW action from the DH2 combat-actions list', () => {
        for (const required of REQUIRED_ACTIONS) {
            expect(actionsByName.get(required), `missing required action: ${required}`).toBeDefined();
        }
    });

    it('every registered action carries name / type / subtype / description', () => {
        for (const action of actions) {
            expect(action.name.length, `empty name on entry: ${JSON.stringify(action)}`).toBeGreaterThan(0);
            expect(Array.isArray(action.type)).toBe(true);
            expect(action.type.length).toBeGreaterThan(0);
            expect(Array.isArray(action.subtype)).toBe(true);
            expect(action.subtype.length).toBeGreaterThan(0);
            expect(action.description.length, `empty description on ${action.name}`).toBeGreaterThan(0);
        }
    });

    it('pins canonical attack-modifier values for the actions that carry them', () => {
        for (const [name, expected] of Object.entries(EXPECTED_ATTACK_MODIFIERS)) {
            const entry = actionsByName.get(name);
            expect(entry?.attack?.modifier, `wrong attack modifier on ${name}`).toBe(expected);
        }
    });

    it('all action names are unique', () => {
        const names = new Set<string>();
        for (const action of actions) {
            expect(names.has(action.name), `duplicate name: ${action.name}`).toBe(false);
            names.add(action.name);
        }
    });

    it('each `type` entry is one of Half / Full / Reaction (or both Half + Full for variable-cost actions)', () => {
        const validTypes = new Set(['Half', 'Full', 'Reaction']);
        for (const action of actions) {
            for (const t of action.type) {
                expect(validTypes.has(t), `unexpected type "${t}" on ${action.name}`).toBe(true);
            }
        }
    });
});

/** Stub the `game.wh40k.log` the modifier calculator writes to. Shared by both suites below. */
function stubGame(): void {
    vi.stubGlobal('game', { wh40k: { log: (): void => {} } });
}

describe('calculateCombatActionModifier — combat-action modifier keying (#408)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('Called Shot applies -20 via its OWN key without clobbering the weapon attackBonus', () => {
        stubGame();
        const rd = mockRollData('Called Shot', 5); // weapon carries +5 attackBonus
        calculateCombatActionModifier(rd);
        // The Called Shot -20 lands on combat-action, the +5 weapon bonus survives on attack —
        // previously they shared modifiers['attack'] and the -20 was silently dropped.
        expect(rd.modifiers['combat-action']).toBe(-20);
        expect(rd.modifiers['attack']).toBe(5);
        expect(rd.isCalledShot).toBe(true);
    });

    it('Standard Attack keys 0 on combat-action and leaves the weapon attackBonus intact', () => {
        stubGame();
        const rd = mockRollData('Standard Attack', 5);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(0);
        expect(rd.modifiers['attack']).toBe(5);
        expect(rd.isCalledShot).toBe(false);
    });

    it('Charge (+20) and All Out Attack (+30) key their bonus on combat-action', () => {
        stubGame();
        const charge = mockRollData('Charge', 0);
        calculateCombatActionModifier(charge);
        expect(charge.modifiers['combat-action']).toBe(20);

        const allOut = mockRollData('All Out Attack', 0);
        calculateCombatActionModifier(allOut);
        expect(allOut.modifiers['combat-action']).toBe(30);
    });

    it('the card row names the action the modifier comes from (#450: "Charge +20", not "Combat Action")', () => {
        stubGame();
        const charge = mockRollData('Charge', 0);
        calculateCombatActionModifier(charge);
        expect(charge.expandedBuckets['combat-action']).toEqual([{ key: 'combat-action', label: 'Charge', value: 20, source: 'Charge' }]);

        const twoWeapon = mockRollData('Two-Weapon Fighting', 0);
        calculateCombatActionModifier(twoWeapon);
        expect(twoWeapon.expandedBuckets['combat-action']).toEqual([
            { key: 'combat-action', label: 'Two-Weapon Fighting', value: -20, source: 'Two-Weapon Fighting' },
        ]);

        // A zero modifier leaves no row, and a switch back to Standard Attack drops the Charge's.
        charge.action = 'Standard Attack';
        charge.actions = { 'Standard Attack': 'Standard Attack' };
        calculateCombatActionModifier(charge);
        expect(charge.expandedBuckets['combat-action']).toEqual([]);
    });
});

/**
 * Two-Weapon Fighting applies its RAW penalties (#517).
 *
 * The action was selectable, its description promised −20/−20 with
 * Wielder/Master/Ambidextrous handling and named `resolveTwoWeaponRefocus()`, and
 * no modifier was applied at all — the resolver had no caller. Attacking at no
 * penalty is strictly better than RAW, which is why it went unreported.
 *
 * Each case asserts the applied number, never its absence: an assertion that the
 * modifier is merely "not undefined" would have passed before the fix too.
 */
describe('Two-Weapon Fighting penalties (#517)', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('applies the baseline −20 to the main hand with no talents', () => {
        stubGame();
        const rd = mockRollData('Two-Weapon Fighting', 0);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(-20);
        expect(rd.twoWeaponPlan).toEqual({ isMelee: true, mainPenalty: -20, offPenalty: -20 });
    });

    it('Two-Weapon Wielder (Melee) drops the main-hand penalty to 0 and leaves the off hand at −20', () => {
        stubGame();
        const rd = mockRollData('Two-Weapon Fighting', 0, [{ identifier: 'twoWeaponWielder', specialization: 'Melee' }]);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(0);
        expect(rd.twoWeaponPlan?.offPenalty).toBe(-20);
    });

    it('Two-Weapon Master (Melee) drops both hands to 0', () => {
        stubGame();
        const rd = mockRollData('Two-Weapon Fighting', 0, [{ identifier: 'twoWeaponMaster', specialization: 'Melee' }]);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(0);
        expect(rd.twoWeaponPlan?.offPenalty).toBe(0);
    });

    it('Ambidextrous reduces the off-hand penalty by a further 10', () => {
        stubGame();
        const rd = mockRollData('Two-Weapon Fighting', 0, [{ identifier: 'ambidextrous' }]);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(-20);
        expect(rd.twoWeaponPlan?.offPenalty).toBe(-10);
    });

    it('gates the Wielder talent on weapon flavour — the melee talent does not help a ranged pair', () => {
        stubGame();
        const rd = mockRollData('Two-Weapon Fighting', 0, [{ identifier: 'twoWeaponWielder', specialization: 'Melee' }], false);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(-20);
        expect(rd.twoWeaponPlan?.isMelee).toBe(false);
    });

    it('leaves other actions untouched, so the plan is only set for this action', () => {
        stubGame();
        const rd = mockRollData('Standard Attack', 0, [{ identifier: 'twoWeaponMaster', specialization: 'Melee' }]);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(0);
        expect(rd.twoWeaponPlan).toBeNull();
    });
});

describe('burst to-hit modifier per line (#607)', () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each(BURST_MODIFIERS_BY_LINE)('%s: Semi-Auto %i, Full Auto %i', (line, semi, full) => {
        expect(combatActionAttackModifier('Semi-Auto Burst', line)).toBe(semi);
        expect(combatActionAttackModifier('Full Auto Burst', line)).toBe(full);
    });

    it.each(BURST_MODIFIERS_BY_LINE)('%s: the roll keys the line value on combat-action', (line, semi, full) => {
        stubGame();
        const semiRoll = mockRollData('Semi-Auto Burst', 5, [], false, line);
        calculateCombatActionModifier(semiRoll);
        expect(semiRoll.modifiers['combat-action']).toBe(semi);
        expect(semiRoll.modifiers['attack']).toBe(5);
        const fullRoll = mockRollData('Full Auto Burst', 0, [], false, line);
        calculateCombatActionModifier(fullRoll);
        expect(fullRoll.modifiers['combat-action']).toBe(full);
    });

    it('a line that prints no bursts (IM) adds nothing; an unknown line reads DH2', () => {
        expect(combatActionAttackModifier('Full Auto Burst', 'im')).toBe(0);
        expect(combatActionAttackModifier('Full Auto Burst', undefined)).toBe(-10);
        expect(combatActionAttackModifier('Full Auto Burst', 'nope')).toBe(-10);
    });

    it('Suppressing Fire keeps its own −20 rather than a burst bonus', () => {
        for (const [line] of BURST_MODIFIERS_BY_LINE) {
            expect(combatActionAttackModifier('Suppressing Fire - Full', line)).toBe(
                allCombatActions().find((a) => a.name === 'Suppressing Fire - Full')?.attack?.modifier ?? 0,
            );
        }
    });
});

/**
 * The burst action cost each line prints (#607): DH1 "(Full Action)", DW and RT "Type: Full Action"; DH2, BC and OW "Type: Half Action".
 */
const BURST_COST_BY_LINE: ReadonlyArray<readonly [string, 'half' | 'full']> = [
    ['dh1', 'full'],
    ['dw', 'full'],
    ['rt', 'full'],
    ['dh2', 'half'],
    ['bc', 'half'],
    ['ow', 'half'],
];

describe('burst action cost per line (#607)', () => {
    it.each(BURST_COST_BY_LINE)('%s: both bursts cost a %s action', (line, cost) => {
        expect(combatActionCost('Semi-Auto Burst', line)).toBe(cost);
        expect(combatActionCost('Full Auto Burst', line)).toBe(cost);
        const label = cost === 'full' ? 'Full' : 'Half';
        const registry = allCombatActions(line);
        expect(registry.find((a) => a.name === 'Semi-Auto Burst')?.type).toEqual([label]);
        expect(registry.find((a) => a.name === 'Full Auto Burst')?.type).toEqual([label]);
        expect(combatActionCostLabel('Semi-Auto Burst', line)).toBe(label);
    });

    it('other actions keep their own cost in every line', () => {
        for (const [line] of BURST_COST_BY_LINE) {
            expect(combatActionCost('Standard Attack', line)).toBe('half');
            expect(combatActionCost('Called Shot', line)).toBe('full');
            expect(combatActionCost('Reload', line)).toBeNull();
        }
    });

    it('an unresolved line reads DH2; IM (no bursts) keeps Half', () => {
        expect(combatActionCost('Full Auto Burst', undefined)).toBe('half');
        expect(combatActionCost('Full Auto Burst', 'im')).toBe('half');
    });

    it('the sheet spends a configured burst at its line cost, other actions at their own type', () => {
        expect(configuredActionType('half', 'semi', 'dh1')).toBe('full');
        expect(configuredActionType('half', 'full', 'dh2')).toBe('half');
        expect(configuredActionType('half', 'full', 'im')).toBe('half');
        expect(configuredActionType('full', undefined, 'dh1')).toBe('full');
    });
});

describe('isChargeAction — the attack action the zero-gravity test gates (#604)', () => {
    it('is the Charge action, which the action list offers exactly once', () => {
        expect(isChargeAction('Charge')).toBe(true);
        expect(allCombatActions().filter((action) => isChargeAction(action.name))).toHaveLength(1);
    });

    it('no other action is a Charge', () => {
        expect(isChargeAction('Standard Attack')).toBe(false);
        expect(isChargeAction('All Out Attack')).toBe(false);
    });
});
