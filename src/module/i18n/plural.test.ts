import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pluralKey } from './plural';

describe('pluralKey (#414)', () => {
    it('names the One form for one and the Other form for everything else, in English', () => {
        expect(pluralKey('WH40K.Evasion.PromptLine', 1, 'en')).toBe('WH40K.Evasion.PromptLine.One');
        for (const count of [0, 2, 3, 10]) expect(pluralKey('WH40K.Evasion.PromptLine', count, 'en')).toBe('WH40K.Evasion.PromptLine.Other');
    });

    it('treats a non-finite count as zero', () => {
        expect(pluralKey('K', Number.NaN, 'en')).toBe('K.Other');
    });

    it('falls back to Other for a language whose rules have more categories', () => {
        // Polish: 2 is "few", 5 is "many"; the langpack carries One and Other only.
        expect(pluralKey('K', 2, 'pl')).toBe('K.Other');
        expect(pluralKey('K', 1, 'pl')).toBe('K.One');
    });

    it('the hit-count strings no longer hedge with "(s)", and carry both forms', () => {
        interface Lang {
            WH40K: { Evasion: { PromptLine: Record<string, string> }; SkillUse: { Chem: { Coated: Record<string, string> } } };
        }
        const lang = JSON.parse(readFileSync(resolve(__dirname, '../../lang/en.json'), 'utf8')) as Lang;
        for (const group of [lang.WH40K.Evasion.PromptLine, lang.WH40K.SkillUse.Chem.Coated]) {
            expect(Object.keys(group).sort()).toEqual(['One', 'Other']);
            expect(Object.values(group).filter((form) => form.includes('(s)'))).toEqual([]);
        }
    });
});
