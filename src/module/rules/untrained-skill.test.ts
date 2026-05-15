import { describe, expect, it } from 'vitest';
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
