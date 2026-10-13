import { describe, expect, it } from 'vitest';
import { migrateLegacyAttackSounds } from './attack-cue-field.ts';

/** The pre-#594 flat `sounds` list (#579) moves into the attack cue as `fire` sounds. */

describe('migrateLegacyAttackSounds', () => {
    it('moves each fire sound into cue.sounds and drops the old field', () => {
        const source = { sounds: ['a.ogg', '', 'b.ogg'] };
        migrateLegacyAttackSounds(source);
        expect(source).toEqual({
            cue: {
                sounds: [
                    { event: 'fire', src: 'a.ogg' },
                    { event: 'fire', src: 'b.ogg' },
                ],
            },
        });
    });

    it('keeps an authored cue and its sounds ahead of the moved ones', () => {
        const source = { sounds: ['old.ogg'], cue: { preset: 'bolt', sounds: [{ event: 'hit', src: 'thud.ogg' }] } };
        migrateLegacyAttackSounds(source);
        expect(source.cue).toEqual({
            preset: 'bolt',
            sounds: [
                { event: 'hit', src: 'thud.ogg' },
                { event: 'fire', src: 'old.ogg' },
            ],
        });
    });

    it('is a no-op without the old field, and drops an empty or malformed one', () => {
        const untouched = { cue: { preset: 'las' } };
        migrateLegacyAttackSounds(untouched);
        expect(untouched).toEqual({ cue: { preset: 'las' } });
        const empty = { sounds: [] };
        migrateLegacyAttackSounds(empty);
        expect(empty).toEqual({});
        const malformed = { sounds: 'bang.ogg' };
        migrateLegacyAttackSounds(malformed);
        expect(malformed).toEqual({});
    });
});
