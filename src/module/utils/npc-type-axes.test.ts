/**
 * Unit tests for the Foundry-free NPC type-axes split (#257).
 */

import { describe, expect, it } from 'vitest';
import { NPC_NATURES, NPC_TIERS, splitNpcType } from './npc-type-axes.ts';

describe('splitNpcType (#257)', () => {
    it('routes RAW tier values onto the tier axis (nature none)', () => {
        for (const tier of ['troop', 'elite', 'master', 'horde']) {
            expect(splitNpcType(tier)).toEqual({ tier, nature: 'none' });
        }
    });

    it('routes creature-nature values onto the nature axis (tier troop)', () => {
        for (const nature of ['swarm', 'creature', 'daemon', 'xenos']) {
            expect(splitNpcType(nature)).toEqual({ tier: 'troop', nature });
        }
    });

    it('falls back to schema defaults for unknown / none input', () => {
        expect(splitNpcType('none')).toEqual({ tier: 'troop', nature: 'none' });
        expect(splitNpcType('garbage')).toEqual({ tier: 'troop', nature: 'none' });
        expect(splitNpcType('')).toEqual({ tier: 'troop', nature: 'none' });
    });

    it('exposes the canonical vocabularies', () => {
        expect([...NPC_TIERS]).toEqual(['troop', 'elite', 'master', 'horde']);
        expect([...NPC_NATURES]).toEqual(['none', 'swarm', 'creature', 'daemon', 'xenos']);
    });
});
