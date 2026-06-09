import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { resolveUntrainedTarget } from './untrained-skill';

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

    it('the roll dialog only opts into halving for non-aptitude (career) systems', () => {
        // The dialog (an ApplicationV2) can't be instantiated under happy-dom, so
        // guard the call-site gating at the source level: halveOnNonBasic must be
        // conditioned on !isAptitudeSystem so DH2/BC/DW/OW/IM never halve.
        const dialog = readRepoFile('src/module/applications/prompts/unified-roll-dialog.ts');
        expect(dialog).toContain('halveOnNonBasic: advance === 0 && !isBasic && !isAptitudeSystem');
    });
});
