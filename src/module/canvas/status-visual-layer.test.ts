import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawRecord } from '../rules/condition-mechanics.ts';
import { buildConditionCatalog, type ConditionIndexRow, setConditionCatalog } from '../rules/condition-registry.ts';
import { MAX_ANIMATED_STATUS_VISUALS, refreshAllStatusVisuals, registerStatusVisuals, statusVisualStats } from './status-visual-layer.ts';

/**
 * Status-effect visuals on tokens (#595): every client draws them from document state.
 * A visual starts with its status, follows its stacks, stops when it goes, and nothing
 * is left on the token, the mesh or the ticker after a token is destroyed or the canvas
 * is torn down. PIXI, the canvas and Foundry's hooks are stubbed.
 */

/* -------------------------------------------- */
/*  PIXI stand-ins                              */
/* -------------------------------------------- */

class FakeContainer {
    static live = 0;
    children: FakeContainer[] = [];
    destroyed = false;
    renderable = true;
    eventMode = 'auto';
    name = '';
    constructor() {
        FakeContainer.live++;
    }
    addChild<T extends FakeContainer>(child: T): T {
        this.children.push(child);
        return child;
    }
    addChildAt<T extends FakeContainer>(child: T): T {
        this.children.unshift(child);
        return child;
    }
    destroy(options?: { children?: boolean }): void {
        if (this.destroyed) return;
        this.destroyed = true;
        FakeContainer.live--;
        if (options?.children === true) for (const child of this.children) child.destroy(options);
    }
}

class FakeGraphics extends FakeContainer {
    static strokes = 0;
    clear(): this {
        return this;
    }
    lineStyle(): this {
        return this;
    }
    beginFill(): this {
        return this;
    }
    endFill(): this {
        return this;
    }
    moveTo(): this {
        return this;
    }
    lineTo(): this {
        FakeGraphics.strokes++;
        return this;
    }
    drawCircle(): this {
        FakeGraphics.strokes++;
        return this;
    }
    drawEllipse(): this {
        FakeGraphics.strokes++;
        return this;
    }
}

class FakeFilter {
    destroyed = false;
    desaturate(): void {}
    brightness(): void {}
    destroy(): void {
        this.destroyed = true;
    }
}

class FakeTexture {}

class FakeSprite extends FakeContainer {
    anchor = { set: (): void => undefined };
    position = { set: (): void => undefined };
    width = 0;
    height = 0;
    constructor(readonly texture: FakeTexture) {
        super();
    }
}

/* -------------------------------------------- */
/*  World stand-ins                             */
/* -------------------------------------------- */

interface FakeEffect {
    statuses: Set<string>;
    parent: FakeActor;
}

interface FakeActor {
    documentName: 'Actor';
    type: string;
    appliedEffects: FakeEffect[];
    items: Array<{ type: string; system: object; parent: FakeActor }>;
}

interface FakeToken {
    id: string;
    destroyed: boolean;
    isVisible: boolean;
    isPreview: boolean;
    w: number;
    h: number;
    actor: FakeActor | null;
    mesh: { filters: FakeFilter[] | null; destroyed: boolean };
    children: FakeContainer[];
    addChild: (child: FakeContainer) => FakeContainer;
    getBounds: () => { x: number; y: number; width: number; height: number };
}

const handlers = new Map<string, Array<(...args: never[]) => void>>();

type HookArg = object | string;

/** Fire a registered hook as Foundry would. */
function fire(event: string, ...args: HookArg[]): void {
    for (const handler of handlers.get(event) ?? []) (handler as (...payload: HookArg[]) => void)(...args);
}

function makeActor(): FakeActor {
    return { documentName: 'Actor', type: 'dh2-character', appliedEffects: [], items: [] };
}

function makeToken(id: string, actor: FakeActor | null, x = 0): FakeToken {
    const children: FakeContainer[] = [];
    return {
        id,
        destroyed: false,
        isVisible: true,
        isPreview: false,
        w: 100,
        h: 100,
        actor,
        mesh: { filters: null, destroyed: false },
        children,
        addChild: (child) => {
            children.push(child);
            return child;
        },
        getBounds: () => ({ x, y: 0, width: 100, height: 100 }),
    };
}

