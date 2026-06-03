import { describe, expect, it } from 'vitest';
import { allCombatActions } from './combat-actions';

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
    // RAW Rate-of-Fire to-hit modifiers (#231): single shot +10, semi-auto +0,
    // full-auto -10. Full Auto Burst was wrongly +20 (read as a bonus, not the
    // RAW penalty); Standard Attack now carries the +10 single-shot/strike bonus.
    'Standard Attack': 10,
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
