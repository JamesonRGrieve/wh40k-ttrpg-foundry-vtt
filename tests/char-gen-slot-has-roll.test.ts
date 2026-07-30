/**
 * Regression guard for the drag-pulse target set in the characteristic-setup
 * dialog.
 *
 * History: the `class` -> `data-wh40k-hook` migration rewrote
 * `.csd-char-slot:not(.has-roll)` so that BOTH halves became hook selectors —
 * while `has-roll` stayed a plain CSS class on the template. An element carries
 * exactly ONE hook, so the negated half matched nothing, the `:not()` excluded
 * nothing, and the filter silently became a no-op — every slot pulsed during a
 * drag, including the ones already holding a roll. Nothing failed: no type
 * error, no broken selector, just the wrong element set.
 *
 * (The selector text is deliberately not spelled out in this comment; the
 * `hooks:orphan-audit` gate scans source for hook selectors and does not parse
 * comments, so a quoted example would read as a real orphaned selector.)
 *
 * The fix moved the filled state onto its own attribute (`data-has-roll`), so
 * the two markers no longer compete for one hook slot. This test pins both
 * halves of that contract — the template EMITS the attribute only when the slot
 * is filled, and the dialog's selector SELECTS exactly the unfilled slots — so
 * a future re-port of either side cannot quietly recreate the vacuous filter.
 */

import Hbs from 'handlebars';
import { describe, expect, it } from 'vitest';
import gridSrc from '../src/templates/character-creation/partials/char-gen-characteristic-grid.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const template = Hbs.compile(gridSrc);

/** The selector `characteristic-setup-dialog.ts#onDragStart` uses to pick pulse targets. */
const UNFILLED_SLOTS = '[data-wh40k-hook="csd-char-slot"]:not([data-has-roll])';

interface SlotView {
    key: string;
    label: string;
    base: number;
    hasRoll: boolean;
    rollValue?: number;
    assignedIndex?: number;
    total?: number;
}

function slot(key: string, hasRoll: boolean): SlotView {
    return hasRoll
        ? { key, label: key.toUpperCase(), base: 25, hasRoll: true, rollValue: 8, assignedIndex: 0, total: 33 }
        : { key, label: key.toUpperCase(), base: 25, hasRoll: false };
}

function render(slots: SlotView[]): HTMLElement {
    const html = template({ rows: [slots], charGen: { advancedMode: false, isModeRollPoolHB: true, isModeRoll: false } });
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

describe('char-gen characteristic slot filled-state marker', () => {
    it('marks only the filled slots with data-has-roll', () => {
        const root = render([slot('ws', true), slot('bs', false), slot('s', true)]);

        const all = root.querySelectorAll('[data-wh40k-hook="csd-char-slot"]');
        expect(all).toHaveLength(3);

        const filled = [...all].filter((el) => el.hasAttribute('data-has-roll')).map((el) => el.getAttribute('data-characteristic'));
        expect(filled).toEqual(['ws', 's']);
    });

    it('selects exactly the unfilled slots — the pulse filter is not vacuous', () => {
        const root = render([slot('ws', true), slot('bs', false), slot('s', true), slot('t', false)]);

        const pulsed = [...root.querySelectorAll(UNFILLED_SLOTS)].map((el) => el.getAttribute('data-characteristic'));

        // The defect this guards: a filter that matches every slot. If the
        // marker and the selector ever disagree again, `pulsed` becomes the
        // full set (4) or the empty set (0) instead of exactly the unfilled two.
        expect(pulsed).toEqual(['bs', 't']);
        expect(pulsed).not.toHaveLength(root.querySelectorAll('[data-wh40k-hook="csd-char-slot"]').length);
    });

    // NOTE: there is deliberately no "the slot carries only one hook attribute"
    // test here. Such an assertion is VACUOUS — the HTML parser keeps the first
    // duplicate attribute and discards the rest, so it reads exactly one hook
    // whether the template declares one or five, and passes against the bug it
    // claims to guard (verified by rendering a deliberately-duplicated tag).
    // Duplicate hooks are only observable in source, and are caught there by the
    // `hooks:orphan-audit` gate.
});
