/**
 * Tests for the scene-environment runtime wiring (#604, #610): which hook payloads
 * re-prepare the actors in a scene, which token updates prompt the zero-gravity
 * Charge / Run Agility test (and with the once-per-turn gate on), and the
 * scene-control button that reopens the widget.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const widget = vi.hoisted(() => ({ show: vi.fn(), refresh: vi.fn() }));
vi.mock('./scene-environment-widget.ts', () => ({ default: widget }));

const { registerSceneEnvironment } = await import('./scene-environment-hooks.ts');

/** A registered handler, kept as the registry received it. */
type Registered = (...args: never[]) => void;

let handlers = new Map<string, Registered>();

/** One positional hook argument: a document / change payload, a user id, or an absent value. */
type HookArg = object | string | null;

/** Invoke the handler registered for `event` with a typed payload. */
function fire<A extends HookArg[]>(event: string, ...args: A): void {
    const fn = handlers.get(event) as ((...a: A) => void) | undefined;
    if (fn === undefined) throw new Error(`no handler registered for ${event}`);
    fn(...args);
}

/** A refreshable actor stand-in with an optionally rendered sheet. */
function refreshableActor(rendered: boolean): { reset: ReturnType<typeof vi.fn>; sheet: { rendered: boolean; render: ReturnType<typeof vi.fn> } } {
    return { reset: vi.fn(), sheet: { rendered, render: vi.fn(() => ({})) } };
}

/** A scene whose environment flag reads `gravity`. */
function sceneWithGravity(gravity: string): { getFlag: () => object } {
    return { getFlag: (): object => ({ gravity, harshConditions: false, atmosphere: 'breathable' }) };
}

/** A token document that declared `changed` and whose actor records the test request. */
function movingToken(gravity: string): { parent: { getFlag: () => object }; actor: { rollZeroGravityManoeuvreTest: ReturnType<typeof vi.fn> } } {
    return { parent: sceneWithGravity(gravity), actor: { rollZeroGravityManoeuvreTest: vi.fn(async () => Promise.resolve()) } };
}

/** The token-update payload that declares a move mode. */
function moveModeChange(mode: string | number): { flags: { 'wh40k-rpg': { movementAction: string | number } } } {
    return { flags: { 'wh40k-rpg': { movementAction: mode } } };
}

