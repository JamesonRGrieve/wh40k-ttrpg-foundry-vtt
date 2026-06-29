import { describe, expect, it } from 'vitest';
import { orderAptitudesGeneralFirst } from './aptitude-order.ts';

describe('orderAptitudesGeneralFirst (#395)', () => {
    const universal = new Set(['General']);

    it('places the universal aptitude (General) first', () => {
        const result = orderAptitudesGeneralFirst(['Weapon Skill', 'General', 'Ballistic Skill'], universal);
        expect(result[0]).toBe('General');
    });

    it('keeps the remaining aptitudes alphabetical after General', () => {
        const result = orderAptitudesGeneralFirst(['Tech', 'Fieldcraft', 'General', 'Agility'], universal);
        expect(result).toEqual(['General', 'Agility', 'Fieldcraft', 'Tech']);
    });

    it('is purely alphabetical when no universal aptitude is present', () => {
        const result = orderAptitudesGeneralFirst(['Tech', 'Agility', 'Fieldcraft'], universal);
        expect(result).toEqual(['Agility', 'Fieldcraft', 'Tech']);
    });

    it('does not mutate the input array', () => {
        const input = ['Tech', 'General'];
        orderAptitudesGeneralFirst(input, universal);
        expect(input).toEqual(['Tech', 'General']);
    });

    it('supports multiple universal aptitudes, ordering them alphabetically up front', () => {
        const multi = new Set(['General', 'Core']);
        const result = orderAptitudesGeneralFirst(['Tech', 'General', 'Core', 'Agility'], multi);
        expect(result).toEqual(['Core', 'General', 'Agility', 'Tech']);
    });
});