/** Apply a status as the HUD would: an ActiveEffect conferring it, then the create hook. */
function applyStatus(actor: FakeActor, status: string): FakeEffect {
    const effect: FakeEffect = { statuses: new Set([status]), parent: actor };
    actor.appliedEffects.push(effect);
    fire('createActiveEffect', effect);
    return effect;
}

function removeStatus(actor: FakeActor, effect: FakeEffect): void {
    actor.appliedEffects = actor.appliedEffects.filter((candidate) => candidate !== effect);
    fire('deleteActiveEffect', effect);
}

/** Live (undestroyed) visual containers on a token. */
const liveVisuals = (token: FakeToken): FakeContainer[] => token.children.filter((child) => !child.destroyed);

const tickerAdd = vi.fn<(fn: () => void) => void>();
const tickerRemove = vi.fn<(fn: () => void) => void>();
const audioPlay = vi.fn().mockResolvedValue(undefined);
let tokens: FakeToken[] = [];
let settings = new Map<string, boolean | number>();
let reducedMotion = false;

/** A condition pack-index row authoring `visual`. */
function catalogRow(id: string, visual: RawRecord): ConditionIndexRow {
    return {
        _id: id,
        uuid: `Compendium.wh40k-rpg.dh2-core-items-conditions.Item.${id}`,
        name: id,
        img: '',
        type: 'condition',
        system: { identifier: id, visual },
    };
}

function stubWorld(): void {
    vi.stubGlobal('PIXI', {
        Container: FakeContainer,
        Graphics: FakeGraphics,
        ColorMatrixFilter: FakeFilter,
        BlurFilter: FakeFilter,
        Texture: FakeTexture,
        Sprite: FakeSprite,
    });
    vi.stubGlobal('canvas', {
        app: { ticker: { deltaMS: 16, add: tickerAdd, remove: tickerRemove }, screen: { x: 0, y: 0, width: 1000, height: 1000 } },
        get tokens() {
            return { placeables: tokens };
        },
    });
    vi.stubGlobal('game', {
        settings: {
            get: (_scope: string, key: string): boolean | number => {
                const value = settings.get(key);
                if (value === undefined) throw new Error('unregistered');
                return value;
            },
        },
        video: { getVideoSource: () => null },
    });
    vi.stubGlobal('foundry', {
        audio: { AudioHelper: { play: audioPlay } },
        canvas: { loadTexture: async (): Promise<FakeTexture> => Promise.resolve(new FakeTexture()) },
    });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reducedMotion && query.includes('reduced-motion') }));
}

beforeAll(() => {
    vi.stubGlobal('Hooks', {
        on: (event: string, fn: (...args: never[]) => void): number => {
            handlers.set(event, [...(handlers.get(event) ?? []), fn]);
            return handlers.size;
        },
    });
    registerStatusVisuals();
    vi.unstubAllGlobals();
});

beforeEach(() => {
    tokens = [];
    settings = new Map();
    reducedMotion = false;
    FakeContainer.live = 0;
    FakeGraphics.strokes = 0;
    stubWorld();
    setConditionCatalog(
        buildConditionCatalog([
            {
                packName: 'dh2-core-items-conditions',
                rows: [
                    catalogRow('on-fire', { preset: 'burning', intensity: { perStack: 0.5, max: 2 }, sounds: [{ event: 'apply', src: 'whoosh.ogg' }] }),
                    catalogRow('stunned', { preset: 'stunned' }),
                    catalogRow('unconscious', { filter: 'desaturate' }),
                    catalogRow('ghostly', { overlay: 'mist.webp' }),
                    catalogRow('prone', {}),
                ],
            },
        ]),
    );
});

