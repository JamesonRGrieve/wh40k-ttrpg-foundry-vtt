import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUE_EVENTS, type CueAnchor, type CueEvent, type CueStep } from '../rules/attack-cue.ts';
import { playCuePlan } from './attack-cue-canvas.ts';

/**
 * Playback of an attack cue plan on this client (#594): every cue event draws on the
 * canvas, a Sequencer plays authored animation files, and the user's settings and
 * reduced-motion preference are honoured.
 */

/** A PIXI.Graphics stand-in that records the drawing calls it receives. */
class FakeGraphics {
    static drawn = 0;
    static made: FakeGraphics[] = [];
    destroyed = false;
    constructor() {
        FakeGraphics.made.push(this);
    }
    /** Like PIXI's: a destroyed graphic has no geometry left to clear. */
    clear(): this {
        if (this.destroyed) throw new TypeError("Cannot read properties of null (reading 'clear')");
        return this;
    }
    lineStyle(): this {
        return this;
    }
    moveTo(): this {
        return this;
    }
    lineTo(): this {
        FakeGraphics.drawn++;
        return this;
    }
    arc(): this {
        FakeGraphics.drawn++;
        return this;
    }
    beginFill(): this {
        return this;
    }
    endFill(): this {
        return this;
    }
    drawCircle(): this {
        FakeGraphics.drawn++;
        return this;
    }
    destroy(): void {
        this.destroyed = true;
    }
}

interface SequencerCall {
    file: string;
    at: { x: number; y: number } | null;
    to: { x: number; y: number } | null;
    local: boolean;
}

const sequencerCalls: SequencerCall[] = [];

/** A Sequencer effect section stand-in recording the calls it receives. */
class FakeSection {
    constructor(private readonly call: SequencerCall) {}
    file(path: string): this {
        this.call.file = path;
        return this;
    }
    atLocation(point: { x: number; y: number }): this {
        this.call.at = point;
        return this;
    }
    stretchTo(point: { x: number; y: number }): this {
        this.call.to = point;
        return this;
    }
    delay(): this {
        return this;
    }
    tint(): this {
        return this;
    }
    locally(local = true): this {
        this.call.local = local;
        return this;
    }
}

/** A Sequencer `Sequence` stand-in recording each effect it is given. */
class FakeSequence {
    effect(): FakeSection {
        const call: SequencerCall = { file: '', at: null, to: null, local: false };
        sequencerCalls.push(call);
        return new FakeSection(call);
    }

    async play(): Promise<void> {
        return Promise.resolve();
    }
}

const TOKENS = new Map([
    ['src', { center: { x: 100, y: 100 } }],
    ['tgt', { center: { x: 600, y: 100 } }],
]);
const TEMPLATES = new Map([
    ['cone', { x: 100, y: 100, distance: 10, direction: 0, angle: 30 }],
    ['circle', { x: 600, y: 100, distance: 3, direction: 0, angle: 0 }],
]);

const addChild = vi.fn();
const removeChild = vi.fn();
const audioPlay = vi.fn().mockResolvedValue(undefined);
let settings = new Map<string, boolean | number>();
let sequencerActive = false;
let reducedMotion = false;

function stubWorld(sceneId = 'scene1'): void {
    vi.stubGlobal('PIXI', { Graphics: FakeGraphics });
    vi.stubGlobal('canvas', {
        ready: true,
        scene: { id: sceneId, templates: TEMPLATES },
        tokens: { get: (id: string) => TOKENS.get(id) },
        grid: { size: 100 },
        dimensions: { distancePixels: 50 },
        interface: { addChild, removeChild },
    });
    vi.stubGlobal('game', {
        settings: {
            get: (_scope: string, key: string): boolean | number => {
                const value = settings.get(key);
                if (value === undefined) throw new Error('unregistered');
                return value;
            },
        },
        modules: { get: (id: string) => (id === 'sequencer' && sequencerActive ? { active: true } : undefined) },
    });
    vi.stubGlobal('Sequence', FakeSequence);
    vi.stubGlobal('foundry', { audio: { AudioHelper: { play: audioPlay } } });
    vi.stubGlobal('requestAnimationFrame', (tick: (now: number) => void): number => {
        // Jump straight to the end of the animation: one frame drawn, then torn down.
        tick(performance.now() + 60_000);
        return 0;
    });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reducedMotion && query.includes('reduced-motion') }));
}

const token = (tokenId: string): CueAnchor => ({ kind: 'token', tokenId });

function step(event: CueEvent, overrides: Partial<CueStep> = {}): CueStep {
    return { event, from: token('src'), to: null, delayMs: 0, preset: 'tracer', tint: '', animation: '', sound: '', ...overrides };
}

/** A step anchored the way the mapping anchors that event. */
function stepFor(event: CueEvent): CueStep {
    if (event === 'spray') return step(event, { to: { kind: 'template', templateId: 'cone' } });
    if (event === 'blast') return step(event, { from: { kind: 'template', templateId: 'circle' } });
    if (event === 'fire' || event === 'scatter' || event === 'melee-hit' || event === 'melee-miss') return step(event, { to: token('tgt') });
    if (event === 'miss') return step(event, { from: { kind: 'past', tokenId: 'tgt', fromTokenId: 'src', side: 1 } });
    return step(event, { from: token('tgt') });
}

