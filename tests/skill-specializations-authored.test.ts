/**
 * Content guard (#498): every DH2 specialist skill carries the rulebook's
 * specialisations, and they came from the book.
 *
 * The advancement picker offers `system.specializations`; with the list empty it
 * falls back to a free-text box, which is the defect this issue is about — a
 * near-miss spelling buys a paid track the roll engine cannot match (#225). So an
 * empty list on a specialist skill is a regression, not a gap.
 *
 * DH2 is the reference line (the only one whose skills chapter AND skills item
 * pack are both authored), so it is the line asserted here.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKILLS_DIR = resolve(__dirname, '../src/packs/dark-heresy-2/dh2-core-items-skills/_source');

interface SkillDoc {
    name?: string;
    system?: { specialist?: boolean; specializations?: string[]; skillType?: string };
}

/** Every DH2 core skill document, by display name. */
function skillDocs(): Map<string, SkillDoc> {
    const out = new Map<string, SkillDoc>();
    for (const file of readdirSync(SKILLS_DIR)) {
        if (!file.endsWith('.json')) continue;
        const doc = JSON.parse(readFileSync(resolve(SKILLS_DIR, file), 'utf8')) as SkillDoc;
        if (doc.name !== undefined) out.set(doc.name, doc);
    }
    return out;
}

/** The DH2 specialist skills, per Chapter III. */
const SPECIALIST_SKILLS = ['Common Lore', 'Forbidden Lore', 'Linguistics', 'Operate', 'Scholastic Lore', 'Trade'];

describe('DH2 specialist skills carry their canonical specialisations (#498)', () => {
    const docs = skillDocs();

    it.each(SPECIALIST_SKILLS)('%s is marked specialist and lists its specialisations', (name) => {
        const doc = docs.get(name);
        expect(doc, `${name} must exist in dh2-core-items-skills`).toBeDefined();
        expect(doc?.system?.specialist, `${name} must be flagged specialist`).toBe(true);
        expect((doc?.system?.specializations ?? []).length, `${name} must list at least one specialisation`).toBeGreaterThan(0);
    });

    it('records Advanced-ness and specialist-ness independently', () => {
        // The old three-way `skillType` enum could say a skill was Advanced OR
        // specialist, never both — so marking one specialist erased that it was
        // Advanced. Common Lore is both.
        const commonLore = docs.get('Common Lore');
        expect(commonLore?.system?.skillType).toBe('advanced');
        expect(commonLore?.system?.specialist).toBe(true);
    });

    it('has no duplicate or blank entries in any list', () => {
        for (const name of SPECIALIST_SKILLS) {
            const list = docs.get(name)?.system?.specializations ?? [];
            expect(new Set(list).size, `${name} has duplicate specialisations`).toBe(list.length);
            expect(
                list.every((s) => s.trim() !== ''),
                `${name} has a blank specialisation`,
            ).toBe(true);
        }
    });

    it('carries the entries the rulebook actually lists', () => {
        // Spot-checks against Chapter III, so a bad re-extraction is caught rather
        // than silently replacing the lists with something plausible.
        expect(docs.get('Common Lore')?.system?.specializations).toContain('Adeptus Arbites');
        expect(docs.get('Common Lore')?.system?.specializations).toContain('War');
        expect(docs.get('Forbidden Lore')?.system?.specializations).toContain('Daemonology');
        expect(docs.get('Scholastic Lore')?.system?.specializations).toContain('Tactica Imperialis');
        expect(docs.get('Trade')?.system?.specializations).toContain('Armourer');
        expect(docs.get('Linguistics')?.system?.specializations).toContain('High Gothic');
        // Operate's three are authored as chapter section headings, not as a
        // `<strong>` list, so they are the easiest to lose in a re-extraction.
        expect(docs.get('Operate')?.system?.specializations).toEqual(['Surface', 'Aeronautica', 'Voidship']);
    });

    it('does not mark ordinary skills specialist', () => {
        for (const name of ['Awareness', 'Dodge', 'Parry']) {
            expect(docs.get(name)?.system?.specialist ?? false, `${name} is not a specialist skill`).toBe(false);
        }
    });
});
