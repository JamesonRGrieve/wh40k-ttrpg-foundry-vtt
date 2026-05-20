import { describe, expect, it } from 'vitest';
import { WITHIN_HOMEWORLDS, WITHIN_HOMEWORLD_IDS, getWithinHomeworld, type WithinHomeworldId } from './within-homeworlds';

/**
 * Within-supplement homeworld registry (#139, within.md L632-808).
 * Pins the shape + exact published values for Agri / Feudal /
 * Frontier so a sloppy edit (mod sign flip, wound delta off-by-one,
 * threshold change) trips the suite.
 */
describe('WITHIN_HOMEWORLDS (#139)', () => {
    const ids: WithinHomeworldId[] = ['agriWorld', 'feudalWorld', 'frontierWorld'];

    it('exposes one entry per Within homeworld in supplement order', () => {
        expect(WITHIN_HOMEWORLD_IDS).toEqual(ids);
        for (const id of ids) {
            expect(WITHIN_HOMEWORLDS[id], `missing ${id}`).toBeDefined();
            expect(WITHIN_HOMEWORLDS[id].id).toBe(id);
        }
    });

    it('every entry carries exactly one negative characteristic and at least one positive', () => {
        for (const id of ids) {
            const mods = WITHIN_HOMEWORLDS[id].characteristicMods;
            expect(mods.negative, `${id} negative count`).toHaveLength(1);
            expect(mods.positive.length, `${id} positive count`).toBeGreaterThanOrEqual(1);
        }
    });

    it('Agri World pins to +Fel/+Str/-Agi, FT 2 (EB 7+), Brutal Charge (2), Str aptitude, 8+1d5 wounds', () => {
        const agri = WITHIN_HOMEWORLDS.agriWorld;
        expect(agri.characteristicMods.positive).toEqual(['fellowship', 'strength']);
        expect(agri.characteristicMods.negative).toEqual(['agility']);
        expect(agri.fateThreshold).toEqual({ base: 2, emperorsBlessingMin: 7 });
        expect(agri.homeWorldBonus.name).toBe('Strength from the Land');
        expect(agri.homeWorldBonus.description).toMatch(/Brutal Charge \(2\)/);
        expect(agri.keyAptitudes).toEqual(['strength']);
        expect(agri.wounds).toEqual({ flat: 8, dice: 1, faces: 5 });
    });

    it('Feudal World pins to +Per/+WS/-Int, FT 3 (EB 6+), At Home in Armour, WS aptitude, 9+1d5 wounds', () => {
        const feudal = WITHIN_HOMEWORLDS.feudalWorld;
        expect(feudal.characteristicMods.positive).toEqual(['perception', 'weaponSkill']);
        expect(feudal.characteristicMods.negative).toEqual(['intelligence']);
        expect(feudal.fateThreshold).toEqual({ base: 3, emperorsBlessingMin: 6 });
        expect(feudal.homeWorldBonus.name).toBe('At Home in Armour');
        expect(feudal.homeWorldBonus.description).toMatch(/maximum Agility/i);
        expect(feudal.keyAptitudes).toEqual(['weaponSkill']);
        expect(feudal.wounds).toEqual({ flat: 9, dice: 1, faces: 5 });
    });

    it('Frontier World pins to +BS/+Per/-Fel, FT 3 (EB 7+), Rely on None but Yourself, BS aptitude, 7+1d5 wounds', () => {
        const frontier = WITHIN_HOMEWORLDS.frontierWorld;
        expect(frontier.characteristicMods.positive).toEqual(['ballisticSkill', 'perception']);
        expect(frontier.characteristicMods.negative).toEqual(['fellowship']);
        expect(frontier.fateThreshold).toEqual({ base: 3, emperorsBlessingMin: 7 });
        expect(frontier.homeWorldBonus.name).toBe('Rely on None but Yourself');
        expect(frontier.homeWorldBonus.description).toMatch(/\+20.*Tech-Use/);
        expect(frontier.homeWorldBonus.description).toMatch(/\+10.*repair/i);
        expect(frontier.keyAptitudes).toEqual(['ballisticSkill']);
        expect(frontier.wounds).toEqual({ flat: 7, dice: 1, faces: 5 });
    });

    it('getWithinHomeworld is a typed lookup with undefined for unknown ids', () => {
        expect(getWithinHomeworld('agriWorld')?.id).toBe('agriWorld');
        expect(getWithinHomeworld('hiveWorld')).toBeUndefined();
        expect(getWithinHomeworld('')).toBeUndefined();
    });
});
