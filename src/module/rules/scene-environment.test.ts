import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_SYSTEM_IDS, type GameSystemId } from '../config/game-systems/types.ts';
import { SYSTEM_ID } from '../constants.ts';
import {
    actorEnvironmentContext,
    actorSceneEnvironment,
    collectEnvironmentAttackModifiers,
    collectZeroGravityManoeuvreModifiers,
    DEFAULT_SCENE_ENVIRONMENT,
    ENVIRONMENT_BUCKET,
    environmentAgilityBonus,
    environmentEffectLines,
    environmentJumpDistance,
    environmentLiftingSum,
    environmentMovementRates,
    exposureForAtmosphere,
    isDefaultEnvironment,
    parseSceneEnvironment,
    readSceneEnvironment,
    resolveVacuum,
    SCENE_ENVIRONMENT_FLAG,
    type SceneEnvironment,
    sumEnvironmentComponents,
} from './scene-environment.ts';

const FFG_LINES: GameSystemId[] = ['dh1', 'dh2', 'rt', 'dw', 'bc', 'ow'];
const env = (overrides: Partial<SceneEnvironment>): SceneEnvironment => ({ ...DEFAULT_SCENE_ENVIRONMENT, ...overrides });
const localize = (key: string): string => key;

describe('parseSceneEnvironment (#604)', () => {
    it('reads a valid flag', () => {
        expect(parseSceneEnvironment({ gravity: 'zero', harshConditions: true, atmosphere: 'venting' })).toEqual({
            gravity: 'zero',
            harshConditions: true,
            atmosphere: 'venting',
        });
    });

    it('falls back per field, so one bad field keeps the others', () => {
        expect(parseSceneEnvironment({ gravity: 'sideways', harshConditions: 'yes', atmosphere: 'vacuum' })).toEqual({
            gravity: 'standard',
            harshConditions: false,
            atmosphere: 'vacuum',
        });
    });

    it('reads anything that is not an object as the default', () => {
        for (const raw of [undefined, null, 'zero', 3, ['zero']]) expect(parseSceneEnvironment(raw)).toEqual(DEFAULT_SCENE_ENVIRONMENT);
        expect(isDefaultEnvironment(parseSceneEnvironment(undefined))).toBe(true);
        expect(isDefaultEnvironment(env({ harshConditions: true }))).toBe(false);
    });

    it('reads the scene flag, and the default for no scene', () => {
        const getFlag = vi.fn(() => ({ gravity: 'low' }));
        expect(readSceneEnvironment({ getFlag }).gravity).toBe('low');
        expect(getFlag).toHaveBeenCalledWith(SYSTEM_ID, SCENE_ENVIRONMENT_FLAG);
        expect(readSceneEnvironment(null)).toEqual(DEFAULT_SCENE_ENVIRONMENT);
    });
});

describe('actorSceneEnvironment (#604)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const scene = (gravity: string): { getFlag: () => object } => ({ getFlag: () => ({ gravity }) });

    it("a synthetic actor reads its own token's scene", () => {
        expect(actorSceneEnvironment({ token: { parent: scene('zero') } }).gravity).toBe('zero');
    });

    it('a linked actor reads the scene of its token on a ready canvas', () => {
        vi.stubGlobal('canvas', { ready: true });
        const actor = { token: null, getActiveTokens: () => [{ document: { parent: scene('high') } }] };
        expect(actorSceneEnvironment(actor).gravity).toBe('high');
    });

    it('reads the default before the canvas is ready, with no token, or with no actor', () => {
        const actor = { token: null, getActiveTokens: () => [{ document: { parent: scene('high') } }] };
        expect(actorSceneEnvironment(actor)).toEqual(DEFAULT_SCENE_ENVIRONMENT);
        vi.stubGlobal('canvas', { ready: true });
        expect(actorSceneEnvironment({ token: null, getActiveTokens: () => [] })).toEqual(DEFAULT_SCENE_ENVIRONMENT);
        expect(actorSceneEnvironment(null)).toEqual(DEFAULT_SCENE_ENVIRONMENT);
    });

    it("pairs the environment with the actor's own line", () => {
        expect(actorEnvironmentContext({ type: 'bc-character', token: { parent: scene('low') } })).toEqual({
            env: { ...DEFAULT_SCENE_ENVIRONMENT, gravity: 'low' },
            line: 'bc',
        });
    });
});

