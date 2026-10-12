import { describe, expect, it } from 'vitest';
import { DH2_ITEM_REPAIR_RULES } from '../config/game-systems/dh2-config.ts';
import { itemRepairRulesFor } from '../config/game-systems/index.ts';
import { craftsmanshipRepairModifier, repairDestroysItem } from './item-repair';

const rules = DH2_ITEM_REPAIR_RULES;

describe('craftsmanshipRepairModifier (DH2 Table 5–2)', () => {
    it('reads the printed repair column', () => {
        expect(craftsmanshipRepairModifier(rules, 'poor')).toBe(10);
        expect(craftsmanshipRepairModifier(rules, 'common')).toBe(0);
        expect(craftsmanshipRepairModifier(rules, 'good')).toBe(-20);
        expect(craftsmanshipRepairModifier(rules, 'best')).toBe(-30);
    });
    it('treats an unknown or missing grade as Common', () => {
        expect(craftsmanshipRepairModifier(rules, 'exceptional')).toBe(0);
        expect(craftsmanshipRepairModifier(rules, undefined)).toBe(0);
    });
});

describe('repairDestroysItem (DH2 core p. 142)', () => {
    it('destroys on a failure by four or more degrees', () => {
        expect(repairDestroysItem(rules, false, 4)).toBe(true);
        expect(repairDestroysItem(rules, false, 7)).toBe(true);
    });
    it('does not destroy on a smaller failure or any success', () => {
        expect(repairDestroysItem(rules, false, 3)).toBe(false);
        expect(repairDestroysItem(rules, true, 0)).toBe(false);
    });
});

describe('itemRepairRulesFor — per-line gating', () => {
    it('only DH2 prints the item-repair rule', () => {
        expect(itemRepairRulesFor('dh2')).toBe(DH2_ITEM_REPAIR_RULES);
        // DH1 core p. 108 leaves the repair difficulty to the GM; RT / DW print only vehicle repair.
        for (const line of ['dh1', 'bc', 'dw', 'ow', 'rt', 'im']) {
            expect(itemRepairRulesFor(line)).toBeNull();
        }
        expect(itemRepairRulesFor(undefined)).toBeNull();
    });
});
