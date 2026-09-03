/**
 * Unit guard for the image-coverage validator (src/packs/validate-images.cjs),
 * the classifier behind the `images:ratchet` coverage ratchet across all entity
 * types. Two pure functions carry the logic: `hasRealArt` (curated art vs a
 * replaceable default) and `imageClassOf` (the Foundry document class a document
 * is bucketed under). Both are exactly the kind of pure classifier that must be
 * tested per the repo's testing standard.
 */

import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-syntax -- boundary: pack _source docs are open authored JSON
import { hasRealArt, imageClassOf } from '../src/packs/validate-images.cjs';

describe('hasRealArt', () => {
    it('counts curated …/images/** assets and https hotlinks as real art', () => {
        expect(hasRealArt('systems/wh40k-rpg/packs/images/items/bc/legion-bolter.webp')).toBe(true);
        expect(hasRealArt('systems/wh40k-rpg/images/bestiary/dh1/ambull.webp')).toBe(true);
        expect(hasRealArt('src/images/items/dh2/webber.webp')).toBe(true);
        expect(hasRealArt('https://static.wikia.nocookie.net/warhammer40k/images/4/4f/Webber.jpg')).toBe(true);
        expect(hasRealArt('http://example.test/art.png')).toBe(true);
    });

    it('treats Foundry core icons, vendored-ui icons and the svg defaults as NOT real art', () => {
        for (const img of [
            'icons/svg/mystery-man.svg',
            'icons/svg/item-bag.svg',
            'icons/svg/d20.svg',
            'icons/weapons/guns/pistol-flintlock.webp',
            'icons/magic/light/orbs-smoke-pink.webp',
            'systems/wh40k-rpg/icons/whatever.svg',
            'systems/wh40k-rpg/packs/_vendored-ui/icons/items/grenade/grenade_07.png',
        ]) {
            expect(hasRealArt(img)).toBe(false);
        }
    });

    it('treats a missing / empty img as not covered', () => {
        expect(hasRealArt(undefined)).toBe(false);
        expect(hasRealArt('')).toBe(false);
        expect(hasRealArt('   ')).toBe(false);
        expect(hasRealArt(null)).toBe(false);
    });
});

describe('imageClassOf', () => {
    it('buckets each Foundry document class from its shape', () => {
        expect(imageClassOf({ results: [] })).toBe('RollTable');
        expect(imageClassOf({ pages: [] })).toBe('JournalEntry');
        expect(imageClassOf({ scenes: [] })).toBe('Adventure');
        expect(imageClassOf({ type: 'npc' })).toBe('Actor');
        expect(imageClassOf({ type: 'dh1-npc' })).toBe('Actor');
        expect(imageClassOf({ type: 'dh2-character' })).toBe('Actor');
        expect(imageClassOf({ type: 'rt-starship' })).toBe('Actor');
        expect(imageClassOf({ type: 'dh2-terracraft' })).toBe('Actor');
        expect(imageClassOf({ type: 'weapon' })).toBe('Item');
        expect(imageClassOf({ type: 'talent' })).toBe('Item');
        expect(imageClassOf({ type: 'originPath' })).toBe('Item');
    });

    it('does not mistake a weapon for an Actor via the -npc-like suffix rule', () => {
        // ACTOR_TYPE_RE must match only whole trailing segments, not substrings.
        expect(imageClassOf({ type: 'weapon' })).toBe('Item');
        expect(imageClassOf({ type: 'armour' })).toBe('Item');
    });

    it('falls back to Other for a typeless, collection-less document', () => {
        expect(imageClassOf({})).toBe('Other');
        expect(imageClassOf(null)).toBe('Other');
    });
});
