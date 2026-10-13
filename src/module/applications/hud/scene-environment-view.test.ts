import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_ENVIRONMENT } from '../../rules/scene-environment.ts';
import { buildSceneEnvironmentView } from './scene-environment-view.ts';

/** Echo the key, with format data appended, so the assertions read the derivation. */
const format = (key: string, data?: Record<string, string>): string => {
    const values = Object.values(data ?? {});
    return values.length === 0 ? key : `${key}:${values.join(',')}`;
};

describe('buildSceneEnvironmentView (#604)', () => {
    it('the default environment: labels, every option, no effects', () => {
        const view = buildSceneEnvironmentView(DEFAULT_SCENE_ENVIRONMENT, 'dh2', 'Dark Heresy 2e', format);
        expect(view.gravityLabel).toBe('WH40K.Environment.Gravity.Standard');
        expect(view.weatherLabel).toBe('WH40K.Environment.Weather.Calm');
        expect(view.atmosphereLabel).toBe('WH40K.Environment.Atmosphere.Breathable');
        expect(view.isDefault).toBe(true);
        expect(view.effects).toEqual([]);
        expect(view.gravityOptions.map((o) => [o.value, o.selected])).toEqual([
            ['standard', true],
            ['low', false],
            ['high', false],
            ['zero', false],
        ]);
        expect(view.atmosphereOptions.filter((o) => o.selected).map((o) => o.value)).toEqual(['breathable']);
    });

    it('zero gravity and harsh weather list their formatted effects and offer the Agility test', () => {
        const view = buildSceneEnvironmentView({ gravity: 'zero', harshConditions: true, atmosphere: 'vacuum' }, 'rt', 'Rogue Trader', format);
        expect(view.isZeroGravity).toBe(true);
        expect(view.weatherLabel).toBe('WH40K.Environment.Weather.Harsh');
        expect(view.effects).toEqual([
            'WH40K.Environment.Effect.ZeroMovement',
            'WH40K.Environment.Effect.ZeroManoeuvre:-20',
            'WH40K.Environment.Effect.ZeroPushOff',
            'WH40K.Environment.Effect.WeatherAttack:-20',
            'WH40K.Environment.Effect.VacuumSudden',
        ]);
    });

    it('an unmodelled line says so and offers nothing', () => {
        const view = buildSceneEnvironmentView({ gravity: 'zero', harshConditions: true, atmosphere: 'vacuum' }, 'im', 'Imperium Maledictum', format);
        expect(view.unmodelled).toBe(true);
        expect(view.isZeroGravity).toBe(false);
        expect(view.effects).toEqual([]);
    });
});
