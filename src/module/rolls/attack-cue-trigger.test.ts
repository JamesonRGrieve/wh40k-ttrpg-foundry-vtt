import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AreaTemplateSpec } from '../rules/area-template.ts';
import {
    type CueActionLike,
    attackCueOutcome,
    attackCueSteps,
    cueAttackResolved,
    cueAttackKind,
    hitCueSteps,
    registerAttackCueSocket,
} from './attack-cue-trigger.ts';

/** The single trigger point from a resolved roll to its attack cue (#594). */

const actor = (tokenId: string | null): CueActionLike['rollData']['sourceActor'] => ({ getActiveTokens: () => (tokenId === null ? [] : [{ id: tokenId }]) });
const rifle = { isMelee: false, system: { cue: { preset: 'las', sounds: [{ event: 'fire', src: 'las.ogg' }] } } };
const sword = { isMelee: true, system: {} };
const first = (): number => 0;

const SPRAY: AreaTemplateSpec = {
    qualityId: 'spray',
    level: null,
    shape: 'cone',
    angle: 30,
    distance: 20,
    anchor: 'firer',
    resolution: 'avoid',
    avoid: { modifier: 0, untrainedBonus: 0, unbracedHeavyBonus: 0 },
    hitLocation: 'body',
};

function action(rollData: Partial<CueActionLike['rollData']> = {}, extra: Partial<CueActionLike> = {}): CueActionLike {
    return {
        effects: [],
        damageData: { hits: [], additionalHits: 0 },
        ...extra,
        rollData: { sourceActor: actor('src'), targetActor: actor('tgt'), weapon: rifle, success: true, rollKey: '', ...rollData },
    };
}

describe('cueAttackKind', () => {
    it('reads a power as psychic, a melee weapon as melee, any other weapon as ranged, and anything else as no attack', () => {
        expect(cueAttackKind(action({ power: sword, weapon: undefined }).rollData)).toBe('psychic');
        expect(cueAttackKind(action({ weapon: sword }).rollData)).toBe('melee');
        expect(cueAttackKind(action().rollData)).toBe('ranged');
        expect(cueAttackKind(action({ weapon: undefined }).rollData)).toBeNull();
    });
});

describe('attackCueOutcome', () => {
    it('counts the burst hits landed and reads the outcome markers off the action', () => {
        const out = attackCueOutcome(action({}, { effects: ['overheat', 'psychic-phenomena'], damageData: { hits: [], additionalHits: 2 } }));
        expect(out).toMatchObject({ kind: 'ranged', sourceTokenId: 'src', targetTokenId: 'tgt', hits: 3, overheated: true, phenomena: true, jammed: false });
    });

    it('lands no hits on a miss, and reads a jam and a broken weapon', () => {
        expect(attackCueOutcome(action({ success: false }, { effects: ['jam', 'weapon-broken'] }))).toMatchObject({ hits: 0, jammed: true, exploded: true });
    });

    it('cues nothing for a target-only post, a non-attack, or an attacker with no token', () => {
        expect(attackCueOutcome(action({ isTargetOnly: true }))).toBeNull();
        expect(attackCueOutcome(action({ weapon: undefined }))).toBeNull();
        expect(attackCueOutcome(action({ sourceActor: actor(null) }))).toBeNull();
    });

    it('reads a placed area and whether its impact scattered', () => {
        const ref = { sceneId: 's', templateId: 'tpl' };
        expect(attackCueOutcome(action({ areaTemplate: SPRAY, areaTemplateRef: ref }))?.area).toEqual({ templateId: 'tpl', shape: 'cone', scattered: false });
        const blast: AreaTemplateSpec = { ...SPRAY, qualityId: 'blast', shape: 'circle', anchor: 'impact', resolution: 'hit', avoid: null };
        expect(attackCueOutcome(action({ success: false, areaTemplate: blast, areaTemplateRef: ref }))?.area).toEqual({
            templateId: 'tpl',
            shape: 'circle',
            scattered: true,
        });
        expect(attackCueOutcome(action({ areaTemplate: SPRAY, areaTemplateRef: null }))?.area).toBeNull();
    });
});

describe('attackCueSteps', () => {
    it("plays the weapon's authored profile", () => {
        const [fire] = attackCueSteps(action(), first);
        expect(fire).toMatchObject({ event: 'fire', preset: 'las', sound: 'las.ogg' });
    });

    it("cues a successful Dodge or Parry test on the roller's token", () => {
        expect(attackCueSteps(action({ weapon: undefined, rollKey: 'parry' }), first)).toEqual([
            expect.objectContaining({ event: 'parry', from: { kind: 'token', tokenId: 'src' } }),
        ]);
        expect(attackCueSteps(action({ weapon: undefined, rollKey: 'dodge', success: false }), first)).toEqual([]);
        expect(attackCueSteps(action({ weapon: undefined, rollKey: 'awareness' }), first)).toEqual([]);
    });
});

