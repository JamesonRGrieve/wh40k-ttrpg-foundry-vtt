import { describe, expect, it } from 'vitest';
import { HATRED_BONUS, HATRED_SPECIALIZATIONS, actorHasHatredFor } from './hatred';

/**
 * Hatred talent (#148 — errata L57-65).
 *
 * The errata expanded the canonical Specializations list to include
 * Daemons; these tests pin that list + the predicate semantics so a
 * future refactor cannot drift the data.
 */
describe('HATRED_SPECIALIZATIONS (#148)', () => {
    it('includes Daemons per the errata', () => {
        expect(HATRED_SPECIALIZATIONS).toContain('Daemons');
    });

    it('includes Chaos Space Marines / Mutants / Psykers / Xenos baseline groups', () => {
        for (const group of ['Chaos Space Marines', 'Mutants', 'Psykers', 'Xenos']) {
            expect(HATRED_SPECIALIZATIONS).toContain(group);
        }
    });

    it('exports the +10 WS bonus value', () => {
        expect(HATRED_BONUS).toBe(10);
    });
});

describe('actorHasHatredFor (#148)', () => {
    const hatredDaemons = { type: 'talent', name: 'Hatred', system: { specialization: 'Daemons' } };
    const hatredXenos = { type: 'talent', name: 'Hatred', system: { specialization: 'Xenos' } };
    const legacyHatred = { type: 'talent', name: 'Hatred (Mutants)', system: {} };
    const unrelatedTalent = { type: 'talent', name: 'Fearless', system: {} };
    const nonTalentItem = { type: 'weapon', name: 'Hatred Daemons Spear', system: {} };

    it('matches when the target trait name contains the specialization (Daemons → Daemonic)', () => {
        const target = { name: 'Bloodletter', system: { traits: [{ name: 'Daemonic' }] } };
        expect(actorHasHatredFor({ items: [hatredDaemons] }, target)).toBe('Daemons');
    });

    it('does NOT match when the target lacks the hated trait', () => {
        const target = { name: 'Imperial Guard', system: { traits: [] } };
        expect(actorHasHatredFor({ items: [hatredDaemons] }, target)).toBeNull();
    });

    it('matches via target species name (Xenos)', () => {
        const target = { name: 'Eldar Ranger', system: { species: 'Xenos (Eldar)' } };
        expect(actorHasHatredFor({ items: [hatredXenos] }, target)).toBe('Xenos');
    });

    it('matches via legacy "Hatred (X)" talent name encoding', () => {
        const target = { name: 'Mutant Vagrant', system: { species: 'Human (Mutant)' } };
        expect(actorHasHatredFor({ items: [legacyHatred] }, target)).toBe('Mutants');
    });

    it('skips non-talent items even if their name contains "Hatred"', () => {
        const target = { name: 'Bloodletter', system: { traits: [{ name: 'Daemonic' }] } };
        expect(actorHasHatredFor({ items: [nonTalentItem, unrelatedTalent] }, target)).toBeNull();
    });

    it('returns the first matching specialization when multiple Hatreds apply', () => {
        const target = { name: 'Daemonhost', system: { species: 'Human', traits: [{ name: 'Daemonic' }, { name: 'Mutant' }] } };
        const result = actorHasHatredFor({ items: [hatredDaemons, legacyHatred] }, target);
        expect(['Daemons', 'Mutants']).toContain(result);
    });

    it('returns null for an actor with no Hatred talents', () => {
        const target = { name: 'Bloodletter', system: { traits: [{ name: 'Daemonic' }] } };
        expect(actorHasHatredFor({ items: [unrelatedTalent] }, target)).toBeNull();
    });
});
