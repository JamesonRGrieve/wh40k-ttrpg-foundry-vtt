/**
 * @file Weapon attack sounds — content-driven audio played when a weapon attacks.
 *
 * Sound file paths are authored on the compendium weapon (`system.sounds`,
 * Direction #7 — content lives in the pack, not in `src/`). When more than one is
 * authored, one is chosen at random per attack. The chosen sound is repeated once
 * per shot, so a single shot plays it once, a semi-auto burst plays it several
 * times, and full-auto plays it in rapid succession.
 *
 * Split pure/impure so the selection logic is unit-testable without a world:
 * `planWeaponAttackSounds` decides WHICH sound and HOW MANY times (seedable RNG);
 * `playWeaponAttackSounds` performs the scheduled Foundry audio playback.
 */

/** At or above this shot count the gap tightens into full-auto "rapid succession". */
const AUTO_FIRE_THRESHOLD = 5;
/** Gap between full-auto shots (ms). */
const AUTO_STAGGER_MS = 80;
/** Gap between semi-auto / burst shots (ms). */
const BURST_STAGGER_MS = 150;
/** Hard clamp so a malformed `fireRate` can never spam the audio channel. */
const MAX_PLAYS = 24;
/** Attack-sound playback volume (0..1). */
const ATTACK_SOUND_VOLUME = 0.8;

/** A resolved decision about which attack sound to play and how. */
export interface WeaponSoundPlan {
    /** The chosen sound file path. */
    src: string;
    /** How many times to play it — one per shot fired. */
    times: number;
    /** Delay between successive plays (ms). */
    staggerMs: number;
}

/**
 * Decide which authored sound to play, and how many times, for one attack.
 *
 * Pure: the RNG is injected so the pick is deterministic under test. Returns
 * `null` when the weapon authored no usable sound (the common case), so the
 * caller plays nothing.
 * @param {readonly string[] | undefined} sounds  Authored sound file paths.
 * @param {number} fireRate  Shots fired by the selected mode (1 = single shot).
 * @param {() => number} [rng]  Uniform [0,1) source; defaults to `Math.random`.
 * @returns {WeaponSoundPlan | null}  The plan, or null when there is nothing to play.
 */
export function planWeaponAttackSounds(sounds: readonly string[] | undefined, fireRate: number, rng: () => number = Math.random): WeaponSoundPlan | null {
    const usable = (sounds ?? []).filter((s) => s.length > 0);
    if (usable.length === 0) return null;

    const index = Math.min(usable.length - 1, Math.max(0, Math.floor(rng() * usable.length)));
    const src = usable[index];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.strict.json types the indexed access as `string | undefined` and needs this guard; the ESLint program (flag off) sees `string`.
    if (src === undefined) return null;

    const shots = Number.isFinite(fireRate) ? Math.trunc(fireRate) : 1;
    const times = Math.max(1, Math.min(MAX_PLAYS, shots));
    const staggerMs = times >= AUTO_FIRE_THRESHOLD ? AUTO_STAGGER_MS : BURST_STAGGER_MS;
    return { src, times, staggerMs };
}

/**
 * Perform a sound plan: play the chosen sound `times` times, staggered, and
 * broadcast to every client (socket = true) so the whole table hears the attack.
 * @param {WeaponSoundPlan | null} plan  The plan from {@link planWeaponAttackSounds}, or null.
 */
export function playWeaponAttackSounds(plan: WeaponSoundPlan | null): void {
    if (plan === null) return;
    const play = (): void => {
        void foundry.audio.AudioHelper.play({ src: plan.src, volume: ATTACK_SOUND_VOLUME, loop: false }, true);
    };
    play();
    for (let shot = 1; shot < plan.times; shot++) {
        setTimeout(play, shot * plan.staggerMs);
    }
}

/** The slice of a weapon roll this module reads. `system` is the item's open-ended
 *  Foundry payload (index-signature boundary); `sounds` is read from it and guarded. */
export interface WeaponAttackRollLike {
    // eslint-disable-next-line no-restricted-syntax -- boundary: `item.system` is Foundry's open-ended DataModel payload; the `sounds` value read from it is validated by readSoundList
    readonly weapon?: { readonly system?: Readonly<Record<string, unknown>> | undefined } | null | undefined;
    /** Shots fired by the selected mode; 1 when absent. */
    readonly fireRate?: number | undefined;
    /** A target-only post (no dice rolled, no shot fired) plays no sound. */
    readonly isTargetOnly?: boolean | undefined;
}

/**
 * Play a weapon attack's authored sound(s) from its resolved roll — the single
 * hook the central attack path calls. A non-weapon roll (skill / characteristic)
 * carries no `weapon`, so this is a no-op there.
 * @param {WeaponAttackRollLike} rollData  The resolved roll data.
 * @param {() => number} [rng]  Uniform [0,1) source; defaults to `Math.random`.
 */
export function playWeaponAttackSoundsForRoll(rollData: WeaponAttackRollLike, rng: () => number = Math.random): void {
    if (rollData.isTargetOnly === true) return;
    const sounds = readSoundList(rollData.weapon?.system?.['sounds']);
    playWeaponAttackSounds(planWeaponAttackSounds(sounds, rollData.fireRate ?? 1, rng));
}

/**
 * Coerce the weapon's authored `sounds` payload to a clean string list.
 * @param {unknown} value  The raw `system.sounds` value from the item's untyped payload.
 * @returns {string[]}  Non-empty string paths only.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: reads the untyped Foundry `item.system` payload; the value is validated by the Array.isArray + string guard here
function readSoundList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && s.length > 0) : [];
}
