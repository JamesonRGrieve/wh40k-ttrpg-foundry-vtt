import { describe, expect, it } from 'vitest';
import { normalisePsychicDiscipline, tidyPsychicDiscipline } from './psychic-discipline.ts';

describe('tidyPsychicDiscipline (content#35)', () => {
    it('keeps the printed name, collapsing only whitespace and newlines', () => {
        expect(tidyPsychicDiscipline('Sorcery')).toBe('Sorcery');
        expect(tidyPsychicDiscipline('  Astropath   Psychic Powers ')).toBe('Astropath Psychic Powers');
        expect(tidyPsychicDiscipline("Divination\n(Emperor's Tarot)")).toBe("Divination (Emperor's Tarot)");
    });
});

describe('normalisePsychicDiscipline', () => {
    it('keeps an exact choice, case- and whitespace-insensitively', () => {
        expect(normalisePsychicDiscipline('Telepathy')).toBe('telepathy');
        expect(normalisePsychicDiscipline('  malefic ')).toBe('malefic');
    });

    it('maps a qualified heading onto its leading tree (the Daemonology disciplines)', () => {
        expect(normalisePsychicDiscipline('Malefic Daemonology')).toBe('malefic');
        expect(normalisePsychicDiscipline('Sanctic Daemonology')).toBe('sanctic');
        expect(normalisePsychicDiscipline("Divination\n(Emperor's Tarot)")).toBe('divination');
        expect(normalisePsychicDiscipline('Telepathy - Astropath Elite Advance')).toBe('telepathy');
    });

    it("falls back to 'minor' for a heading with no recognised tree", () => {
        expect(normalisePsychicDiscipline('Telekinetics')).toBe('minor');
        expect(normalisePsychicDiscipline('xChaos Powers\n(Tzeentch)')).toBe('minor');
        expect(normalisePsychicDiscipline('')).toBe('minor');
    });
});
