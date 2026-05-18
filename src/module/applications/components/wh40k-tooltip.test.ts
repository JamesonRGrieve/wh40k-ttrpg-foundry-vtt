import { afterAll, describe, expect, it, vi } from 'vitest';

const ORIGINAL_GAME = (globalThis as Record<string, unknown>)['game'];

vi.mock('../../config/game-systems/index.ts', () => ({
    SystemConfigRegistry: {
        getOrNull: () => null,
        get: () => null,
    },
}));

(globalThis as Record<string, unknown>)['game'] = {
    i18n: {
        localize: (key: string) => key,
        format: (key: string, data: Record<string, unknown> = {}) => {
            // Trivial mock — replicate Foundry's `{name}` interpolation enough for
            // the tooltip's RankWithBonus / UntrainedWithPenalty etc. templates.
            return Object.entries(data).reduce<string>(
                (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
                key,
            );
        },
    },
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
        // Each rank label resolves through the localized RankWithBonus template,
        // so it shows up as "{i18n-key} ({bonus})" — the mock above echoes the
        // localize key and Foundry-style format interpolation expands the bonus.
        expect(html).toContain('WH40K.Skills.Rank.Known (+0)');
        expect(html).toContain('WH40K.Skills.Rank.Trained (+10)');
        expect(html).toContain('WH40K.Skills.Rank.Experienced (+20)');
        expect(html).toContain('WH40K.Skills.Rank.Veteran (+30)');
        // Untrained for non-RT systems shows the flat -20 penalty.
        expect(html).toContain('Untrained (-20)');
    });
});
