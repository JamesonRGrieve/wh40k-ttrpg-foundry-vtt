/**
 * Regression guard (#498): a purchased skill specialisation must be deduped by
 * the SAME identity the roll engine matches on.
 *
 * `#hasSkillTrained` matches a specialisation by `name` OR `slug`,
 * case-insensitively. The purchase path stored `slug` with one transform
 * (`toLowerCase().replace(/\s+/g,'-')`) while deduping on the raw lower-cased
 * name — so "High Gothic" and "high-gothic" read as two different skills, the
 * player could pay twice, and their ranks split across tracks that the roll
 * engine may or may not find.
 *
 * Source scan: the dialog needs Foundry to instantiate, and the contract here is
 * that ONE slug transform is used for both storing and deduping.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const DIALOG = readRepoFile('src/module/applications/dialogs/advancement-dialog.ts');

/** Mirror of the dialog's `specializationSlug`, to pin the intended behaviour. */
function specializationSlug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

describe('specialization slug identity (#498)', () => {
    it('folds case, spacing and punctuation to one identity', () => {
        const canonical = specializationSlug('High Gothic');
        expect(specializationSlug('high gothic')).toBe(canonical);
        expect(specializationSlug('High-Gothic')).toBe(canonical);
        expect(specializationSlug('  High   Gothic  ')).toBe(canonical);
        expect(specializationSlug('HIGH GOTHIC')).toBe(canonical);
    });

    it('keeps genuinely different specialisations distinct', () => {
        expect(specializationSlug('Imperium')).not.toBe(specializationSlug('Imperial'));
        expect(specializationSlug('Adeptus Arbites')).not.toBe(specializationSlug('Adeptus Astartes'));
    });

    it('does not leave leading or trailing separators', () => {
        expect(specializationSlug('(Warp)')).toBe('warp');
        expect(specializationSlug('—Daemonology—')).toBe('daemonology');
    });

    it('the dialog defines the transform once and uses it for both store and dedup', () => {
        expect(DIALOG).toContain('function specializationSlug(');
        // Stored slug goes through the helper…
        expect(DIALOG).toContain('slug: specializationSlug(specName)');
        // …and so does the duplicate check.
        expect(DIALOG).toContain('const newSlug = specializationSlug(specName)');
        // The old ad-hoc transform must not come back.
        expect(DIALOG).not.toContain("specName.toLowerCase().replace(/\\s+/g, '-')");
    });

    it('recovers the skill name from carried data, never by munging a display label', () => {
        // Localising or rewording the decoration used to corrupt the skill name.
        // Scan CODE only — the doc comment above `skillLabel` quotes the old
        // pattern deliberately, and matching that would make this guard unfixable.
        const codeLines = DIALOG.split('\n').filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
        });
        const munging = codeLines.filter((line) => line.includes(".replace(' — add specialization'"));
        expect(munging, `no code may re-derive the skill name from its label:\n${munging.join('\n')}`).toEqual([]);
        expect(DIALOG).toContain('entry.skillLabel');
    });
});
