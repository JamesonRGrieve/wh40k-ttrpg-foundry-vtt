/**
 * @file The flag a grenade's throw card carries for its rider (#623): the thrower, the
 * grenade and the area the dialog placed, so the card's Resolve Rider finds them again
 * (even after a reload). A leaf: the dialog writes it and the chat action reads it,
 * without either importing the other.
 */

import type { AreaTemplateRef } from '../canvas/area-template-canvas.ts';

/** The throw card's flag key, under the system scope. */
export const GRENADE_RIDER_FLAG = 'grenadeRider';

/** Where a thrown grenade's rider resolves: the thrower, the grenade, and its placed area. */
export interface RiderThrowFlag extends AreaTemplateRef {
    actorUuid: string;
    itemId: string;
}

/** The system-scoped flags a throw card carries for its rider. */
export function riderThrowFlags(flag: RiderThrowFlag): Record<string, RiderThrowFlag> {
    return { [GRENADE_RIDER_FLAG]: flag };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ChatMessage flags are an untyped JSON bag; narrowed field by field below
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** Read a throw card's rider flag, or null when the card carries none (or a malformed one). */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ChatMessage.getFlag returns the stored JSON untyped; this guard narrows it
export function readRiderThrowFlag(value: unknown): RiderThrowFlag | null {
    if (!isRecord(value)) return null;
    const { actorUuid, itemId, sceneId, templateId } = value;
    if (typeof actorUuid !== 'string' || typeof itemId !== 'string' || typeof sceneId !== 'string' || typeof templateId !== 'string') return null;
    return { actorUuid, itemId, sceneId, templateId };
}
