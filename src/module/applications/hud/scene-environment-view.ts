/**
 * @file Pure view-model shared by the Scene Environment HUD widget and the GM's
 * Scene Environment window (#604).
 *
 * Turns a scene's environment and a game line into the labels and the per-line
 * effect list both surfaces render. A LEAF: no Foundry globals — the localiser is
 * injected — so the widget, the window, their stories and the unit tests share
 * one derivation.
 */

import type { GameSystemId } from '../../config/game-systems/types.ts';
import {
    ATMOSPHERE_KINDS,
    ATMOSPHERE_LABEL_KEYS,
    type AtmosphereKind,
    environmentEffectLines,
    environmentRulesFor,
    GRAVITY_KINDS,
    GRAVITY_LABEL_KEYS,
    type GravityKind,
    isDefaultEnvironment,
    type SceneEnvironment,
} from '../../rules/scene-environment.ts';

/** Resolves a langpack key, with optional format data. */
type EnvironmentFormat = (key: string, data?: Record<string, string>) => string;

interface EnvironmentOption<T extends string> {
    value: T;
    label: string;
    selected: boolean;
}

export interface SceneEnvironmentView {
    gravity: GravityKind;
    gravityLabel: string;
    atmosphere: AtmosphereKind;
    atmosphereLabel: string;
    harshConditions: boolean;
    weatherLabel: string;
    /** The line the effects are listed for, localised. */
    lineLabel: string;
    /** The line prints no environment rules this system models (IM). */
    unmodelled: boolean;
    /** The localised effects the line applies under this environment. */
    effects: string[];
    /** True when the environment is the default (nothing to apply). */
    isDefault: boolean;
    /** Zero gravity, where a Charge or Run demands an Agility test. */
    isZeroGravity: boolean;
    gravityOptions: Array<EnvironmentOption<GravityKind>>;
    atmosphereOptions: Array<EnvironmentOption<AtmosphereKind>>;
}

/** Build the shared view of a scene's environment for one game line. */
export function buildSceneEnvironmentView(env: SceneEnvironment, line: GameSystemId, lineLabel: string, format: EnvironmentFormat): SceneEnvironmentView {
    const unmodelled = environmentRulesFor(line) === null;
    return {
        gravity: env.gravity,
        gravityLabel: format(GRAVITY_LABEL_KEYS[env.gravity]),
        atmosphere: env.atmosphere,
        atmosphereLabel: format(ATMOSPHERE_LABEL_KEYS[env.atmosphere]),
        harshConditions: env.harshConditions,
        weatherLabel: format(env.harshConditions ? 'WH40K.Environment.Weather.Harsh' : 'WH40K.Environment.Weather.Calm'),
        lineLabel,
        unmodelled,
        effects: environmentEffectLines(env, line).map((effect) => format(effect.labelKey, effect.data)),
        isDefault: isDefaultEnvironment(env),
        isZeroGravity: !unmodelled && env.gravity === 'zero',
        gravityOptions: GRAVITY_KINDS.map((value) => ({ value, label: format(GRAVITY_LABEL_KEYS[value]), selected: value === env.gravity })),
        atmosphereOptions: ATMOSPHERE_KINDS.map((value) => ({ value, label: format(ATMOSPHERE_LABEL_KEYS[value]), selected: value === env.atmosphere })),
    };
}
