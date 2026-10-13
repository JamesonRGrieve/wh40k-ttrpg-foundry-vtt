import { describe, expect, it } from 'vitest';
import {
    type AttackCueOutcome,
    CUE_EVENTS,
    type CueProfile,
    type CueStep,
    cueProfileOf,
    defaultCuePreset,
    missPoint,
    planAttackCues,
    planHitCues,
    planReactionCues,
    readCueProfile,
} from './attack-cue.ts';

/** The outcome → cue mapping (#594): one cue vocabulary for all six lines. */

const EMPTY: CueProfile = { preset: '', tint: '', animations: [], sounds: [] };
const first = (): number => 0;

function outcome(overrides: Partial<AttackCueOutcome> = {}): AttackCueOutcome {
    return {
        kind: 'ranged',
        sourceTokenId: 'src',
        targetTokenId: 'tgt',
        success: true,
        hits: 1,
        area: null,
        jammed: false,
        overheated: false,
        exploded: false,
        phenomena: false,
        perils: false,
        ...overrides,
    };
}

const events = (steps: CueStep[]): string[] => steps.map((step) => step.event);

describe('planAttackCues — ranged', () => {
    it('a hit draws one shot to the target and its impact after the shot crosses', () => {
        const steps = planAttackCues(outcome(), EMPTY, first);
        expect(events(steps)).toEqual(['fire', 'hit']);
        expect(steps[0]).toMatchObject({ from: { kind: 'token', tokenId: 'src' }, to: { kind: 'token', tokenId: 'tgt' }, delayMs: 0 });
        expect(steps[1]).toMatchObject({ from: { kind: 'token', tokenId: 'tgt' }, to: null });
        expect(steps[1]?.delayMs).toBeGreaterThan(0);
    });

    it('a miss is aimed past the target, not at it', () => {
        const steps = planAttackCues(outcome({ success: false, hits: 0 }), EMPTY, first);
        expect(events(steps)).toEqual(['fire', 'miss']);
        expect(steps[0]?.to).toEqual({ kind: 'past', tokenId: 'tgt', fromTokenId: 'src', side: -1 });
        expect(steps[1]?.from).toEqual(steps[0]?.to);
    });

    it('a semi-auto burst draws one tracer and one impact per hit landed', () => {
        const steps = planAttackCues(outcome({ hits: 3 }), EMPTY, first);
        expect(events(steps)).toEqual(['fire', 'hit', 'fire', 'hit', 'fire', 'hit']);
        const fires = steps.filter((step) => step.event === 'fire').map((step) => step.delayMs);
        expect(fires).toEqual([0, 150, 300]);
    });

    it('a full-auto burst fires in rapid succession', () => {
        const fires = planAttackCues(outcome({ hits: 6 }), EMPTY, first).filter((step) => step.event === 'fire');
        expect(fires).toHaveLength(6);
        expect(fires[1]?.delayMs).toBe(80);
    });

    it('caps a malformed hit count', () => {
        expect(planAttackCues(outcome({ hits: 9999 }), EMPTY, first).filter((step) => step.event === 'fire')).toHaveLength(24);
        expect(planAttackCues(outcome({ hits: Number.NaN }), EMPTY, first).filter((step) => step.event === 'fire')).toHaveLength(1);
    });

    it('a jam plays only the jam: no round leaves the barrel', () => {
        expect(events(planAttackCues(outcome({ success: false, jammed: true }), EMPTY, first))).toEqual(['jam']);
    });

    it('a weapon that breaks plays only its explosion', () => {
        expect(events(planAttackCues(outcome({ success: false, exploded: true, jammed: true }), EMPTY, first))).toEqual(['explode']);
    });

    it('an overheat plays on the firer after the shot', () => {
        const steps = planAttackCues(outcome({ overheated: true }), EMPTY, first);
        expect(events(steps)).toEqual(['fire', 'hit', 'overheat']);
        expect(steps[2]).toMatchObject({ from: { kind: 'token', tokenId: 'src' } });
        expect(steps[2]?.delayMs).toBe(steps[1]?.delayMs);
    });

    it('with no target the shot is a muzzle flash at the firer', () => {
        expect(planAttackCues(outcome({ targetTokenId: null }), EMPTY, first)).toEqual([expect.objectContaining({ event: 'fire', to: null })]);
    });
});

