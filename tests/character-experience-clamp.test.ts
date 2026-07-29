/**
 * Regression guard: `system.experience.used` must be clamped to `<= total` in
 * the character DataModel's `_cleanData` path.
 *
 * History: the 2026-05 "empty inventories" incident was paired with an XP
 * corruption — an external builder import (ajott.io) wrote each PC's full
 * build cost (~4500) as `experience.used` while `experience.total` stayed at
 * the out-of-box 1000. `available = total - used` therefore rendered negative,
 * downstream advancement-affordability math went undefined, and the sheet
 * displayed "1000 / 4500" XP. The Origin Path Builder already carried a
 * defensive clamp for this case (issue #214), but only on its commit path —
 * so direct `actor.update` writes and external imports bypassed it.
 *
 * The fix added a clamp in `CharacterData.#cleanExperience`, so the invariant
 * holds on every document initialization, not only when the builder runs.
 * This guard asserts that clamp stays present (CharacterData cannot be loaded
 * under happy-dom, so we use the source-text idiom from
 * actor-sheet-filter-init.test.ts / actor-sheet-equipment-reprep.test.ts).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAR_PATH = resolve(__dirname, '../src/module/data/actor/character.ts');
const charSrc = readFileSync(CHAR_PATH, 'utf8');

/** Read a repo-relative source file, for the source-text guards below. */
function readRepoFile(relative: string): string {
    return readFileSync(resolve(__dirname, '..', relative), 'utf8');
}

/**
 * Source with comments stripped, so a guard never trips on prose that quotes the
 * very pattern it forbids — `xp-transaction.ts` documents the write it removed.
 */
function codeOnly(text: string): string {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*)/.test(line))
        .join('\n');
}

/**
 * Extract one method's source, from its 4-space-indented declaration to the next
 * 4-space-indented close brace.
 *
 * Anchoring the start on `\n    <name>(` matches the DECLARATION only — a call
 * site reads `this.#name(`, so it can never be picked up by mistake.
 * @param {string} src  File source text.
 * @param {string} name  Method name, including a leading `#` for a private one.
 * @returns {string}  The method's source, or '' when absent.
 */
function methodSource(src: string, name: string): string {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const start = src.search(new RegExp(`\\n {4}${escaped}\\(`));
    if (start === -1) return '';
    const end = src.indexOf('\n    }', start);
    return end === -1 ? '' : src.slice(start, end);
}

/**
 * The whole XP-derivation cluster: `_computeExperienceSpent` plus the private
 * per-category helpers it delegates to.
 *
 * The sums originally sat in one 40-branch method. They were split into
 * `#psyRatingSpend` / `#characteristicSpend` / `#skillSpend` / `#itemSpend` /
 * `#infamySpend` to bring the function under the `complexity` gate. The guards
 * below assert WHAT is derived, not where it lives, so they read the cluster
 * rather than a single method body — anchoring them to one body meant a pure
 * refactor broke them, which is exactly what happened.
 * @param {string} src  character.ts source text.
 * @returns {string}  Concatenated source of the derivation cluster.
 */
function spendDerivationSource(src: string): string {
    const parts = ['_computeExperienceSpent', '#psyRatingSpend', '#characteristicSpend', '#skillSpend', '#itemSpend', '#infamySpend'];
    return parts.map((name) => methodSource(src, name)).join('\n');
}

