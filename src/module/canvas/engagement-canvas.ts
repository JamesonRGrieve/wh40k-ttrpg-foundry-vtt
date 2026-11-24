/**
 * @file Melee engagement on the live scene (#804).
 *
 * Reads the scene's tokens into the pure `rules/engagement.ts` shape: grid origin,
 * footprint, disposition, whether the token is defenceless (Stunned, Helpless,
 * Unconscious), and its actor's outnumbering talents. The attack dialog, the
 * movement hooks and the combat tracker all read engagement through here.
 */
import { meleeEngagementRulesFor } from '../config/game-systems/index.ts';
import {
    type EngagementToken,
    engagedFoes,
    isDefenceless,
    type MeleeEngagementRules,
    type OutnumberingItemLike,
    outnumberingTraitsOf,
} from '../rules/engagement.ts';

/** A scene token document, as engagement reads it. */
export interface EngagementTokenDoc {
    readonly id: string | null;
    readonly name?: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly disposition: number;
    readonly hidden?: boolean;
    readonly actor?: {
        readonly statuses?: Iterable<string>;
        readonly items?: Iterable<OutnumberingItemLike>;
        readonly system?: { readonly gameSystem?: string };
    } | null;
}

/** One token document as engagement reads it, or null without an id. */
function engagementToken(doc: EngagementTokenDoc, at: { x?: number; y?: number } = {}): EngagementToken | null {
    if (doc.id === null) return null;
    const actor = doc.actor ?? null;
    return {
        id: doc.id,
        x: at.x ?? doc.x,
        y: at.y ?? doc.y,
        width: doc.width,
        height: doc.height,
        disposition: doc.disposition,
        defenceless: actor?.statuses !== undefined ? isDefenceless(actor.statuses) : false,
        outnumbering: actor?.items !== undefined ? outnumberingTraitsOf(actor.items) : { denies: false, bonus: 0, sharedBonus: 0 },
    };
}

/** The viewed scene's visible token documents. Hidden tokens aren't in the fight. */
function sceneTokenDocs(): EngagementTokenDoc[] {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's canvas.scene.tokens collection; TokenDocument is read through the structural EngagementTokenDoc
    const docs = (canvas.scene?.tokens.contents ?? []) as unknown as EngagementTokenDoc[];
    return docs.filter((doc) => doc.hidden !== true);
}

/** Every visible token on the viewed scene as engagement reads it. */
export function sceneEngagementTokens(): EngagementToken[] {
    return sceneTokenDocs().flatMap((doc) => engagementToken(doc) ?? []);
}

/** The viewed scene's grid size in pixels (0 without a scene). */
export function sceneGridSize(): number {
    return canvas.scene?.grid.size ?? 0;
}

/** The engagement rules of the line a token's actor plays, or of the world's default line. */
export function engagementRulesFor(doc: Pick<EngagementTokenDoc, 'actor'> | null): MeleeEngagementRules | null {
    return meleeEngagementRulesFor(doc?.actor?.system?.gameSystem);
}

/** The names of the foes a scene token is engaged with (#804). */
export function engagedFoeNames(tokenId: string): string[] {
    const docs = sceneTokenDocs();
    const tokens = docs.flatMap((doc) => engagementToken(doc) ?? []);
    const token = tokens.find((t) => t.id === tokenId);
    if (token === undefined) return [];
    const ids = new Set(engagedFoes(token, tokens, sceneGridSize()).map((t) => t.id));
    return docs.filter((doc) => doc.id !== null && ids.has(doc.id)).map((doc) => doc.name ?? '');
}
