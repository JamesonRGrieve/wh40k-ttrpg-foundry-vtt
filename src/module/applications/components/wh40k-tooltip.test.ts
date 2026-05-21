import { afterAll, describe, expect, it, vi } from 'vitest';

interface GameI18nShim {
    i18n: {
        localize: (key: string) => string;
        format: (key: string, data?: Record<string, string | number>) => string;
    };
}

interface GlobalWithGame {
    game?: GameI18nShim | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: typed view onto Foundry's untyped global `game` object (unit-test shim, not a DataModel surface)
const globalRef = globalThis as unknown as GlobalWithGame;
const ORIGINAL_GAME = globalRef.game;

vi.mock('../../config/game-systems/index.ts', () => ({
    SystemConfigRegistry: {
        getOrNull: () => null,
        get: () => null,
    },
}));

globalRef.game = {
    i18n: {
        localize: (key: string) => key,
        format: (key: string, data: Record<string, string | number> = {}) => {
            // Trivial mock — replicate Foundry's `{name}` interpolation enough for
            // the tooltip's RankWithBonus / UntrainedWithPenalty etc. templates.
            return Object.entries(data).reduce<string>((acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)), key);
        },
    },
};

afterAll(() => {
    globalRef.game = ORIGINAL_GAME;
});

const { TooltipsWH40K } = await import('./wh40k-tooltip.ts');

describe('skill tooltip fallback ladder (issues #26 / #27)', () => {
    it('renders a localized 4-tier ladder when the game system cannot be resolved', async () => {
        const html = await TooltipsWH40K.prototype._buildSkillTooltip.call({} as InstanceType<typeof TooltipsWH40K>, {
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
        // After the fix the ladder routes through the RankWithBonus
        // format template; the test mock echoes the localize key
        // verbatim, so the rendered ladder contains the RankWithBonus
        // template marker (proves the new format path fired) plus the
        // per-rank labels and bonus values.
        expect(html).toContain('WH40K.Tooltip.Skill.RankWithBonus');
        // Untrained rung uses the dedicated UntrainedWithPenalty template
        // for non-RT systems (the flat -20 penalty branch).
        expect(html).toContain('WH40K.Tooltip.Skill.UntrainedWithPenalty');
    });
});
