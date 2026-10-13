import { describe, expect, it } from 'vitest';
import { type CueAssetOf, cueAssetSources, pickCueAsset, readCueAssets, readHexTint, tintColour } from './cue-common.ts';

/** The pieces attack cues (#594) and status visuals (#595) share. */

type Event = 'fire' | 'hit' | 'miss';
const isEvent = (value: string): value is Event => value === 'fire' || value === 'hit' || value === 'miss';

describe('readHexTint / tintColour', () => {
    it('keeps a #rrggbb tint, lower-cased, and drops anything else', () => {
        expect(readHexTint('#FF8800')).toBe('#ff8800');
        expect(readHexTint('red')).toBe('');
        expect(readHexTint('#fff')).toBe('');
        expect(readHexTint(undefined)).toBe('');
    });

    it('turns a tint into a PIXI colour, or falls back when there is none', () => {
        expect(tintColour('#ff8800', 0x123456)).toBe(0xff8800);
        expect(tintColour('', 0x123456)).toBe(0x123456);
    });
});

describe('readCueAssets / cueAssetSources', () => {
    it('drops entries with an unknown event or no file, and trims the file', () => {
        expect(
            readCueAssets([{ event: 'fire', src: ' a.ogg ' }, { event: 'reload', src: 'b.ogg' }, { event: 'hit', src: '  ' }, { src: 'c.ogg' }], isEvent),
        ).toEqual([{ event: 'fire', src: 'a.ogg' }]);
        expect(readCueAssets(undefined, isEvent)).toEqual([]);
    });

    it('reads an untyped payload, keeping only string fields of object entries', () => {
        expect(cueAssetSources([{ event: 'fire', src: 'a.ogg' }, 'b.ogg', null, { event: 3, src: 'c.ogg' }])).toEqual([
            { event: 'fire', src: 'a.ogg' },
            { src: 'c.ogg' },
        ]);
        expect(cueAssetSources('a.ogg')).toEqual([]);
        expect(cueAssetSources(null)).toEqual([]);
    });
});

describe('pickCueAsset', () => {
    it('picks among several files for one event with the injected RNG', () => {
        const sounds: CueAssetOf<Event>[] = [
            { event: 'fire', src: 'a.ogg' },
            { event: 'hit', src: 'x.ogg' },
            { event: 'fire', src: 'b.ogg' },
        ];
        expect(pickCueAsset(sounds, 'fire', () => 0)).toBe('a.ogg');
        expect(pickCueAsset(sounds, 'fire', () => 0.99)).toBe('b.ogg');
        expect(pickCueAsset(sounds, 'miss', () => 0)).toBe('');
    });
});
