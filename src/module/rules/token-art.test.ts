import { describe, expect, it } from 'vitest';
import { SYSTEM_ID } from '../constants.ts';
import {
    type ArtFlagSource,
    nextTokenArtMode,
    parseTokenArtMode,
    type PlacedTokenLike,
    prototypeTokenArtChanged,
    resolveTokenArtMode,
    TOKEN_ART_FLAG,
    tokenArtChanged,
    tokenArtWrites,
} from './token-art.ts';

type Flag = string | object | boolean | null | undefined;

/** A flag reader holding one value for the art flag (and nothing else). */
function flags(art: Flag): (scope: string, key: string) => Flag {
    return (scope, key) => (scope === SYSTEM_ID && key === TOKEN_ART_FLAG ? art : undefined);
}

function source(own: Flag, prototype: Flag): ArtFlagSource {
    return { document: { getFlag: flags(own) }, actor: { prototypeToken: { getFlag: flags(prototype) } } };
}

describe('parseTokenArtMode', () => {
    it('reads only the literal "full" as whole art', () => {
        expect(parseTokenArtMode('full')).toBe('full');
        for (const raw of ['bust', undefined, null, '', 'FULL', true, {}]) expect(parseTokenArtMode(raw)).toBe('bust');
    });
});

describe('resolveTokenArtMode', () => {
    it('defaults to the circular bust when neither the token nor the prototype has the flag', () => {
        expect(resolveTokenArtMode(source(undefined, undefined))).toBe('bust');
        expect(resolveTokenArtMode({ document: { getFlag: flags(undefined) } })).toBe('bust');
    });

    it('follows the prototype token when the token has no flag of its own', () => {
        expect(resolveTokenArtMode(source(undefined, 'full'))).toBe('full');
        expect(resolveTokenArtMode(source(null, 'full'))).toBe('full');
    });

    it("lets the token's own flag win over the prototype's, both ways", () => {
        expect(resolveTokenArtMode(source('bust', 'full'))).toBe('bust');
        expect(resolveTokenArtMode(source('full', 'bust'))).toBe('full');
    });
});

describe('nextTokenArtMode', () => {
    it('flips between the two modes', () => {
        expect(nextTokenArtMode('bust')).toBe('full');
        expect(nextTokenArtMode('full')).toBe('bust');
    });
});

describe('tokenArtWrites', () => {
    const token = (id: string | null, actorId: string | null, art: Flag, isOwner = true): PlacedTokenLike => ({ id, actorId, isOwner, art });

    it('writes every owned placed token of the actor that is not already in the mode', () => {
        const tokens = [token('t1', 'a1', undefined), token('t2', 'a1', 'bust'), token('t3', 'a1', 'full')];
        expect(tokenArtWrites(tokens, 'a1', 'full')).toEqual([
            { _id: 't1', flags: { [SYSTEM_ID]: { [TOKEN_ART_FLAG]: 'full' } } },
            { _id: 't2', flags: { [SYSTEM_ID]: { [TOKEN_ART_FLAG]: 'full' } } },
        ]);
    });

    it('writes a token with no flag of its own back to the bust, so a full-art prototype cannot leak through', () => {
        expect(tokenArtWrites([token('t1', 'a1', undefined)], 'a1', 'bust')).toEqual([{ _id: 't1', flags: { [SYSTEM_ID]: { [TOKEN_ART_FLAG]: 'bust' } } }]);
    });

    it("skips other actors' tokens, tokens this user may not update and tokens without an id", () => {
        const tokens = [token('t1', 'a2', undefined), token('t2', 'a1', undefined, false), token(null, 'a1', undefined)];
        expect(tokenArtWrites(tokens, 'a1', 'full')).toEqual([]);
    });
});

describe('tokenArtChanged / prototypeTokenArtChanged', () => {
    it('sees a set or an unset of the art flag', () => {
        expect(tokenArtChanged({ flags: { [SYSTEM_ID]: { tokenArt: 'full' } } })).toBe(true);
        expect(tokenArtChanged({ flags: { [SYSTEM_ID]: { '-=tokenArt': null } } })).toBe(true);
    });

    it('ignores other flags, other scopes and changes without flags', () => {
        expect(tokenArtChanged({ flags: { [SYSTEM_ID]: { tokenFrame: { cx: 0.5 } } } })).toBe(false);
        expect(tokenArtChanged({ flags: { core: { tokenArt: 'full' } } })).toBe(false);
        expect(tokenArtChanged({ flags: null })).toBe(false);
        expect(tokenArtChanged({})).toBe(false);
    });

    it('reads the prototype token slice of an actor change', () => {
        expect(prototypeTokenArtChanged({ prototypeToken: { flags: { [SYSTEM_ID]: { tokenArt: 'bust' } } } })).toBe(true);
        expect(prototypeTokenArtChanged({ prototypeToken: { flags: { [SYSTEM_ID]: { tokenFrame: {} } } } })).toBe(false);
        expect(prototypeTokenArtChanged({ prototypeToken: null })).toBe(false);
        expect(prototypeTokenArtChanged({})).toBe(false);
    });
});