describe('gravity: Agility Bonus for movement and Initiative (#604)', () => {
    it('low gravity: +2 for movement in every line', () => {
        for (const line of FFG_LINES) expect(environmentAgilityBonus(3, env({ gravity: 'low' }), line, 'movement')).toBe(5);
    });

    it('high gravity: −2, to a minimum of 1, never raising a bonus already below it', () => {
        expect(environmentAgilityBonus(4, env({ gravity: 'high' }), 'dh2', 'movement')).toBe(2);
        expect(environmentAgilityBonus(2, env({ gravity: 'high' }), 'dh2', 'movement')).toBe(1);
        expect(environmentAgilityBonus(0, env({ gravity: 'high' }), 'dh2', 'movement')).toBe(0);
    });

    it('Initiative follows in every line but DH1, whose rule names movement alone', () => {
        for (const line of ['dh2', 'rt', 'dw', 'bc', 'ow'] as const) expect(environmentAgilityBonus(3, env({ gravity: 'low' }), line, 'initiative')).toBe(5);
        expect(environmentAgilityBonus(3, env({ gravity: 'low' }), 'dh1', 'initiative')).toBe(3);
    });

    it('standard and zero gravity, and an unmodelled line, leave it alone', () => {
        expect(environmentAgilityBonus(3, env({ gravity: 'standard' }), 'dh2', 'movement')).toBe(3);
        expect(environmentAgilityBonus(3, env({ gravity: 'zero' }), 'dh2', 'movement')).toBe(3);
        expect(environmentAgilityBonus(3, env({ gravity: 'low' }), 'im', 'movement')).toBe(3);
    });
});

describe('gravity: carrying, jumping and movement rates (#604)', () => {
    it('SB + TB ±4 for carrying, high gravity to a minimum of 0', () => {
        expect(environmentLiftingSum(7, env({ gravity: 'low' }), 'ow')).toBe(11);
        expect(environmentLiftingSum(7, env({ gravity: 'high' }), 'ow')).toBe(3);
        expect(environmentLiftingSum(3, env({ gravity: 'high' }), 'bc')).toBe(0);
        expect(environmentLiftingSum(7, env({ gravity: 'low' }), 'im')).toBe(7);
    });

    it('jumps double in low gravity and halve in high; DH2 rounds the half up', () => {
        expect(environmentJumpDistance(3, env({ gravity: 'low' }), 'rt')).toBe(6);
        expect(environmentJumpDistance(3, env({ gravity: 'high' }), 'rt')).toBe(1.5);
        expect(environmentJumpDistance(3, env({ gravity: 'high' }), 'dh2')).toBe(2);
    });

    it('zero gravity halves every rate, rounding up, in every line', () => {
        const rates = { half: 3, full: 6, charge: 9, run: 18 };
        for (const line of FFG_LINES) expect(environmentMovementRates(rates, env({ gravity: 'zero' }), line)).toEqual({ half: 2, full: 3, charge: 5, run: 9 });
        expect(environmentMovementRates(rates, env({ gravity: 'low' }), 'dh2')).toBe(rates);
        expect(environmentMovementRates(rates, env({ gravity: 'zero' }), 'im')).toBe(rates);
    });
});

describe('Path B: harsh weather on WS / BS attack tests (#604)', () => {
    it('is −20 as one sourced Environment row in every FFG line', () => {
        for (const line of FFG_LINES) {
            const rows = collectEnvironmentAttackModifiers(env({ harshConditions: true }), line, { isWeaponAttack: true }, localize);
            expect(rows).toEqual([
                { key: `${ENVIRONMENT_BUCKET}.harsh-conditions`, label: 'WH40K.Environment.Weather.Harsh', value: -20, source: 'WH40K.Environment.Source' },
            ]);
            expect(sumEnvironmentComponents(rows)).toBe(-20);
        }
    });

    it('applies nothing to a test that is not a WS / BS attack, in calm weather, or in an unmodelled line', () => {
        expect(collectEnvironmentAttackModifiers(env({ harshConditions: true }), 'dh2', { isWeaponAttack: false }, localize)).toEqual([]);
        expect(collectEnvironmentAttackModifiers(env({ gravity: 'zero' }), 'dh2', { isWeaponAttack: true }, localize)).toEqual([]);
        expect(collectEnvironmentAttackModifiers(env({ harshConditions: true }), 'im', { isWeaponAttack: true }, localize)).toEqual([]);
    });
});

describe('Path B: the zero-gravity Charge / Run Agility test (#604)', () => {
    it('is Hard (−20) as one sourced Environment row in every FFG line', () => {
        for (const line of FFG_LINES) {
            expect(collectZeroGravityManoeuvreModifiers(env({ gravity: 'zero' }), line, localize)).toEqual([
                { key: `${ENVIRONMENT_BUCKET}.zero-gravity`, label: 'WH40K.Environment.Gravity.Zero', value: -20, source: 'WH40K.Environment.Source' },
            ]);
        }
    });

    it('is empty outside zero gravity and in an unmodelled line', () => {
        expect(collectZeroGravityManoeuvreModifiers(env({ gravity: 'low' }), 'dh2', localize)).toEqual([]);
        expect(collectZeroGravityManoeuvreModifiers(env({ gravity: 'zero' }), 'im', localize)).toEqual([]);
    });
});

