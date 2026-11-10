import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allDefaultSoundFiles, defaultCueSounds, defaultStatusSounds, pickDefaultSound } from './cue-default-sounds.ts';

const SOUNDS_ROOT = resolve(__dirname, '../../packs/sounds');
const PREFIX = 'systems/wh40k-rpg/packs/sounds/';

describe('defaultCueSounds', () => {
    it('gives a ranged preset its own shot and hit sounds', () => {
        expect(defaultCueSounds('las', 'ranged', 'fire')[0]).toBe(`${PREFIX}kenney-sci-fi/laserSmall_000.ogg`);
        expect(defaultCueSounds('bolt', 'ranged', 'hit')).toHaveLength(2);
    });

    it('fires a melee-looking preset on a ranged weapon as tracer', () => {
        expect(defaultCueSounds('blade', 'ranged', 'fire')).toEqual(defaultCueSounds('tracer', 'ranged', 'fire'));
    });

    it('swings a melee weapon with its preset hit, else as a blade', () => {
        expect(defaultCueSounds('chain', 'melee', 'melee-hit')[0]).toBe(`${PREFIX}rubberduck-loops/saw.ogg`);
        expect(defaultCueSounds('bolt', 'melee', 'melee-hit')).toEqual(defaultCueSounds('blade', 'melee', 'melee-hit'));
        expect(defaultCueSounds('blade', 'melee', 'fire')).toEqual([]);
    });

    it('manifests a power with its preset, else as warp', () => {
        expect(defaultCueSounds('flame', 'psychic', 'manifest')).toEqual(defaultCueSounds('warp', 'psychic', 'manifest'));
        expect(defaultCueSounds('las', 'psychic', 'fire')).toEqual(defaultCueSounds('warp', 'psychic', 'fire'));
        expect(defaultCueSounds('warp', 'psychic', 'perils')).toHaveLength(2);
    });
});

describe('defaultStatusSounds', () => {
    it('plays a condition preset, else its filter, else nothing', () => {
        expect(defaultStatusSounds('prone', '', 'apply')).toEqual([`${PREFIX}kenney-rpg/dropLeather.ogg`]);
        expect(defaultStatusSounds('', 'desaturate', 'apply')).toEqual([`${PREFIX}kenney-impact/impactSoft_heavy_000.ogg`]);
        expect(defaultStatusSounds('', '', 'apply')).toEqual([]);
    });
});

describe('the default table', () => {
    it('names only files the system ships', () => {
        const missing = [...allDefaultSoundFiles()].filter((src) => !existsSync(resolve(SOUNDS_ROOT, src.slice(PREFIX.length))));
        expect(missing).toEqual([]);
    });

    it('picks within the list, and nothing from an empty one', () => {
        expect(pickDefaultSound(['a', 'b'], () => 0.99)).toBe('b');
        expect(pickDefaultSound([], () => 0)).toBe('');
    });
});
