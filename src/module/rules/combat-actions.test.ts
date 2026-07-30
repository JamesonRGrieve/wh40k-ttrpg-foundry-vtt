import { afterEach, describe, expect, it, vi } from 'vitest';
import { allCombatActions, calculateCombatActionModifier, type CombatActionModifierInput } from './combat-actions';

function mockRollData(action: string, weaponAttackBonus: number, talents: string[] = [], isMelee = true): CombatActionModifierInput {
    return {
        actions: { [action]: action },
        action,
        isCalledShot: false,
        calledShotLocation: '',
        // The weapon's own attackBonus lives on modifiers['attack'] (set by RollData.update()).
        modifiers: { attack: weaponAttackBonus },
        // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the talent-owning actor (#517)
        sourceActor: { items: talents.map((name) => ({ type: 'talent', name })) } as unknown as CombatActionModifierInput['sourceActor'],
        // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the weapon's melee/ranged flavour
        weapon: { isMelee, isRanged: !isMelee } as unknown as CombatActionModifierInput['weapon'],
        twoWeaponPlan: null,
    };
}

/**
 * Combat actions registry coverage (#119) — core.md §"Actions in Combat"
 * (L10007-L10316) lists the named combat actions DH2 RAW supports.
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
    'Full Auto Burst': -10,
    'Guarded Action': -10,
    'Lightning Attack': -10,
    'Semi-Auto Burst': 0,
    'Swift Attack': 0,
};

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
        const rd = mockRollData('Two-Weapon Fighting', 0, ['Two-Weapon Wielder (Melee)']);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(0);
        expect(rd.twoWeaponPlan?.offPenalty).toBe(-20);
    });

    it('Two-Weapon Master (Melee) drops both hands to 0', () => {
        stubGame();
        const rd = mockRollData('Two-Weapon Fighting', 0, ['Two-Weapon Master (Melee)']);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(0);
        expect(rd.twoWeaponPlan?.offPenalty).toBe(0);
    });

    it('Ambidextrous reduces the off-hand penalty by a further 10', () => {
        stubGame();
        const rd = mockRollData('Two-Weapon Fighting', 0, ['Ambidextrous']);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(-20);
        expect(rd.twoWeaponPlan?.offPenalty).toBe(-10);
    });

    it('gates the Wielder talent on weapon flavour — the melee talent does not help a ranged pair', () => {
        stubGame();
        const rd = mockRollData('Two-Weapon Fighting', 0, ['Two-Weapon Wielder (Melee)'], false);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(-20);
        expect(rd.twoWeaponPlan?.isMelee).toBe(false);
    });

    it('leaves other actions untouched, so the plan is only set for this action', () => {
        stubGame();
        const rd = mockRollData('Standard Attack', 0, ['Two-Weapon Master (Melee)']);
        calculateCombatActionModifier(rd);
        expect(rd.modifiers['combat-action']).toBe(0);
        expect(rd.twoWeaponPlan).toBeNull();
    });
});