describe('planAttackCues — areas (#599)', () => {
    it('a cone sprays from the firer to the template', () => {
        const steps = planAttackCues(outcome({ area: { templateId: 'tpl', shape: 'cone', scattered: false } }), EMPTY, first);
        expect(steps).toEqual([expect.objectContaining({ event: 'spray', to: { kind: 'template', templateId: 'tpl' } })]);
    });

    it('a blast that hits fires at the impact point and bursts there', () => {
        const steps = planAttackCues(outcome({ area: { templateId: 'tpl', shape: 'circle', scattered: false } }), EMPTY, first);
        expect(events(steps)).toEqual(['fire', 'blast']);
        expect(steps[1]?.from).toEqual({ kind: 'template', templateId: 'tpl' });
    });

    it('a blast that missed scatters to where the template landed', () => {
        const steps = planAttackCues(outcome({ success: false, area: { templateId: 'tpl', shape: 'circle', scattered: true } }), EMPTY, first);
        expect(events(steps)).toEqual(['scatter', 'blast']);
    });
});

describe('planAttackCues — melee and psychic', () => {
    it('a melee hit swings once per hit landed', () => {
        expect(events(planAttackCues(outcome({ kind: 'melee', hits: 2 }), EMPTY, first))).toEqual(['melee-hit', 'melee-hit']);
    });

    it('a melee miss whiffs', () => {
        expect(events(planAttackCues(outcome({ kind: 'melee', success: false, hits: 0 }), EMPTY, first))).toEqual(['melee-miss']);
    });

    it('a power manifests on the psyker, then reaches its target', () => {
        const steps = planAttackCues(outcome({ kind: 'psychic' }), EMPTY, first);
        expect(events(steps)).toEqual(['manifest', 'fire', 'hit']);
        expect(steps[1]?.delayMs).toBeGreaterThan(0);
    });

    it('a failed power manifests and goes nowhere', () => {
        expect(events(planAttackCues(outcome({ kind: 'psychic', success: false, hits: 0 }), EMPTY, first))).toEqual(['manifest']);
    });

    it('Phenomena play on the psyker; Perils replace them', () => {
        expect(events(planAttackCues(outcome({ kind: 'psychic', phenomena: true }), EMPTY, first))).toContain('phenomena');
        const perils = events(planAttackCues(outcome({ kind: 'psychic', phenomena: true, perils: true }), EMPTY, first));
        expect(perils).toContain('perils');
        expect(perils).not.toContain('phenomena');
    });
});

describe('planReactionCues', () => {
    it('a successful Dodge or Parry plays on the defender', () => {
        expect(planReactionCues({ reaction: 'parry', defenderTokenId: 'def', success: true }, EMPTY, first)).toEqual([
            expect.objectContaining({ event: 'parry', from: { kind: 'token', tokenId: 'def' } }),
        ]);
        expect(events(planReactionCues({ reaction: 'dodge', defenderTokenId: 'def', success: true }, EMPTY, first))).toEqual(['dodge']);
    });

    it('a failed reaction plays nothing', () => {
        expect(planReactionCues({ reaction: 'dodge', defenderTokenId: 'def', success: false }, EMPTY, first)).toEqual([]);
    });
});

describe('planHitCues', () => {
    it('plays a critical on each hit that rolled one, and nothing else on a targeted attack', () => {
        const steps = planHitCues(
            [
                { tokenId: 't', critical: false },
                { tokenId: 't', critical: true },
            ],
            [],
            'ranged',
            EMPTY,
            false,
            first,
        );
        expect(events(steps)).toEqual(['critical']);
    });

    it('draws an area attack on every creature it hit, and a dodge on each that avoided it', () => {
        const steps = planHitCues(
            [
                { tokenId: 'a', critical: false },
                { tokenId: 'b', critical: true },
            ],
            ['c'],
            'ranged',
            EMPTY,
            true,
            first,
        );
        expect(steps.map((step) => [step.event, step.from])).toEqual([
            ['hit', { kind: 'token', tokenId: 'a' }],
            ['critical', { kind: 'token', tokenId: 'b' }],
            ['dodge', { kind: 'token', tokenId: 'c' }],
        ]);
    });
});

