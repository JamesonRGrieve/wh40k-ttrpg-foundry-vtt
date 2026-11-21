import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { resolveUntrainedTarget, untrainedSkillBase, untrainedTestForbidden } from './untrained-skill';

describe('untrainedSkillBase (#423, #710)', () => {
    it('aptitude systems (DH2e) subtract a flat 20', () => {
        expect(untrainedSkillBase(40, true)).toBe(20);
        expect(untrainedSkillBase(35, true)).toBe(15);
        expect(untrainedSkillBase(0, true)).toBe(-20);
    });

    it('career systems halve the characteristic, rounded down', () => {
        expect(untrainedSkillBase(40, false)).toBe(20);
        expect(untrainedSkillBase(35, false)).toBe(17); // Math.floor(17.5)
        expect(untrainedSkillBase(41, false)).toBe(20); // Math.floor(20.5)
        expect(untrainedSkillBase(0, false)).toBe(0);
    });
});

describe('resolveUntrainedTarget', () => {
    it('rolls against the characteristic when trained', () => {
        const r = resolveUntrainedTarget({ advance: 10, isBasic: true, characteristicTotal: 40 });
        expect(r.target).toBe(40);
        expect(r.untrainedAdvanced).toBe(false);
        expect(r.halved).toBe(false);
    });

    it('rolls against the characteristic for untrained Basic in DH2 RAW', () => {
        const r = resolveUntrainedTarget({ advance: 0, isBasic: true, characteristicTotal: 35 });
        expect(r.target).toBe(35);
        expect(r.halved).toBe(false);
    });

    it('flags untrained Advanced as disallowed', () => {
        const r = resolveUntrainedTarget({ advance: 0, isBasic: false, characteristicTotal: 35 });
        expect(r.untrainedAdvanced).toBe(true);
        expect(r.target).toBe(0);
    });

    it('halves the characteristic when halveOnNonBasic is opted-in (legacy carryover)', () => {
        const r = resolveUntrainedTarget({ advance: 0, isBasic: true, characteristicTotal: 35, halveOnNonBasic: true });
        expect(r.target).toBe(17);
        expect(r.halved).toBe(true);
    });

    it('uses the alternate characteristic total when supplied', () => {
        const r = resolveUntrainedTarget({ advance: 10, isBasic: true, characteristicTotal: 30, altCharacteristicTotal: 50 });
        expect(r.target).toBe(50);
        expect(r.usedAltCharacteristic).toBe(true);
    });

    it('combines alt-characteristic with halving when both apply', () => {
        const r = resolveUntrainedTarget({ advance: 0, isBasic: true, characteristicTotal: 30, altCharacteristicTotal: 50, halveOnNonBasic: true });
        expect(r.target).toBe(25);
        expect(r.halved).toBe(true);
        expect(r.usedAltCharacteristic).toBe(true);
    });
});

describe('DH2 untrained skills use -20, never halving (regression)', () => {
    it('an untrained Advanced/specialist skill is rolled at full base when halving is off', () => {
        // DH2 bakes the -20 into the supplied characteristicTotal, then passes
        // allowUntrainedAdvanced (so the roll is not blocked) and halveOnNonBasic
        // false (so the target is not halved on top of the -20).
        const r = resolveUntrainedTarget({
            advance: 0,
            isBasic: false,
            characteristicTotal: 15, // e.g. characteristic 35 with the -20 already applied
            allowUntrainedAdvanced: true,
            halveOnNonBasic: false,
        });
        expect(r.target).toBe(15);
        expect(r.halved).toBe(false);
        expect(r.untrainedAdvanced).toBe(false);
    });

    it('a trained specialist (advance > 0) is never halved or blocked', () => {
        const r = resolveUntrainedTarget({ advance: 1, isBasic: false, characteristicTotal: 45, allowUntrainedAdvanced: true, halveOnNonBasic: true });
        expect(r.target).toBe(45);
        expect(r.halved).toBe(false);
        expect(r.untrainedAdvanced).toBe(false);
    });

    it('the roll dialog never halves (the untrained base is baked in) and refuses by the line rule (#757)', () => {
        // The dialog (an ApplicationV2) can't be instantiated under happy-dom, so guard the
        // call site at the source level: the untrained base (−20 or half) is already in the
        // skill's current value from prepare time, and refusal comes from the line's rule.
        const dialog = readRepoFile('src/module/applications/prompts/unified-roll-dialog.ts');
        expect(dialog).toContain('halveOnNonBasic: false');
        expect(dialog).toContain('isBasic: !untrainedForbidden');
        expect(dialog).toContain('untrainedTestForbidden(untrainedRules, traits, rollKey');
        expect(dialog).not.toContain('isAptitudeSystem');
    });
});

describe('untrainedTestForbidden: each line refuses its own skills untrained (#757)', () => {
    const acrobatics = { advanced: true, hasEntries: false };
    const forbiddenLore = { advanced: true, hasEntries: true };
    const awareness = { advanced: false, hasEntries: false };
    const none = { rule: 'none', listed: {} } as const;

    it('career lines refuse an Advanced skill and allow a Basic one', () => {
        const rules = { rule: 'advanced', listed: {} } as const;
        expect(untrainedTestForbidden(rules, acrobatics, 'acrobatics')).toBe(true);
        expect(untrainedTestForbidden(rules, awareness, 'awareness')).toBe(false);
    });

    it('DH2 and Only War refuse only a Specialist skill, so Acrobatics rolls at −20', () => {
        const rules = { rule: 'specialist', listed: {} } as const;
        expect(untrainedTestForbidden(rules, forbiddenLore, 'forbiddenLore', 'Daemonology')).toBe(true);
        expect(untrainedTestForbidden(rules, acrobatics, 'acrobatics')).toBe(false);
    });

    it('Black Crusade refuses only the listed skills and specialisations', () => {
        const rules = { rule: 'listed', listed: { forbiddenLore: '*', operate: ['Aeronautica', 'Voidship'] } } as const;
        const operate = { advanced: true, hasEntries: true };
        expect(untrainedTestForbidden(rules, forbiddenLore, 'forbiddenLore', 'Daemonology')).toBe(true);
        expect(untrainedTestForbidden(rules, operate, 'operate', 'voidship')).toBe(true);
        expect(untrainedTestForbidden(rules, operate, 'operate', 'Surface')).toBe(false);
        expect(untrainedTestForbidden(rules, operate, 'operate')).toBe(false);
        expect(untrainedTestForbidden(rules, { advanced: true, hasEntries: true }, 'commonLore', 'Imperium')).toBe(false);
    });

    it("a line with rule 'none' refuses nothing", () => {
        expect(untrainedTestForbidden(none, forbiddenLore, 'forbiddenLore')).toBe(false);
    });
});
