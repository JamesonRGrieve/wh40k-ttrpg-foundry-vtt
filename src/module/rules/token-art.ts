import { SYSTEM_ID } from '../constants.ts';

/**
 * How a token draws its actor's art: `bust` is the circular bust the system
 * crops from the portrait at draw time (`canvas/token-mask.ts`); `full` is the
 * whole image, uncropped.
 *
 * Stored as `flags.wh40k-rpg.tokenArt` on a token document or on an actor's
 * prototype token. A missing flag reads as `bust`, so every existing token keeps
 * the look it has today.
 */
export type TokenArtMode = 'bust' | 'full';

/** The flag key under the system scope. */
export const TOKEN_ART_FLAG = 'tokenArt';

/** A stored flag value as Foundry's `getFlag` hands it back. */
type ArtFlagValue = string | object | boolean | null | undefined;

/** The flag readers {@link resolveTokenArtMode} needs: a placed token's own document plus its actor's prototype token. */
export interface ArtFlagSource {
    document: { getFlag: (scope: string, key: string) => ArtFlagValue };
    actor?: { prototypeToken?: { getFlag?: (scope: string, key: string) => ArtFlagValue } | null } | null;
}

/** Read a stored flag value as a mode: only the literal `'full'` is whole art. */
export function parseTokenArtMode(raw: ArtFlagValue): TokenArtMode {
    return raw === 'full' ? 'full' : 'bust';
}

/**
 * The art mode of a placed token. Its own document flag wins (a token can be
 * switched on its own from its synthetic actor's sheet); a token with no flag
 * of its own follows its actor's prototype token, the same fallback the bust
 * frame uses.
 */
export function resolveTokenArtMode(token: ArtFlagSource): TokenArtMode {
    const own = token.document.getFlag(SYSTEM_ID, TOKEN_ART_FLAG);
    if (own !== undefined && own !== null) return parseTokenArtMode(own);
    return parseTokenArtMode(token.actor?.prototypeToken?.getFlag?.(SYSTEM_ID, TOKEN_ART_FLAG));
}

/** The other mode: what the portrait toggle switches to. */
export function nextTokenArtMode(mode: TokenArtMode): TokenArtMode {
    return mode === 'full' ? 'bust' : 'full';
}

/** A placed token as {@link tokenArtWrites} reads it: its ids, whether this user owns it, and its own art flag. */
export interface PlacedTokenLike {
    id: string | null;
    actorId: string | null;
    isOwner: boolean;
    art: ArtFlagValue;
}

/** One scene's token update that sets the art flag. */
export interface TokenArtWrite {
    _id: string;
    flags: { [SYSTEM_ID]: { [TOKEN_ART_FLAG]: TokenArtMode } };
}

/**
 * The token updates that switch every placed token of an actor to `mode`.
 * Foundry copies the prototype's flags onto a token when it is placed, so a
 * token placed after an earlier switch carries its own copy and would not
 * follow the prototype: the switch writes each one. Tokens of other actors,
 * tokens already in that mode and tokens this user may not update are skipped.
 */
export function tokenArtWrites(tokens: Iterable<PlacedTokenLike>, actorId: string, mode: TokenArtMode): TokenArtWrite[] {
    const writes: TokenArtWrite[] = [];
    for (const token of tokens) {
        if (token.id === null || token.actorId !== actorId || !token.isOwner) continue;
        if (token.art !== undefined && token.art !== null && parseTokenArtMode(token.art) === mode) continue;
        writes.push({ _id: token.id, flags: { [SYSTEM_ID]: { [TOKEN_ART_FLAG]: mode } } });
    }
    return writes;
}

/** The `flags` slice of a token or prototype-token change, as an update hook hands it over. */
interface FlagsChange {
    flags?: { [scope: string]: { [key: string]: ArtFlagValue } | null | undefined } | null;
}

/**
 * Does this token-document change touch the art flag? Foundry redraws a token
 * only for texture / ring / actor changes, never for a flag, so the
 * `updateToken` hook redraws on this.
 */
export function tokenArtChanged(changed: FlagsChange): boolean {
    const scope = changed.flags?.[SYSTEM_ID];
    if (scope === undefined || scope === null) return false;
    return TOKEN_ART_FLAG in scope || `-=${TOKEN_ART_FLAG}` in scope;
}

/** Does this actor change touch its prototype token's art flag? Tokens that follow the prototype redraw on it. */
export function prototypeTokenArtChanged(changed: { prototypeToken?: FlagsChange | null }): boolean {
    const proto = changed.prototypeToken;
    return proto !== undefined && proto !== null && tokenArtChanged(proto);
}
