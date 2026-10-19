import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PSYCHIC_DISCIPLINE_CHOICES, psychicDisciplineLabelKey, psychicDisciplineOptions } from './psychic-discipline.ts';

describe('psychic discipline labels (#659)', () => {
    it('names the langpack key of each discipline, normalising a stored heading first', () => {
        expect(psychicDisciplineLabelKey('pyromancy')).toBe('WH40K.PsychicDiscipline.Pyromancy');
        expect(psychicDisciplineLabelKey('Malefic Daemonology')).toBe('WH40K.PsychicDiscipline.Malefic');
        expect(psychicDisciplineLabelKey('')).toBe('WH40K.PsychicDiscipline.Minor');
    });

    it('every discipline label key resolves to a langpack string', () => {
        interface Lang {
            WH40K: { PsychicDiscipline: Record<string, string> };
        }
        const lang = JSON.parse(readFileSync(resolve(__dirname, '../../../lang/en.json'), 'utf8')) as Lang;
        const missing = PSYCHIC_DISCIPLINE_CHOICES.map(psychicDisciplineLabelKey).filter(
            (key) => typeof lang.WH40K.PsychicDiscipline[key.split('.').pop() ?? ''] !== 'string',
        );
        expect(missing).toEqual([]);
    });

    it('offers every discipline with the stored one selected', () => {
        const options = psychicDisciplineOptions('Pyromancy');
        expect(options.map((o) => o.value)).toEqual([...PSYCHIC_DISCIPLINE_CHOICES]);
        expect(options.filter((o) => o.selected).map((o) => o.value)).toEqual(['pyromancy']);
    });
});