afterEach(() => {
    fire('canvasTearDown');
    setConditionCatalog(new Map());
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('status visuals — lifecycle', () => {
    it('starts when a status is applied and stops cleanly when it is removed', () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        const effect = applyStatus(actor, 'on-fire');
        expect(liveVisuals(token)).toHaveLength(1);
        expect(liveVisuals(token).at(0)?.name).toBe('wh40k-status-visual');
        expect(statusVisualStats()).toMatchObject({ running: 1, animated: 1, ticking: true });
        expect(tickerAdd).toHaveBeenCalledTimes(1);

        removeStatus(actor, effect);
        expect(liveVisuals(token)).toHaveLength(0);
        expect(statusVisualStats()).toMatchObject({ running: 0, animated: 0, ticking: false });
        expect(tickerRemove).toHaveBeenCalledTimes(1);
        expect(FakeContainer.live).toBe(0);
    });

    it('draws a moving preset on each tick while the token is on screen, and skips it off screen', () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'on-fire');
        const tick = tickerAdd.mock.calls.at(0)?.at(0);
        expect(tick).toBeTypeOf('function');
        tick?.();
        tick?.();
        expect(FakeGraphics.strokes).toBeGreaterThan(0);

        FakeGraphics.strokes = 0;
        token.getBounds = () => ({ x: 5000, y: 5000, width: 100, height: 100 });
        tick?.();
        expect(FakeGraphics.strokes).toBe(0);
        expect(liveVisuals(token).at(0)?.renderable).toBe(false);
    });

    it('follows stacks: a second application raises the intensity in place, without a second visual', () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'on-fire');
        const first = liveVisuals(token).at(0);
        applyStatus(actor, 'on-fire');
        expect(liveVisuals(token)).toEqual([first]);
        expect(statusVisualStats().running).toBe(1);
    });

    it('follows an owned condition item, starting and stopping with it', () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        const item = { type: 'condition', system: { identifier: 'stunned', stackable: false, stacks: 1 }, parent: actor };
        actor.items.push(item);
        fire('createItem', item);
        expect(liveVisuals(token)).toHaveLength(1);
        actor.items = [];
        fire('deleteItem', item);
        expect(liveVisuals(token)).toHaveLength(0);
    });

    it('filters the token art for a filter visual, and takes the filter off again', () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        const effect = applyStatus(actor, 'unconscious');
        expect(token.mesh.filters).toHaveLength(1);
        expect(statusVisualStats()).toMatchObject({ running: 1, animated: 0, ticking: false });
        removeStatus(actor, effect);
        expect(token.mesh.filters).toEqual([]);
    });

    it('lays an overlay file over the token once it loads', async () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'ghostly');
        await vi.waitFor(() => {
            expect(
                liveVisuals(token)
                    .at(0)
                    ?.children.some((child) => child instanceof FakeSprite),
            ).toBe(true);
        });
    });

    it('draws nothing for a status whose condition authors no visual', () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'prone');
        applyStatus(actor, 'dead');
        expect(liveVisuals(token)).toHaveLength(0);
        expect(statusVisualStats().ticking).toBe(false);
    });

    it('stops when the token is hidden from this user, and starts again when it is shown', () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'stunned');
        token.isVisible = false;
        fire('refreshToken', token);
        expect(liveVisuals(token)).toHaveLength(0);
        token.isVisible = true;
        fire('refreshToken', token);
        expect(liveVisuals(token)).toHaveLength(1);
    });

    it('restarts on a token redraw rather than leaving the old visual behind', () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'stunned');
        const before = liveVisuals(token).at(0);
        fire('drawToken', token);
        expect(before?.destroyed).toBe(true);
        expect(liveVisuals(token)).toHaveLength(1);
        expect(statusVisualStats().running).toBe(1);
    });

    it('leaves the real token alone while a drag preview of it is drawn and destroyed', () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'stunned');
        const preview = { ...makeToken('t1', actor), isPreview: true };
        fire('drawToken', preview);
        fire('refreshToken', preview);
        fire('destroyToken', preview);
        expect(liveVisuals(preview)).toHaveLength(0);
        expect(liveVisuals(token)).toHaveLength(1);
        expect(statusVisualStats().running).toBe(1);
    });

    it('tears everything down when the token is destroyed (deleted)', () => {
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'on-fire');
        applyStatus(actor, 'unconscious');
        token.destroyed = true;
        fire('destroyToken', token);
        expect(statusVisualStats()).toEqual({ running: 0, animated: 0, tokens: 0, ticking: false });
        expect(FakeContainer.live).toBe(0);
        expect(token.mesh.filters).toEqual([]);
    });

    it('tears everything down on a scene change, then redraws from document state on the new canvas', () => {
        const actor = makeActor();
        tokens = [makeToken('t1', actor), makeToken('t2', actor, 200)];
        applyStatus(actor, 'on-fire');
        expect(statusVisualStats().running).toBe(2);
        fire('canvasTearDown');
        expect(statusVisualStats()).toEqual({ running: 0, animated: 0, tokens: 0, ticking: false });
        expect(FakeContainer.live).toBe(0);

        const next = makeToken('t3', actor);
        tokens = [next];
        fire('canvasReady');
        expect(liveVisuals(next)).toHaveLength(1);
    });

    it('resolves visuals that were applied before the condition catalog loaded', () => {
        setConditionCatalog(new Map());
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'stunned');
        expect(liveVisuals(token)).toHaveLength(0);
        setConditionCatalog(buildConditionCatalog([{ packName: 'dh2-core-items-conditions', rows: [catalogRow('stunned', { preset: 'stunned' })] }]));
        refreshAllStatusVisuals();
        expect(liveVisuals(token)).toHaveLength(1);
    });
});

