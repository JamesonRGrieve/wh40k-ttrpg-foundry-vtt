import { afterAll, describe, expect, it, vi } from 'vitest';

const ORIGINAL_GAME = (globalThis as Record<string, unknown>)['game'];

vi.mock('../../config/game-systems/index.ts', () => ({
    SystemConfigRegistry: {
        getOrNull: () => null,
        get: () => null,
    },
}));

(globalThis as Record<string, unknown>)['game'] = {
    i18n: { localize: (key: string) => key },
};

afterAll(() => {
    (globalThis as Record<string, unknown>)['game'] = ORIGINAL_GAME;
});

const { TooltipsWH40K } = await import('./wh40k-tooltip.ts');

describe('skill tooltip fallback ladder (issues #26 / #27)', () => {
    it('renders a localized 4-tier ladder when the game system cannot be resolved', async () => {
        const html = await TooltipsWH40K.prototype._buildSkillTooltip.call({} as unknown as InstanceType<typeof TooltipsWH40K>, {
            name: 'Awareness',
            characteristic: 'Per',
            charValue: 35,
            current: 35,
            trained: false,
            plus10: false,
            plus20: false,
            plus30: false,
        });

        // The previous fallback was the truncated, hardcoded-English
        // "Trained(0) → +10 → +20" ladder the reporter saw (#26).
        expect(html).toContain('WH40K.Skills.Rank.Known');
        expect(html).toContain('WH40K.Skills.Rank.Trained');
        expect(html).toContain('WH40K.Skills.Rank.Experienced');
        expect(html).toContain('WH40K.Skills.Rank.Veteran');
        expect(html).toContain('WH40K.Skills.Untrained');
    });
});
