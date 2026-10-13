/**
 * @file The client-side media plumbing every canvas cue shares: attack cues (#594) and
 * status-effect visuals (#595) both honour the user's reduced-motion preference and
 * play their one-shot sounds locally through Foundry's AudioHelper.
 */

/** Does this user's system ask for reduced motion? */
export function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Play a sound on this client only, at `volume`; a null volume plays nothing. */
export function playCueSound(src: string, volume: number | null): void {
    if (volume === null) return;
    void foundry.audio.AudioHelper.play({ src, volume, loop: false }, false);
}
