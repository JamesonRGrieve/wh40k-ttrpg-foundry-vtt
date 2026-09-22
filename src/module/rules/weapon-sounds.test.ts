import { afterEach, describe, expect, it, vi } from 'vitest';
import { planWeaponAttackSounds, playWeaponAttackSounds, playWeaponAttackSoundsForRoll } from './weapon-sounds.ts';

describe('planWeaponAttackSounds', () => {
    it('returns null when no usable sound is authored', () => {
        expect(planWeaponAttackSounds(undefined, 1)).toBeNull();
        expect(planWeaponAttackSounds([], 3)).toBeNull();
        expect(planWeaponAttackSounds(['', ''], 3)).toBeNull();
    });

    it('plays a single shot once', () => {
        const plan = planWeaponAttackSounds(['bolt.ogg'], 1);
        expect(plan).toEqual({ src: 'bolt.ogg', times: 1, staggerMs: 150 });
    });

    it('repeats once per shot for a semi-auto burst, spaced', () => {
        const plan = planWeaponAttackSounds(['bolt.ogg'], 3);
        expect(plan?.times).toBe(3);
        expect(plan?.staggerMs).toBe(150);
    });

    it('tightens the gap into rapid succession for full-auto', () => {
        const plan = planWeaponAttackSounds(['bolt.ogg'], 8);
        expect(plan?.times).toBe(8);
        expect(plan?.staggerMs).toBe(80);
    });

    it('clamps a malformed fireRate so it cannot spam the audio channel', () => {
        expect(planWeaponAttackSounds(['x.ogg'], 9999)?.times).toBe(24);
        expect(planWeaponAttackSounds(['x.ogg'], Number.NaN)?.times).toBe(1);
        expect(planWeaponAttackSounds(['x.ogg'], -4)?.times).toBe(1);
    });

    it('picks a random authored sound via the injected RNG', () => {
        const sounds = ['a.ogg', 'b.ogg', 'c.ogg'];
        expect(planWeaponAttackSounds(sounds, 1, () => 0)?.src).toBe('a.ogg');
        expect(planWeaponAttackSounds(sounds, 1, () => 0.5)?.src).toBe('b.ogg');
        expect(planWeaponAttackSounds(sounds, 1, () => 0.99)?.src).toBe('c.ogg');
    });
});

describe('playWeaponAttackSounds', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('plays once immediately and schedules the rest, broadcasting to all clients', () => {
        vi.useFakeTimers();
        const play = vi.fn();
        vi.stubGlobal('foundry', { audio: { AudioHelper: { play } } });

        playWeaponAttackSounds({ src: 'bolt.ogg', times: 3, staggerMs: 100 });

        // First shot fires synchronously; broadcast flag (2nd arg) is true.
        expect(play).toHaveBeenCalledTimes(1);
        expect(play.mock.calls[0]?.[0]).toMatchObject({ src: 'bolt.ogg', loop: false });
        expect(play.mock.calls[0]?.[1]).toBe(true);

        vi.advanceTimersByTime(250);
        expect(play).toHaveBeenCalledTimes(3);
    });

    it('does nothing for a null plan', () => {
        const play = vi.fn();
        vi.stubGlobal('foundry', { audio: { AudioHelper: { play } } });
        playWeaponAttackSounds(null);
        expect(play).not.toHaveBeenCalled();
    });
});

describe('playWeaponAttackSoundsForRoll', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('plays the weapon-roll sound but skips a target-only post', () => {
        const play = vi.fn();
        vi.stubGlobal('foundry', { audio: { AudioHelper: { play } } });

        playWeaponAttackSoundsForRoll({ weapon: { system: { sounds: ['bolt.ogg'] } }, fireRate: 1 });
        expect(play).toHaveBeenCalledTimes(1);

        play.mockClear();
        playWeaponAttackSoundsForRoll({ weapon: { system: { sounds: ['bolt.ogg'] } }, fireRate: 1, isTargetOnly: true });
        expect(play).not.toHaveBeenCalled();
    });

    it('is a no-op for a non-weapon roll (no weapon / no sounds)', () => {
        const play = vi.fn();
        vi.stubGlobal('foundry', { audio: { AudioHelper: { play } } });
        playWeaponAttackSoundsForRoll({ fireRate: 1 });
        playWeaponAttackSoundsForRoll({ weapon: { system: {} }, fireRate: 2 });
        expect(play).not.toHaveBeenCalled();
    });
});