describe('profile → steps', () => {
    it('takes the attack kind default preset when the item authors none', () => {
        expect(defaultCuePreset('ranged')).toBe('tracer');
        expect(defaultCuePreset('melee')).toBe('blade');
        expect(defaultCuePreset('psychic')).toBe('warp');
        expect(planAttackCues(outcome({ kind: 'melee' }), EMPTY, first)[0]?.preset).toBe('blade');
    });

    it('carries the authored preset, tint, and the files authored for each event', () => {
        const profile: CueProfile = {
            preset: 'plasma',
            tint: '#00ffaa',
            animations: [{ event: 'fire', src: 'plasma-bolt.webm' }],
            sounds: [
                { event: 'fire', src: 'plasma.ogg' },
                { event: 'overheat', src: 'vent.ogg' },
            ],
        };
        const [fire, hit, overheat] = planAttackCues(outcome({ overheated: true }), profile, first);
        expect(fire).toMatchObject({ preset: 'plasma', tint: '#00ffaa', animation: 'plasma-bolt.webm', sound: 'plasma.ogg' });
        expect(hit).toMatchObject({ animation: '', sound: '' });
        expect(overheat).toMatchObject({ sound: 'vent.ogg' });
    });
});

describe('readCueProfile / cueProfileOf', () => {
    it('drops an unknown preset, a malformed tint, and assets with no file or an unknown event', () => {
        expect(
            readCueProfile({
                preset: 'lasgun',
                tint: 'red',
                sounds: [
                    { event: 'fire', src: ' bang.ogg ' },
                    { event: 'boom', src: 'x.ogg' },
                    { event: 'hit', src: '' },
                ],
            }),
        ).toEqual({ preset: '', tint: '', animations: [], sounds: [{ event: 'fire', src: 'bang.ogg' }] });
        expect(readCueProfile({ preset: 'melta', tint: '#FFAA00' })).toMatchObject({ preset: 'melta', tint: '#ffaa00' });
    });

    it('reads an untyped item payload, and an absent or malformed block as empty', () => {
        expect(cueProfileOf({ cue: { preset: 'las', sounds: [{ event: 'fire', src: 'las.ogg' }, 'junk', null] } })).toEqual({
            preset: 'las',
            tint: '',
            animations: [],
            sounds: [{ event: 'fire', src: 'las.ogg' }],
        });
        expect(cueProfileOf({})).toEqual(EMPTY);
        expect(cueProfileOf({ cue: 'las' })).toEqual(EMPTY);
        expect(cueProfileOf({ cue: { preset: 3, sounds: 'x' } })).toEqual(EMPTY);
        expect(cueProfileOf(undefined)).toEqual(EMPTY);
    });
});

describe('missPoint', () => {
    it('lands past the target along the line of fire, off to the chosen side', () => {
        // Firing along +x on a 100px grid: 150px past, 60px to the side.
        expect(missPoint({ x: 0, y: 0 }, { x: 500, y: 0 }, 100, 1)).toEqual({ x: 650, y: 60 });
        expect(missPoint({ x: 0, y: 0 }, { x: 500, y: 0 }, 100, -1)).toEqual({ x: 650, y: -60 });
    });

    it('still passes the target when firer and target share a point', () => {
        expect(missPoint({ x: 10, y: 10 }, { x: 10, y: 10 }, 100, 1)).toEqual({ x: 160, y: 70 });
    });
});

describe('vocabulary', () => {
    it('covers every outcome the issue names', () => {
        for (const event of [
            'hit',
            'miss',
            'critical',
            'jam',
            'overheat',
            'explode',
            'scatter',
            'blast',
            'spray',
            'melee-hit',
            'parry',
            'dodge',
            'manifest',
            'perils',
        ]) {
            expect(CUE_EVENTS).toContain(event);
        }
    });
});
