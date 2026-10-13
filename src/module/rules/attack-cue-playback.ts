/**
 * @file How this client plays an attack cue (#594): which renderer draws it, and
 * whether and how loud its sound plays.
 *
 * Fallback order for the visual: a Sequencer (module id `sequencer`) when it is active
 * and the cue has an authored animation file; otherwise the system's own procedural
 * canvas effect; otherwise nothing (no canvas, animations off, or reduced motion). A
 * Sequencer is never used for a procedural preset: it plays files, and the presets
 * are drawn by the system.
 *
 * Pure: the caller reads settings, the module registry and the media query.
 */

/** The renderer a cue's visual plays through on this client. */
export type CueRenderer = 'sequencer' | 'canvas' | 'none';

/** What decides a cue's renderer on this client. */
export interface CueRendererContext {
    /** The world allows attack cues (GM switch). */
    worldEnabled: boolean;
    /** This user wants attack animations. */
    animationsEnabled: boolean;
    /** The user's system asks for reduced motion. */
    reducedMotion: boolean;
    /** A canvas is drawn and shows the scene the attack was rolled on. */
    canvasReady: boolean;
    /** The Sequencer module is installed and active. */
    sequencerActive: boolean;
    /** The cue authored an animation file. */
    hasAnimation: boolean;
}

/** Pick the renderer for one cue's visual. */
export function selectCueRenderer(context: CueRendererContext): CueRenderer {
    if (!context.worldEnabled || !context.animationsEnabled || context.reducedMotion || !context.canvasReady) return 'none';
    if (context.sequencerActive && context.hasAnimation) return 'sequencer';
    return 'canvas';
}

/** What decides whether a cue's sound plays on this client. */
export interface CueSoundContext {
    worldEnabled: boolean;
    soundsEnabled: boolean;
    /** The user's attack-cue volume, 0–1. */
    volume: number;
    /** The cue's sound file, or '' when none is authored. */
    src: string;
}

/** The volume to play a cue's sound at, or null when it plays nothing. */
export function cueSoundVolume(context: CueSoundContext): number | null {
    if (!context.worldEnabled || !context.soundsEnabled || context.src === '') return null;
    const volume = clampCueVolume(context.volume);
    return volume > 0 ? volume : null;
}

/** A stored volume clamped to 0–1; a non-number reads as silent. */
export function clampCueVolume(volume: number): number {
    if (!Number.isFinite(volume)) return 0;
    return Math.min(1, Math.max(0, volume));
}