beforeEach(() => {
    settings = new Map();
    sequencerActive = false;
    reducedMotion = false;
    sequencerCalls.length = 0;
    FakeGraphics.drawn = 0;
    FakeGraphics.made = [];
    stubWorld();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
});

describe('playCuePlan — procedural canvas effects', () => {
    it.each(CUE_EVENTS.map((event) => [event]))('draws the %s cue and cleans it up', (event) => {
        playCuePlan({ sceneId: 'scene1', steps: [stepFor(event)] });
        expect(addChild).toHaveBeenCalled();
        expect(FakeGraphics.drawn).toBeGreaterThan(0);
        expect(removeChild).toHaveBeenCalledTimes(addChild.mock.calls.length);
    });

    // Tier B (#599 area attack spec): deleting the scene mid-cue destroyed the interface
    // layer's children, and every later frame threw drawing into the dead graphic.
    it('stops a cue whose graphic the canvas destroyed mid-animation', () => {
        const queuedFrames: Array<(now: number) => void> = [];
        vi.stubGlobal('requestAnimationFrame', (tick: (now: number) => void): number => queuedFrames.push(tick));
        playCuePlan({ sceneId: 'scene1', steps: [stepFor('fire')] });
        const graphic = FakeGraphics.made.at(0);
        expect(graphic).toBeDefined();
        graphic?.destroy();
        const pending = queuedFrames.splice(0);
        expect(pending.length).toBeGreaterThan(0);
        expect(() => {
            for (const tick of pending) tick(performance.now() + 100);
        }).not.toThrow();
        // It neither asks for another frame nor removes what the canvas already tore down.
        expect(queuedFrames).toEqual([]);
        expect(removeChild).not.toHaveBeenCalled();
    });

    it('plays each step at its delay', () => {
        vi.useFakeTimers();
        playCuePlan({ sceneId: 'scene1', steps: [stepFor('fire'), { ...stepFor('hit'), delayMs: 250 }] });
        const afterFirst = addChild.mock.calls.length;
        expect(afterFirst).toBeGreaterThan(0);
        vi.advanceTimersByTime(250);
        expect(addChild.mock.calls.length).toBeGreaterThan(afterFirst);
    });
});

describe('playCuePlan — Sequencer', () => {
    it('plays an authored animation file through an active Sequencer, locally, from firer to target', () => {
        sequencerActive = true;
        playCuePlan({ sceneId: 'scene1', steps: [step('fire', { to: token('tgt'), animation: 'bolt.webm' })] });
        expect(sequencerCalls).toEqual([{ file: 'bolt.webm', at: { x: 100, y: 100 }, to: { x: 600, y: 100 }, local: true }]);
        expect(addChild).not.toHaveBeenCalled();
    });

    it('draws the procedural preset when Sequencer is not active, even with a file authored', () => {
        playCuePlan({ sceneId: 'scene1', steps: [step('fire', { to: token('tgt'), animation: 'bolt.webm' })] });
        expect(sequencerCalls).toEqual([]);
        expect(addChild).toHaveBeenCalled();
    });
});

describe('playCuePlan — settings and reduced motion', () => {
    it('plays an authored sound at the user volume, locally', () => {
        settings = new Map([['attack-cue-volume', 0.4]]);
        playCuePlan({ sceneId: 'scene1', steps: [step('jam', { sound: 'click.ogg' })] });
        expect(audioPlay).toHaveBeenCalledWith({ src: 'click.ogg', volume: 0.4, loop: false }, false);
    });

    it('draws nothing under reduced motion, but still plays the sound', () => {
        reducedMotion = true;
        playCuePlan({ sceneId: 'scene1', steps: [step('explode', { sound: 'boom.ogg' })] });
        expect(addChild).not.toHaveBeenCalled();
        expect(audioPlay).toHaveBeenCalled();
    });

    it('draws nothing with animations off, and plays nothing with sounds off', () => {
        settings = new Map([
            ['attack-cue-animations', false],
            ['attack-cue-sounds', false],
        ]);
        playCuePlan({ sceneId: 'scene1', steps: [step('explode', { sound: 'boom.ogg' })] });
        expect(addChild).not.toHaveBeenCalled();
        expect(audioPlay).not.toHaveBeenCalled();
    });

    it('plays nothing at all when the GM has turned attack cues off', () => {
        settings = new Map([['attack-cues', false]]);
        playCuePlan({ sceneId: 'scene1', steps: [step('explode', { sound: 'boom.ogg' })] });
        expect(addChild).not.toHaveBeenCalled();
        expect(audioPlay).not.toHaveBeenCalled();
    });

    it('draws nothing on a client viewing another scene', () => {
        stubWorld('elsewhere');
        playCuePlan({ sceneId: 'scene1', steps: [step('explode')] });
        expect(addChild).not.toHaveBeenCalled();
    });

    it('skips a step whose token is not on the scene', () => {
        playCuePlan({ sceneId: 'scene1', steps: [step('hit', { from: token('gone') })] });
        expect(addChild).not.toHaveBeenCalled();
    });
});