describe('hitCueSteps', () => {
    it('plays a critical on the target for each hit that rolled Righteous Fury', () => {
        const steps = hitCueSteps(action({}, { damageData: { hits: [{ righteousFury: [] }, { righteousFury: [{}] }], additionalHits: 1 } }), first);
        expect(steps).toEqual([expect.objectContaining({ event: 'critical', from: { kind: 'token', tokenId: 'tgt' } })]);
    });

    it('draws a burst’s spread hits on the creatures they landed on, shot from the firer (#513)', () => {
        const hits = [{ righteousFury: [] }, { righteousFury: [], targetUuid: 'Actor.N' }, { righteousFury: [{}], targetUuid: 'Actor.gone' }];
        const resolve = (uuid: string): ReturnType<typeof actor> | null => (uuid === 'Actor.N' ? actor('near') : null);
        const steps = hitCueSteps(action({}, { damageData: { hits, additionalHits: 2 } }), first, resolve);
        expect(steps.map((step) => [step.event, step.from, step.to])).toEqual([
            ['fire', { kind: 'token', tokenId: 'src' }, { kind: 'token', tokenId: 'near' }],
            ['hit', { kind: 'token', tokenId: 'near' }, null],
            // A spread target that is gone is drawn at the declared target, as before.
            ['critical', { kind: 'token', tokenId: 'tgt' }, null],
        ]);
    });

    it('draws an area attack per creature: hits in order, dodges for those who avoided it', () => {
        const areaResults = [
            { tokenId: 'a', actorUuid: 'A', name: 'A', hit: true, test: null },
            { tokenId: 'b', actorUuid: 'B', name: 'B', hit: false, test: null },
            { tokenId: 'c', actorUuid: 'C', name: 'C', hit: true, test: null },
        ];
        const steps = hitCueSteps(
            action({ areaTemplate: SPRAY, areaResults }, { damageData: { hits: [{ righteousFury: [] }, { righteousFury: [{}] }], additionalHits: 0 } }),
            first,
        );
        expect(steps.map((step) => [step.event, step.from])).toEqual([
            ['hit', { kind: 'token', tokenId: 'a' }],
            ['critical', { kind: 'token', tokenId: 'c' }],
            ['dodge', { kind: 'token', tokenId: 'b' }],
        ]);
    });

    it('plays nothing before hits are rolled', () => {
        expect(hitCueSteps(action(), first)).toEqual([]);
    });
});

describe('broadcast', () => {
    const emit = vi.fn<(channel: string, message: { type: string; plan?: { sceneId: string } }) => void>();
    const on = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('game', {
            socket: { emit, on },
            settings: {
                get: (): never => {
                    throw new Error('unregistered');
                },
            },
            modules: { get: (): undefined => undefined },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetAllMocks();
    });

    it('sends nothing without a drawn canvas (headless, or before the scene draws)', () => {
        cueAttackResolved(action());
        expect(emit).not.toHaveBeenCalled();
    });

    it('sends the plan for the viewed scene to the other clients, and plays its sound here, locally', () => {
        const play = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('foundry', { audio: { AudioHelper: { play } } });
        vi.stubGlobal('canvas', { ready: true, scene: { id: 'scene1', templates: new Map() }, tokens: { get: (): undefined => undefined } });
        const callAll = vi.fn();
        vi.stubGlobal('Hooks', { callAll });
        cueAttackResolved(action());
        expect(callAll, 'each played step is announced on this client').toHaveBeenCalled();
        const [channel, message] = emit.mock.calls[0] ?? [];
        expect(channel).toBe('system.wh40k-rpg');
        expect(message).toMatchObject({ type: 'attackCue', plan: { sceneId: 'scene1' } });
        expect(play).toHaveBeenCalledWith({ src: 'las.ogg', volume: 0.8, loop: false }, false);
    });

    it('sends nothing when the GM has turned attack cues off', () => {
        vi.stubGlobal('canvas', { ready: true, scene: { id: 'scene1' } });
        vi.stubGlobal('game', { socket: { emit, on }, settings: { get: (_scope: string, key: string): boolean => key !== 'attack-cues' } });
        cueAttackResolved(action());
        expect(emit).not.toHaveBeenCalled();
    });

    it('listens on the shared system socket', () => {
        registerAttackCueSocket();
        expect(on).toHaveBeenCalledWith('system.wh40k-rpg', expect.any(Function));
    });
});
