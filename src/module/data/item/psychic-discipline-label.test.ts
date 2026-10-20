import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PSYCHIC_DISCIPLINE_CHOICES, psychicDisciplineDisplay, psychicDisciplineOptions } from './psychic-discipline.ts';

describe('psychic discipline labels (#659, content#35)', () => {
    it('reads an exact tree name through the langpack, whatever its case', () => {
        expect(psychicDisciplineDisplay('pyromancy')).toEqual({ labelKey: 'WH40K.PsychicDiscipline.Pyromancy' });
        expect(psychicDisciplineDisplay(' Telepathy ')).toEqual({ labelKey: 'WH40K.PsychicDiscipline.Telepathy' });
        expect(psychicDisciplineDisplay('')).toEqual({ labelKey: 'WH40K.PsychicDiscipline.Minor' });
    });

    it('shows any other printed discipline as the book prints it', () => {
        expect(psychicDisciplineDisplay('Sorcery')).toEqual({ label: 'Sorcery' });
        expect(psychicDisciplineDisplay('Malefic Daemonology')).toEqual({ label: 'Malefic Daemonology' });
        expect(psychicDisciplineDisplay("Divination\n(Emperor's Tarot)")).toEqual({ label: "Divination (Emperor's Tarot)" });
    });

    it('every tree label key resolves to a langpack string', () => {
        interface Lang {
            WH40K: { PsychicDiscipline: Record<string, string> };
        }
        const lang = JSON.parse(readFileSync(resolve(__dirname, '../../../lang/en.json'), 'utf8')) as Lang;
        const missing = PSYCHIC_DISCIPLINE_CHOICES.map((tree) => psychicDisciplineDisplay(tree))
            .flatMap((display) => ('labelKey' in display ? [display.labelKey] : []))
            .filter((key) => typeof lang.WH40K.PsychicDiscipline[key.split('.').pop() ?? ''] !== 'string');
        expect(missing).toEqual([]);
    });

    it('offers every tree with a stored tree name selected', () => {
        const options = psychicDisciplineOptions('Pyromancy');
        expect(options.map((o) => o.value)).toEqual([...PSYCHIC_DISCIPLINE_CHOICES]);
        expect(options.filter((o) => o.selected).map((o) => o.value)).toEqual(['pyromancy']);
    });

    it('keeps a printed discipline as its own selected option, so editing never overwrites it', () => {
        const options = psychicDisciplineOptions('Nurgle');
        expect(options[0]).toEqual({ value: 'Nurgle', display: { label: 'Nurgle' }, selected: true });
        expect(options.slice(1).map((o) => o.value)).toEqual([...PSYCHIC_DISCIPLINE_CHOICES]);
        expect(options.filter((o) => o.selected)).toHaveLength(1);
    });
});