describe('status visuals — settings, reduced motion and the cap', () => {
    it('shows only the still ring under reduced motion: nothing animated, no ticker', () => {
        reducedMotion = true;
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'on-fire');
        expect(liveVisuals(token)).toHaveLength(1);
        expect(statusVisualStats()).toMatchObject({ running: 1, animated: 0, ticking: false });
        expect(FakeGraphics.strokes).toBeGreaterThan(0);
    });

    it.each([
        ['the GM switch', 'attack-cues', false],
        ['the user toggle', 'status-visuals', false],
        ['a zero intensity', 'status-visual-intensity', 0],
    ] as const)('shows nothing with %s off, and comes back when it is turned on', (_label, key, off) => {
        settings = new Map([[key, off]]);
        const actor = makeActor();
        const token = makeToken('t1', actor);
        tokens = [token];
        applyStatus(actor, 'stunned');
        expect(liveVisuals(token)).toHaveLength(0);
        settings = new Map();
        fire('clientSettingChanged', `wh40k-rpg.${key}`);
        expect(liveVisuals(token)).toHaveLength(1);
    });

    it('plays the apply sound once at the user volume, and nothing when sounds are off', () => {
        settings = new Map([['attack-cue-volume', 0.5]]);
        const actor = makeActor();
        tokens = [makeToken('t1', actor)];
        applyStatus(actor, 'on-fire');
        expect(audioPlay).toHaveBeenCalledWith({ src: 'whoosh.ogg', volume: 0.5, loop: false }, false);

        audioPlay.mockClear();
        settings = new Map([['attack-cue-sounds', false]]);
        applyStatus(actor, 'on-fire');
        expect(audioPlay).not.toHaveBeenCalled();
    });

    it('caps the animated visuals; the rest render still until a slot frees', () => {
        const actors = Array.from({ length: MAX_ANIMATED_STATUS_VISUALS + 2 }, () => makeActor());
        tokens = actors.map((actor, index) => makeToken(`t${index}`, actor, index * 10));
        const applied = actors.map((actor) => ({ actor, effect: applyStatus(actor, 'stunned') }));
        expect(statusVisualStats()).toMatchObject({ running: MAX_ANIMATED_STATUS_VISUALS + 2, animated: MAX_ANIMATED_STATUS_VISUALS });

        for (const { actor, effect } of applied.slice(0, 1)) removeStatus(actor, effect);
        expect(statusVisualStats()).toMatchObject({ running: MAX_ANIMATED_STATUS_VISUALS + 1, animated: MAX_ANIMATED_STATUS_VISUALS });
    });
});
