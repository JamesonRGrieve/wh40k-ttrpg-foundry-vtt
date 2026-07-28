import { describe, expect, it } from 'vitest';
import { type LootableItem, selectLootableItems } from './death-loot.ts';

const item = (name: string, type: string, system: LootableItem['system'] = {}): LootableItem => ({ name, type, system });

describe('selectLootableItems (#477)', () => {
    it('keeps carried gear', () => {
        const items = [item('Laspistol', 'weapon'), item('Flak Vest', 'armour'), item('Rebreather', 'gear')];
        expect(selectLootableItems(items).map((i) => i.name)).toEqual(['Laspistol', 'Flak Vest', 'Rebreather']);
    });

    it('drops intrinsic capabilities — a corpse does not yield its talents', () => {
        const items = [item('Swift Attack', 'talent'), item('Natural Weapons', 'trait'), item('Dodge', 'skill'), item('Smite', 'psychicPower')];
        expect(selectLootableItems(items)).toEqual([]);
    });

    it('drops bound and default-granted items (the Unarmed fallback from #228/#390)', () => {
        const items = [item('Unarmed', 'weapon', { grantedByDefault: true }), item('Sanctioned Blade', 'weapon', { bound: true })];
        expect(selectLootableItems(items)).toEqual([]);
    });

    it('yields nothing for a body carrying only intrinsics — the "nothing lootable" case', () => {
        expect(selectLootableItems([item('Fear (2)', 'trait'), item('Unarmed', 'weapon', { grantedByDefault: true })])).toEqual([]);
    });

    it('mixes correctly: intrinsics and bound items removed, real gear kept', () => {
        const items = [
            item('Swift Attack', 'talent'),
            item('Chainsword', 'weapon'),
            item('Unarmed', 'weapon', { grantedByDefault: true }),
            item('Carapace Chestplate', 'armour'),
        ];
        expect(selectLootableItems(items).map((i) => i.name)).toEqual(['Chainsword', 'Carapace Chestplate']);
    });
});
