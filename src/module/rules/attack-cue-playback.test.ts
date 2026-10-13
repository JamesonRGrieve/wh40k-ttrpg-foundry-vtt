import { describe, expect, it } from 'vitest';
import { type CueRendererContext, clampCueVolume, cueSoundVolume, selectCueRenderer } from './attack-cue-playback.ts';

/** Which renderer plays an attack cue, and how loud (#594). */

function context(overrides: Partial<CueRendererContext> = {}): CueRendererContext {
    return {
        worldEnabled: true,
        animationsEnabled: true,
        reducedMotion: false,
        canvasReady: true,
        sequencerActive: false,
        hasAnimation: false,
        ...overrides,
    };
}

describe('selectCueRenderer', () => {
    it('uses a Sequencer only when it is active and the cue has an animation file', () => {
        expect(selectCueRenderer(context({ sequencerActive: true, hasAnimation: true }))).toBe('sequencer');
        expect(selectCueRenderer(context({ sequencerActive: true, hasAnimation: false }))).toBe('canvas');
        expect(selectCueRenderer(context({ sequencerActive: false, hasAnimation: true }))).toBe('canvas');
    });

    it('draws nothing with cues off for the world or the user, under reduced motion, or without a canvas', () => {
        for (const off of [{ worldEnabled: false }, { animationsEnabled: false }, { reducedMotion: true }, { canvasReady: false }]) {
            expect(selectCueRenderer(context({ sequencerActive: true, hasAnimation: true, ...off }))).toBe('none');
        }
    });
});

describe('cueSoundVolume', () => {
    const sound = { worldEnabled: true, soundsEnabled: true, volume: 0.5, src: 'bang.ogg' };

    it('plays an authored sound at the user volume', () => {
        expect(cueSoundVolume(sound)).toBe(0.5);
    });

    it('plays nothing without a file, with sounds off, or at zero volume', () => {
        expect(cueSoundVolume({ ...sound, src: '' })).toBeNull();
        expect(cueSoundVolume({ ...sound, soundsEnabled: false })).toBeNull();
        expect(cueSoundVolume({ ...sound, worldEnabled: false })).toBeNull();
        expect(cueSoundVolume({ ...sound, volume: 0 })).toBeNull();
    });

    it('clamps the stored volume to 0–1', () => {
        expect(clampCueVolume(3)).toBe(1);
        expect(clampCueVolume(-1)).toBe(0);
        expect(clampCueVolume(Number.NaN)).toBe(0);
    });
});