/** Extract the body of `#cleanExperience` up to its matching 4-space-indent close brace. */
function cleanExperienceBody(src: string): string {
    const m = src.match(/static #cleanExperience\s*\([^)]*\)[^{]*\{([\s\S]*?)\n {4}\}/);
    const body = m?.[1];
    if (body === undefined) {
        throw new Error('#cleanExperience method must exist in character.ts');
    }
    return body;
}

describe('character DataModel experience clamp', () => {
    const body = cleanExperienceBody(charSrc);

    it('clamps `used` to <= `total` so `available` never renders negative', () => {
        // Both halves of the invariant must be present in the cleaning step.
        expect(body, 'must compare used against total').toMatch(/used\s*>\s*total/);
        expect(body, 'must assign clamped used back').toMatch(/experience\['used'\]\s*=\s*total/);
    });

    it("guards on numeric typeof so a missing or non-numeric field doesn't throw", () => {
        // The clamp must precondition on typeof === 'number' for BOTH fields,
        // otherwise an actor with undefined/string experience throws during clean.
        expect(body).toMatch(/typeof used === 'number'/);
        expect(body).toMatch(/typeof total === 'number'/);
    });
});

/**
 * #240 / #224: experience spent is fully DERIVED from purchased advancements, so
 * `used`/`available` are recomputed from `calculatedTotal` every prepare and a
 * stale or externally-imported `used` can no longer drift (the "1000/1000 with
 * no advancements" report). CharacterData can't load under happy-dom, so this
 * asserts the wiring at the source level (the arithmetic itself is unit-tested
 * in `src/module/rules/xp-costs.test.ts`).
 */
describe('character DataModel experience derivation (#240)', () => {
    // Anchor on the method signature (`(): void {`) so we match the definition, not a
    // call site like `this._computeExperienceSpent()`.
    const m = charSrc.match(/_computeExperienceSpent\(\):\s*void\s*\{([\s\S]*?)\n {4}\}/);
    const body = m?.[1] ?? '';

    it('derives used + available from calculatedTotal', () => {
        expect(body, '_computeExperienceSpent must exist').not.toBe('');
        expect(body, 'used mirrors calculatedTotal').toMatch(/experience\.used\s*=\s*this\.experience\.calculatedTotal/);
        // The balance now goes through the shared `experienceBalance` helper
        // rather than a bare subtraction, so it is floored and any deficit is
        // reported as `overspent` instead of rendering as a negative (#509).
        // The contract this guard exists for is unchanged: the balance is
        // computed from `calculatedTotal`, never from a persisted `used`.
        expect(body, 'balance derived from total + calculatedTotal').toMatch(
            /experienceBalance\(this\.experience\.total,\s*this\.experience\.calculatedTotal\)/,
        );
        expect(body, 'available comes from that balance').toMatch(/experience\.available\s*=\s*balance\.available/);
        expect(body, 'a deficit is reported, not rendered as a negative available').toMatch(/experience\.overspent\s*=\s*balance\.overspent/);
    });

    it('counts the spend categories that have no per-advance .cost field', () => {
        // Psy Rating (formula) and BC Infamy (chaosAdvancements ledger) are not
        // captured by the .cost sums, so they must be added to calculatedTotal.
        // Read across the derivation cluster: each of these now lives in the
        // private helper that owns its category.
        const cluster = spendDerivationSource(charSrc);
        expect(cluster, 'psy rating spend derived from rating').toMatch(/psyRatingTotalCost/);
        expect(cluster, 'psychic powers fall back to the shared heuristic').toMatch(/psychicPowerCost/);
        expect(cluster, 'BC infamy summed from the chaosAdvancements ledger').toMatch(/category === 'infamy'/);
        // …and each helper's subtotal must actually reach the totals it feeds.
        expect(body, 'psy rating + owned powers share the psychic bucket').toMatch(/spentPsychicPowers\s*=\s*ratingSpend\s*\+/);
        expect(body, 'infamy subtotal assigned').toMatch(/spentInfamy\s*=\s*this\.#infamySpend\(\)/);
    });
});

/**
 * Itemised purchase breakdown: _computeExperienceSpent builds a display list so
 * the experience panel can show exactly which advances spent XP went to. The list
 * is built inline with the same sums, so it always reconciles with calculatedTotal.
 */
describe('character DataModel experience purchase breakdown', () => {
    const m = charSrc.match(/_computeExperienceSpent\(\):\s*void\s*\{([\s\S]*?)\n {4}\}/);
    const body = m?.[1] ?? '';

    it('builds a purchases list and exposes it on experience', () => {
        expect(body, '_computeExperienceSpent must exist').not.toBe('');
        expect(body, 'purchases array declared').toMatch(/const purchases:\s*XpPurchase\[\]/);
        expect(body, 'purchases assigned onto experience').toMatch(/this\.experience\.purchases\s*=\s*purchases/);
    });

    it('records an entry for every spend category', () => {
        // Each category's push lives in the helper that owns that category, so the
        // guard reads the whole derivation cluster rather than one method body.
        const cluster = spendDerivationSource(charSrc);
        for (const category of ['characteristic', 'skill', 'talent', 'psychicPower', 'psyRating']) {
            expect(cluster, `pushes a ${category} entry`).toMatch(new RegExp(`category:\\s*'${category}'`));
        }
    });

    it('every helper that records purchases is handed the shared list', () => {
        // The list reconciles with calculatedTotal only because all five helpers
        // append to the SAME array rather than building their own.
        for (const helper of ['#psyRatingSpend', '#characteristicSpend', '#skillSpend', '#itemSpend']) {
            expect(body, `${helper} receives the shared purchases list`).toMatch(new RegExp(`this\\.${helper}\\(purchases\\)`));
        }
    });
});

/**
 * #509: `experience.used` is DERIVED, so it must have exactly one writer.
 *
 * It previously had five: `spendXP`, the sheet's BC infamy path, the origin-path
 * builder (twice), and `prepareDerivedData` — which runs last and discards the
 * other four. That is why the affordability guard could approve a purchase
 * against a balance that had not absorbed an earlier one, and a character
 * reached −200. Any new writer reintroduces the same class of bug, silently,
 * because the derive always wins.
 */
describe('experience.used has exactly one writer (#509)', () => {
    /** Source files that historically wrote `used`, plus the guard itself. */
    const WRITERS = [
        'src/module/utils/xp-transaction.ts',
        'src/module/applications/actor/character-sheet.ts',
        'src/module/applications/character-creation/origin-path-builder.ts',
        'src/module/applications/dialogs/advancement-dialog.ts',
    ];

    it('no code path writes system.experience.used outside the derive', () => {
        for (const file of WRITERS) {
            const src = codeOnly(readRepoFile(file));
            expect(src, `${file} must not write the derived experience.used`).not.toMatch(/['"]system\.experience\.used['"]\s*:/);
        }
    });

    it('the derive itself still writes it', () => {
        expect(charSrc).toMatch(/this\.experience\.used\s*=\s*this\.experience\.calculatedTotal/);
    });

    it('the affordability guard consults the derived spend, not the persisted used', () => {
        // Reading the persisted `used` is what let a stale value pass a purchase
        // the derive then rejected.
        const xp = readRepoFile('src/module/utils/xp-transaction.ts');
        expect(xp, 'prefers calculatedTotal').toMatch(/calculatedTotal\s*\?\?\s*experience\.used/);
        expect(xp, 'uses the shared budget check').toMatch(/fitsBudget\(/);
    });

    it('a purchase re-verifies the ledger after the debit lands', () => {
        // The authorization is a check, not a reservation, so two clients can
        // both pass it; this is the backstop.
        expect(readRepoFile('src/module/applications/dialogs/advancement-dialog.ts')).toMatch(/assertWithinBudget\(/);
    });
});
