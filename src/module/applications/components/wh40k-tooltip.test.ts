import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

interface GameI18nShim {
    i18n: {
        localize: (key: string) => string;
        format: (key: string, data?: Record<string, string | number>) => string;
    };
}

interface QualityDefShim {
    label: string;
    description: string;
    hasLevel: boolean;
    category: string;
    mechanicalEffect: boolean;
}

interface GlobalWithGame {
    game?: GameI18nShim | undefined;
    CONFIG?: { wh40k?: { getQualityDefinition?: (id: string) => QualityDefShim | null } } | undefined;
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

const { TooltipsWH40K, prepareQualityTooltipData } = await import('./wh40k-tooltip.ts');

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

describe('prepareQualityTooltipData quality lookup (#403)', () => {
    afterEach(() => {
        globalRef.CONFIG = undefined;
    });

    it('resolves the quality via CONFIG.wh40k (not the never-assigned CONFIG.ROGUE_TRADER) so the description populates', () => {
        globalRef.CONFIG = {
            wh40k: {
                getQualityDefinition: (id: string) => ({
                    label: `WH40K.WeaponQuality.${id}`,
                    description: `WH40K.WeaponQuality.${id}Desc`,
                    hasLevel: false,
                    category: 'offence',
                    mechanicalEffect: true,
                }),
            },
        };
        // The i18n mock echoes the key verbatim, so a populated payload proves the
        // lookup fired (the pre-fix path returned '{}' because CONFIG.ROGUE_TRADER
        // was undefined).
        const data = JSON.parse(prepareQualityTooltipData('tearing')) as { type?: string; label?: string; description?: string };
        expect(data.type).toBe('quality');
        expect(data.label).toBe('WH40K.WeaponQuality.tearing');
        expect(data.description).toBe('WH40K.WeaponQuality.tearingDesc');
    });

    it('returns an empty payload when the wh40k config is unavailable', () => {
        globalRef.CONFIG = {};
        expect(prepareQualityTooltipData('tearing')).toBe('{}');
    });
});
