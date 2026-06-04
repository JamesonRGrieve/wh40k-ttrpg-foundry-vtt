import { describe, expect, it } from 'vitest';
import { CHARACTERISTIC_SHORT_TO_FULL } from './characteristics.ts';

describe('CHARACTERISTIC_SHORT_TO_FULL (#271)', () => {
    it('maps the Core Rulebook abbreviations to full schema keys', () => {
        expect(CHARACTERISTIC_SHORT_TO_FULL['WS']).toBe('weaponSkill');
        expect(CHARACTERISTIC_SHORT_TO_FULL['BS']).toBe('ballisticSkill');
        expect(CHARACTERISTIC_SHORT_TO_FULL['Fel']).toBe('fellowship');
    });

    it('includes Influence — the entry the PC-path map had dropped (#271 drift fix)', () => {
        expect(CHARACTERISTIC_SHORT_TO_FULL['Inf']).toBe('influence');
    });
});
