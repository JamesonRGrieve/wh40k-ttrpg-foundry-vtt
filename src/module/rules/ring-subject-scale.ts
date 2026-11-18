/**
 * @file The dynamic token ring's subject scale, the same for every ringed token.
 *
 * The circular bust (`canvas/token-mask.ts`) bakes its content circle for a ring
 * whose `ring.subject.scale` is {@link RING_SUBJECT_SCALE}: the subject scale
 * resizes core's ring geometry around the subject, so at Foundry's own default of
 * 1 the band draws inside the bust instead of on its edge. Only the Kanka import
 * and the portrait-pool spawn used to write the scale, so a ringed actor made any
 * other way (in Foundry, from a base actor, framed by hand) drew its ring inside
 * its portrait (operator report, Session 25, 2026-11-18).
 *
 * The system now owns the value: a ringed actor or token still at Foundry's
 * default is given {@link RING_SUBJECT_SCALE} when it is created, when its ring is
 * switched on, and once at `ready` for what already exists. A scale someone set to
 * anything other than the default is left alone.
 */

/** The ring subject scale the circular bust is baked for. */
export const RING_SUBJECT_SCALE = 0.8;

/** Foundry's own default for `ring.subject.scale`. */
const CORE_DEFAULT_SUBJECT_SCALE = 1;

/** The slice of a token's (or prototype token's) ring this reads. */
export interface RingSubjectLike {
    enabled?: boolean | null | undefined;
    subject?: { scale?: number | null | undefined } | null | undefined;
}

/** A ringed token whose subject scale is unset or still Foundry's default. */
export function needsRingSubjectScale(ring: RingSubjectLike | null | undefined): boolean {
    if (ring?.enabled !== true) return false;
    const scale = ring.subject?.scale;
    return scale == null || scale === CORE_DEFAULT_SUBJECT_SCALE;
}

/** A pending document whose source can be changed before it is written. */
interface SourceUpdatable {
    updateSource: (changes: object) => void;
}

/** `preCreateToken`: a ringed token at the default scale is created at {@link RING_SUBJECT_SCALE}. */
export function applyRingScaleOnPreCreateToken(token: SourceUpdatable & { ring?: RingSubjectLike | null }): boolean {
    if (!needsRingSubjectScale(token.ring)) return false;
    token.updateSource({ ring: { subject: { scale: RING_SUBJECT_SCALE } } });
    return true;
}

/** `preCreateActor`: a ringed prototype token at the default scale is created at {@link RING_SUBJECT_SCALE}. */
export function applyRingScaleOnPreCreateActor(actor: SourceUpdatable & { prototypeToken?: { ring?: RingSubjectLike | null } | null }): boolean {
    if (!needsRingSubjectScale(actor.prototypeToken?.ring)) return false;
    actor.updateSource({ prototypeToken: { ring: { subject: { scale: RING_SUBJECT_SCALE } } } });
    return true;
}

/** The ring part of an update, nested (`{ ring: { enabled } }`) as Foundry hands it to a pre-update hook. */
export interface RingChange {
    enabled?: boolean | null | undefined;
    subject?: { scale?: number | null | undefined } | null | undefined;
}

/**
 * The scale to add to an update that switches a ring on, or `null`. An update
 * that turns the ring on without naming a scale, on a token still at the
 * default, gets {@link RING_SUBJECT_SCALE}; an update that names a scale keeps it.
 */
export function ringScaleForUpdate(current: RingSubjectLike | null | undefined, change: RingChange | null | undefined): number | null {
    if (change?.enabled !== true) return null;
    if (change.subject?.scale != null) return null;
    return needsRingSubjectScale({ enabled: true, subject: current?.subject ?? null }) ? RING_SUBJECT_SCALE : null;
}

/** `preUpdateToken`: switching a token's ring on also sets its subject scale. */
export function applyRingScaleOnPreUpdateToken(token: { ring?: RingSubjectLike | null }, changes: { ring?: RingChange | null }): boolean {
    const scale = ringScaleForUpdate(token.ring, changes.ring);
    if (scale === null || changes.ring == null) return false;
    changes.ring.subject = { ...(changes.ring.subject ?? {}), scale };
    return true;
}

/** `preUpdateActor`: switching the prototype token's ring on also sets its subject scale. */
export function applyRingScaleOnPreUpdateActor(
    actor: { prototypeToken?: { ring?: RingSubjectLike | null } | null },
    changes: { prototypeToken?: { ring?: RingChange | null } | null },
): boolean {
    const ring = changes.prototypeToken?.ring;
    const scale = ringScaleForUpdate(actor.prototypeToken?.ring, ring);
    if (scale === null || ring == null) return false;
    ring.subject = { ...(ring.subject ?? {}), scale };
    return true;
}

/** An actor the ready-time pass can read and update. */
export interface RingScaleActor {
    prototypeToken?: { ring?: RingSubjectLike | null } | null;
    update: (changes: object) => Promise<object | undefined>;
}

/** A scene the ready-time pass can read and update. */
export interface RingScaleScene {
    tokens: Iterable<{ id: string | null; ring?: RingSubjectLike | null }>;
    updateEmbeddedDocuments: (type: 'Token', updates: object[]) => Promise<object[]>;
}

/**
 * Ready-time pass (world writer only): give every ringed prototype token and
 * placed token still at the default scale {@link RING_SUBJECT_SCALE}. One update
 * per actor and one batch per scene; returns how many documents it changed.
 */
export async function normalizeRingSubjectScales(actors: Iterable<RingScaleActor>, scenes: Iterable<RingScaleScene>): Promise<number> {
    const actorWrites = [...actors]
        .filter((actor) => needsRingSubjectScale(actor.prototypeToken?.ring))
        .map(async (actor) => actor.update({ 'prototypeToken.ring.subject.scale': RING_SUBJECT_SCALE }));
    const sceneWrites = [...scenes].flatMap((scene) => {
        const updates = [...scene.tokens]
            .filter((token): token is typeof token & { id: string } => token.id !== null && needsRingSubjectScale(token.ring))
            .map((token) => ({ '_id': token.id, 'ring.subject.scale': RING_SUBJECT_SCALE }));
        return updates.length === 0 ? [] : [{ count: updates.length, write: scene.updateEmbeddedDocuments('Token', updates) }];
    });
    await Promise.all([...actorWrites, ...sceneWrites.map(async (entry) => entry.write)]);
    return actorWrites.length + sceneWrites.reduce((sum, entry) => sum + entry.count, 0);
}
