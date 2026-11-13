import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFoundryDataStub } from '../../testing/foundry-data-stub.ts';

/**
 * RitualData.testLabel (#648). A ritual tested on a skill showed the skill's raw
 * key; it now shows the skill catalog's label.
 *
 * `ritual.ts` builds its DataModel from `foundry.*` at module load, so the
 * recording stub is installed BEFORE the dynamic import.
 */

afterAll(installFoundryDataStub());

const { default: RitualData } = await import('./ritual.ts');

interface RitualLike {
    test: { characteristic: string; skill: string; modifier: number; threshold: number };
    readonly testLabel: string;
}

function ritual(test: Partial<RitualLike['test']>): RitualLike {
    const instance = Object.create(RitualData.prototype) as RitualLike;
    instance.test = { characteristic: 'willpower', skill: '', modifier: 0, threshold: 0, ...test };
    return instance;
}

beforeEach(() => {
    vi.stubGlobal('game', {
        i18n: {
            localize: (key: string): string => key,
        },
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('RitualData.testLabel (#648)', () => {
    it('names a skill key by its catalog label, not the key', () => {
        expect(ritual({ skill: 'forbiddenLore', modifier: -10 }).testLabel).toBe('Forbidden Lore -10');
        expect(ritual({ skill: 'psyniscience' }).testLabel).toBe('Psyniscience');
    });

    it('keeps skill text the content authored as display text', () => {
        expect(ritual({ skill: 'Common Lore (Imperial Creed)', modifier: 20 }).testLabel).toBe('Common Lore (Imperial Creed) +20');
    });
});