describe('resolveVacuum (#604)', () => {
    const base = { toughnessBonus: 4, exposure: 'sudden', inSpace: true, oxygenSource: false, strenuous: false } as const;

    it('DH2 / BC / OW: TB rounds, then 1d10 ignoring Armour and TB; the cold; suffocation', () => {
        for (const line of ['dh2', 'bc', 'ow'] as const) {
            const outcome = resolveVacuum({ ...base, line });
            expect(outcome?.safeRounds).toBe(4);
            expect(outcome?.damage).toBe('1d10');
            expect(outcome?.ignoresToughnessBonus).toBe(true);
            expect(outcome?.cold).toEqual({ testModifier: 0, damage: '1d10' });
            expect(outcome?.suffocation).toEqual({ count: 4, unit: 'minute', endgame: 'diesAfterTbRounds', roundsUntilDeath: 4 });
        }
    });

    it('DH1 / RT / DW: 1d10+3, armour only', () => {
        for (const line of ['dh1', 'rt', 'dw'] as const) {
            const outcome = resolveVacuum({ ...base, line });
            expect(outcome?.damage).toBe('1d10+3');
            expect(outcome?.ignoresToughnessBonus).toBe(false);
            expect(outcome?.failureDamage).toBe('');
        }
    });

    it('a worsening atmosphere: twice TB rounds; 1d5 (DH2 shape) or a cumulative −10 test (DH1 shape)', () => {
        const dh2 = resolveVacuum({ ...base, exposure: 'gradual', inSpace: false, line: 'dh2' });
        expect(dh2).toMatchObject({ safeRounds: 8, damage: '1d5', failureDamage: '', testPenaltyStep: 0, cold: null });
        const rt = resolveVacuum({ ...base, exposure: 'gradual', inSpace: false, line: 'rt' });
        expect(rt).toMatchObject({ safeRounds: 8, damage: '1d5', failureDamage: '1d10', testPenaltyStep: -10, cold: null });
    });

    it('an oxygen source spares the suffocation; strenuous activity shortens it; IM is unmodelled', () => {
        expect(resolveVacuum({ ...base, oxygenSource: true, line: 'dh2' })?.suffocation).toBeNull();
        expect(resolveVacuum({ ...base, strenuous: true, line: 'dh2' })?.suffocation).toMatchObject({ count: 8, unit: 'round' });
        expect(resolveVacuum({ ...base, line: 'im' })).toBeNull();
    });

    it('maps a scene atmosphere onto an exposure', () => {
        expect(exposureForAtmosphere('vacuum')).toEqual({ exposure: 'sudden', inSpace: true });
        expect(exposureForAtmosphere('venting')).toEqual({ exposure: 'gradual', inSpace: false });
        expect(exposureForAtmosphere('breathable')).toBeNull();
    });
});

describe('environmentEffectLines — explicit per-line gating (#604)', () => {
    const keys = (e: SceneEnvironment, line: GameSystemId): string[] => environmentEffectLines(e, line).map((effect) => effect.labelKey);

    it('the default environment lists nothing', () => {
        for (const line of ALL_SYSTEM_IDS) expect(environmentEffectLines(DEFAULT_SCENE_ENVIRONMENT, line)).toEqual([]);
    });

    it('low gravity names Initiative except in DH1', () => {
        expect(keys(env({ gravity: 'low' }), 'dh2')).toContain('WH40K.Environment.Effect.AgilityMoveInit');
        expect(keys(env({ gravity: 'low' }), 'dh1')).toContain('WH40K.Environment.Effect.AgilityMove');
        expect(environmentEffectLines(env({ gravity: 'high' }), 'dw').find((effect) => effect.key === 'gravity-agility')?.data).toEqual({ value: '-2' });
    });

    it('zero gravity: DH1 prints no push-off rule', () => {
        expect(keys(env({ gravity: 'zero' }), 'dh2')).toContain('WH40K.Environment.Effect.ZeroPushOff');
        expect(keys(env({ gravity: 'zero' }), 'dh1')).not.toContain('WH40K.Environment.Effect.ZeroPushOff');
        expect(keys(env({ gravity: 'zero' }), 'dh1')).toContain('WH40K.Environment.Effect.ZeroManoeuvre');
    });

    it('weather and vacuum, and nothing at all for an unmodelled line', () => {
        expect(keys(env({ harshConditions: true, atmosphere: 'venting' }), 'bc')).toEqual([
            'WH40K.Environment.Effect.WeatherAttack',
            'WH40K.Environment.Effect.VacuumGradual',
        ]);
        expect(environmentEffectLines(env({ gravity: 'zero', harshConditions: true, atmosphere: 'vacuum' }), 'im')).toEqual([]);
    });
});