beforeEach(() => {
    handlers = new Map();
    widget.show.mockClear();
    widget.refresh.mockClear();
    vi.stubGlobal('Hooks', {
        on: (event: string, fn: Registered): number => {
            handlers.set(event, fn);
            return handlers.size;
        },
    });
    vi.stubGlobal('game', { user: { id: 'user-1' } });
    vi.stubGlobal('canvas', { scene: null });
    registerSceneEnvironment();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('registerSceneEnvironment: widget lifecycle', () => {
    it('shows the widget once the world is ready', () => {
        fire('ready');
        expect(widget.show).toHaveBeenCalledTimes(1);
    });

    it('on canvasReady re-prepares every actor in the viewed scene, re-renders only open sheets, and refreshes the widget', () => {
        const open = refreshableActor(true);
        const unrendered = refreshableActor(false);
        vi.stubGlobal('canvas', { scene: { tokens: [{ actor: open }, { actor: null }, { actor: unrendered }] } });
        fire('canvasReady');
        expect(open.reset).toHaveBeenCalledTimes(1);
        expect(unrendered.reset).toHaveBeenCalledTimes(1);
        expect(open.sheet.render).toHaveBeenCalledWith(false);
        expect(unrendered.sheet.render).not.toHaveBeenCalled();
        expect(widget.refresh).toHaveBeenCalledTimes(1);
    });

    it('on canvasReady with no scene still refreshes the widget', () => {
        fire('canvasReady');
        expect(widget.refresh).toHaveBeenCalledTimes(1);
    });
});

describe('registerSceneEnvironment: scene updates', () => {
    it('setting the environment flag refreshes the scene actors and the widget', () => {
        const actor = refreshableActor(true);
        fire('updateScene', { tokens: [{ actor }] }, { flags: { 'wh40k-rpg': { environment: { gravity: 'zero' } } } });
        expect(actor.reset).toHaveBeenCalledTimes(1);
        expect(widget.refresh).toHaveBeenCalledTimes(1);
    });

    it('clearing the environment flag (the -= deletion key) also refreshes', () => {
        const actor = refreshableActor(false);
        fire('updateScene', { tokens: [{ actor }] }, { flags: { 'wh40k-rpg': { '-=environment': null } } });
        expect(actor.reset).toHaveBeenCalledTimes(1);
        expect(widget.refresh).toHaveBeenCalledTimes(1);
    });

    it('an unrelated scene update leaves the actors and widget alone', () => {
        const actor = refreshableActor(true);
        fire('updateScene', { tokens: [{ actor }] }, { name: 'Renamed' });
        fire('updateScene', { tokens: [{ actor }] }, { flags: { 'wh40k-rpg': { somethingElse: 'x' } } });
        fire('updateScene', { tokens: [{ actor }] }, { flags: { 'other-module': { environment: 'x' } } });
        expect(actor.reset).not.toHaveBeenCalled();
        expect(widget.refresh).not.toHaveBeenCalled();
    });
});

describe('registerSceneEnvironment: token placement', () => {
    it('placing or removing a token re-prepares its actor against the new scene', () => {
        const placed = refreshableActor(false);
        const removed = refreshableActor(false);
        fire('createToken', { actor: placed });
        fire('deleteToken', { actor: removed });
        fire('createToken', { actor: null });
        expect(placed.reset).toHaveBeenCalledTimes(1);
        expect(removed.reset).toHaveBeenCalledTimes(1);
    });
});

describe('registerSceneEnvironment: the zero-gravity Charge / Run prompt', () => {
    it.each(['charge', 'run'])('a %s move mode in zero gravity asks for the test with the once-per-turn gate', (mode) => {
        const token = movingToken('zero');
        fire('updateToken', token, moveModeChange(mode), {}, 'user-1');
        expect(token.actor.rollZeroGravityManoeuvreTest).toHaveBeenCalledTimes(1);
        expect(token.actor.rollZeroGravityManoeuvreTest).toHaveBeenCalledWith(true);
    });

    it('only the user who made the update is prompted', () => {
        const token = movingToken('zero');
        fire('updateToken', token, moveModeChange('charge'), {}, 'someone-else');
        expect(token.actor.rollZeroGravityManoeuvreTest).not.toHaveBeenCalled();
    });

    it.each(['standard', 'low', 'high'])('no prompt in %s gravity', (gravity) => {
        const token = movingToken(gravity);
        fire('updateToken', token, moveModeChange('charge'), {}, 'user-1');
        expect(token.actor.rollZeroGravityManoeuvreTest).not.toHaveBeenCalled();
    });

    it('other move modes, a non-string mode or an update with no mode do not prompt', () => {
        const token = movingToken('zero');
        fire('updateToken', token, moveModeChange('walk'), {}, 'user-1');
        fire('updateToken', token, moveModeChange(3), {}, 'user-1');
        fire('updateToken', token, { x: 100 }, {}, 'user-1');
        fire('updateToken', token, { flags: { 'wh40k-rpg': {} } }, {}, 'user-1');
        expect(token.actor.rollZeroGravityManoeuvreTest).not.toHaveBeenCalled();
    });

    it('a token without an actor is ignored', () => {
        expect(() => {
            fire('updateToken', { parent: sceneWithGravity('zero'), actor: null }, moveModeChange('charge'), {}, 'user-1');
        }).not.toThrow();
    });
});

describe('registerSceneEnvironment: scene-control button', () => {
    interface Tool {
        name: string;
        button: boolean;
        order: number;
        onChange: () => void;
    }

    it('adds a button to the wh40k group that reopens the widget', () => {
        const tools: Record<string, Tool> = { existing: { name: 'existing', button: true, order: 0, onChange: vi.fn() } };
        fire('getSceneControlButtons', { wh40k: { tools } });
        const tool = Object.values(tools).find((t) => t.name === 'sceneEnvironment');
        expect(tool).toMatchObject({ name: 'sceneEnvironment', button: true, order: 1 });
        tool?.onChange();
        expect(widget.show).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the wh40k group is absent', () => {
        const tools: Record<string, Tool> = {};
        const controls = { tokens: { tools } };
        fire('getSceneControlButtons', controls);
        expect(Object.keys(controls)).toEqual(['tokens']);
        expect(tools).toEqual({});
    });
});
