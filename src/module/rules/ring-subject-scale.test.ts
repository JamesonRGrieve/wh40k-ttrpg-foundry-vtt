import { describe, expect, it, vi } from 'vitest';
import {
    applyRingScaleOnPreCreateActor,
    applyRingScaleOnPreCreateToken,
    applyRingScaleOnPreUpdateActor,
    applyRingScaleOnPreUpdateToken,
    needsRingSubjectScale,
    normalizeRingSubjectScales,
    RING_SUBJECT_SCALE,
    type RingChange,
    type RingScaleActor,
    type RingScaleScene,
    ringScaleForUpdate,
} from './ring-subject-scale.ts';

describe('needsRingSubjectScale', () => {
    it('is true for a ringed token at Foundry’s default scale or with none', () => {
        expect(needsRingSubjectScale({ enabled: true, subject: { scale: 1 } })).toBe(true);
        expect(needsRingSubjectScale({ enabled: true, subject: {} })).toBe(true);
        expect(needsRingSubjectScale({ enabled: true })).toBe(true);
    });

    it('is false without a ring, and for a scale someone set', () => {
        expect(needsRingSubjectScale({ enabled: false, subject: { scale: 1 } })).toBe(false);
        expect(needsRingSubjectScale(null)).toBe(false);
        expect(needsRingSubjectScale({ enabled: true, subject: { scale: RING_SUBJECT_SCALE } })).toBe(false);
        expect(needsRingSubjectScale({ enabled: true, subject: { scale: 0.9 } })).toBe(false);
    });
});

describe('pre-create hooks', () => {
    it('creates a ringed token at the bust’s scale', () => {
        const updateSource = vi.fn();
        expect(applyRingScaleOnPreCreateToken({ ring: { enabled: true, subject: { scale: 1 } }, updateSource })).toBe(true);
        expect(updateSource).toHaveBeenCalledWith({ ring: { subject: { scale: RING_SUBJECT_SCALE } } });
    });

    it('leaves a ringless token and a custom scale alone', () => {
        const updateSource = vi.fn();
        applyRingScaleOnPreCreateToken({ ring: { enabled: false, subject: { scale: 1 } }, updateSource });
        applyRingScaleOnPreCreateToken({ ring: { enabled: true, subject: { scale: 0.9 } }, updateSource });
        expect(updateSource).not.toHaveBeenCalled();
    });

    it('creates an actor with a ringed prototype token at the bust’s scale', () => {
        const updateSource = vi.fn();
        expect(applyRingScaleOnPreCreateActor({ prototypeToken: { ring: { enabled: true, subject: { scale: 1 } } }, updateSource })).toBe(true);
        expect(updateSource).toHaveBeenCalledWith({ prototypeToken: { ring: { subject: { scale: RING_SUBJECT_SCALE } } } });
    });

    it('leaves an actor without a ringed prototype alone', () => {
        const updateSource = vi.fn();
        expect(applyRingScaleOnPreCreateActor({ prototypeToken: { ring: { enabled: false } }, updateSource })).toBe(false);
        expect(applyRingScaleOnPreCreateActor({ prototypeToken: null, updateSource })).toBe(false);
        expect(updateSource).not.toHaveBeenCalled();
    });
});

describe('switching a ring on', () => {
    it('adds the scale when the ring is switched on at the default', () => {
        expect(ringScaleForUpdate({ enabled: false, subject: { scale: 1 } }, { enabled: true })).toBe(RING_SUBJECT_SCALE);
    });

    it('keeps a scale the update names, a scale already set, and ignores updates that leave the ring off', () => {
        expect(ringScaleForUpdate({ enabled: false, subject: { scale: 1 } }, { enabled: true, subject: { scale: 0.9 } })).toBeNull();
        expect(ringScaleForUpdate({ enabled: false, subject: { scale: 0.7 } }, { enabled: true })).toBeNull();
        expect(ringScaleForUpdate({ enabled: true, subject: { scale: 1 } }, { enabled: false })).toBeNull();
        expect(ringScaleForUpdate({ enabled: true, subject: { scale: 1 } }, null)).toBeNull();
    });

    it('writes the scale into a token update', () => {
        const changes: { ring?: RingChange | null } = { ring: { enabled: true } };
        expect(applyRingScaleOnPreUpdateToken({ ring: { enabled: false, subject: { scale: 1 } } }, changes)).toBe(true);
        expect(changes.ring).toEqual({ enabled: true, subject: { scale: RING_SUBJECT_SCALE } });
    });

    it('writes the scale into an actor’s prototype-token update', () => {
        const changes: { prototypeToken?: { ring?: RingChange | null } | null } = { prototypeToken: { ring: { enabled: true } } };
        expect(applyRingScaleOnPreUpdateActor({ prototypeToken: { ring: { enabled: false } } }, changes)).toBe(true);
        expect(changes.prototypeToken?.ring).toEqual({ enabled: true, subject: { scale: RING_SUBJECT_SCALE } });
    });

    it('leaves an update that does not touch the ring unchanged', () => {
        const changes: { prototypeToken?: { ring?: RingChange | null } | null } = { prototypeToken: {} };
        expect(applyRingScaleOnPreUpdateActor({ prototypeToken: { ring: { enabled: true } } }, changes)).toBe(false);
        expect(changes).toEqual({ prototypeToken: {} });
    });
});

describe('normalizeRingSubjectScales (ready pass)', () => {
    function actor(ring: NonNullable<RingScaleActor['prototypeToken']> | null): RingScaleActor & { update: ReturnType<typeof vi.fn> } {
        return { prototypeToken: ring, update: vi.fn(async () => Promise.resolve({})) };
    }

    it('updates every ringed prototype and placed token still at the default, in one batch per scene', async () => {
        const fixActor = actor({ ring: { enabled: true, subject: { scale: 1 } } });
        const customActor = actor({ ring: { enabled: true, subject: { scale: 0.9 } } });
        const ringless = actor({ ring: { enabled: false } });
        const updateEmbeddedDocuments = vi.fn(async () => Promise.resolve([]));
        const scene: RingScaleScene = {
            tokens: [
                { id: 'a', ring: { enabled: true, subject: { scale: 1 } } },
                { id: 'b', ring: { enabled: true, subject: { scale: RING_SUBJECT_SCALE } } },
                { id: 'c', ring: { enabled: false } },
                { id: 'd', ring: { enabled: true } },
            ],
            updateEmbeddedDocuments,
        };
        const untouched: RingScaleScene = { tokens: [{ id: 'e', ring: { enabled: false } }], updateEmbeddedDocuments: vi.fn(async () => Promise.resolve([])) };

        await expect(normalizeRingSubjectScales([fixActor, customActor, ringless], [scene, untouched])).resolves.toBe(3);
        expect(fixActor.update).toHaveBeenCalledWith({ 'prototypeToken.ring.subject.scale': RING_SUBJECT_SCALE });
        expect(customActor.update).not.toHaveBeenCalled();
        expect(ringless.update).not.toHaveBeenCalled();
        expect(updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(updateEmbeddedDocuments).toHaveBeenCalledWith('Token', [
            { '_id': 'a', 'ring.subject.scale': RING_SUBJECT_SCALE },
            { '_id': 'd', 'ring.subject.scale': RING_SUBJECT_SCALE },
        ]);
        expect(untouched.updateEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('does nothing in a world already at the scale', async () => {
        await expect(normalizeRingSubjectScales([actor({ ring: { enabled: true, subject: { scale: RING_SUBJECT_SCALE } } })], [])).resolves.toBe(0);
    });
});
