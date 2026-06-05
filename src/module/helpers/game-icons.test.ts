import { describe, expect, it } from 'vitest';
import { GAME_ICONS_CDN, getColoredIconUrl, getDefaultIcon, getIconUrl } from './game-icons.ts';

/**
 * Coverage for the pure game-icons URL builders (previously untested).
 * preloadCommonIcons is DOM/Image-side-effecting and excluded.
 */

describe('getIconUrl', () => {
    it('passes an http(s) URL through unchanged', () => {
        expect(getIconUrl('http://example.com/x.svg')).toBe('http://example.com/x.svg');
    });

    it('prefixes a bare svg/ path with the CDN', () => {
        expect(getIconUrl('svg/lorc/x.svg')).toBe(`${GAME_ICONS_CDN}/svg/lorc/x.svg`);
    });

    it('expands the "author/name" short form to the originals path', () => {
        expect(getIconUrl('lorc/sword')).toBe(`${GAME_ICONS_CDN}/svg/lorc/originals/sword.svg`);
    });

    it('falls back to a single-segment .svg path', () => {
        expect(getIconUrl('plainname')).toBe(`${GAME_ICONS_CDN}/svg/plainname.svg`);
    });
});

describe('getColoredIconUrl', () => {
    it('uses the game-icons colour service for the short form', () => {
        expect(getColoredIconUrl('lorc/sword', 'ff0000')).toBe('https://game-icons.net/icons/000000/ff0000/lorc/sword.svg');
        expect(getColoredIconUrl('lorc/sword', 'ff0000', 'ffffff')).toBe('https://game-icons.net/icons/ffffff/ff0000/lorc/sword.svg');
    });

    it('falls back to getIconUrl for a non-short-form path', () => {
        expect(getColoredIconUrl('plainname')).toBe(`${GAME_ICONS_CDN}/svg/plainname.svg`);
    });
});

describe('getDefaultIcon', () => {
    it('maps a known item/actor type to its default icon URL', () => {
        expect(getDefaultIcon('weapon')).toBe(`${GAME_ICONS_CDN}/svg/lorc/originals/crossed-swords.svg`);
        expect(getDefaultIcon('character')).toBe(`${GAME_ICONS_CDN}/svg/lorc/originals/cowled.svg`);
    });

    it('falls back to the dice icon for an unknown type', () => {
        expect(getDefaultIcon('mystery')).toBe(`${GAME_ICONS_CDN}/svg/lorc/originals/perspective-dice-six.svg`);
    });
});
