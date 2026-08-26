/**
 * Regression tests for the combat-action-group partial badge + tooltip (#245).
 *
 * The reopened half of #245 reported a combat-action group rendering entries
 * badged WEAPON / TALENT / ORIGINPATH (raw Foundry item `type`s) with empty `:`
 * tooltips, because a malformed entry lacking a localized label/description was
 * being fed into "action" mode. The per-weapon attack group that fed raw items
 * was removed (#227); these tests pin the render-boundary contract so the
 * symptom cannot recur regardless of feeder:
 *
 *   - the "action" badge renders the localized ACTION TIMING
 *     (WH40K.Combat.Actions.Timing.{half|full|reaction|varies|half-full}),
 *     never a raw item type;
 *   - an entry with no `type` renders no badge at all (rather than a raw token);
 *   - the tooltip never degrades to a bare `:` — when `description` is absent the
 *     separator is dropped, and an entry with neither label nor description emits
 *     no `:`.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import combatActionGroupSrc from '../src/templates/actor/panel/combat-action-group.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const PARTIAL_PATH = 'systems/wh40k-rpg/templates/actor/panel/combat-action-group.hbs';
HbsStory.registerPartial(PARTIAL_PATH, combatActionGroupSrc);
const template = HbsStory.compile(combatActionGroupSrc);

interface ActionEntry {
    key?: string;
    label?: string;
    description?: string;
    type?: string;
    icon?: string;
}

function render(items: ActionEntry[]): HTMLElement {
    const html = template({
        heading: 'Movement Actions',
        icon: 'fa-walking',
        items,
        mode: 'action',
        dataAction: 'vocalizeCombatAction',
        actionColor: '--wh40k-accent-equipment',
    });
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

/** The small badge under each action button (the third stacked <span>). */
function badgeText(button: Element | null): string {
    const spans = button?.querySelectorAll('span') ?? [];
    // [0] is the hover accent bar, [1] is the label, [2] (if present) the timing badge.
    return spans.length >= 3 ? spans[spans.length - 1]?.textContent?.trim() ?? '' : '';
}

describe('combat-action-group — timing badge (#245)', () => {
    it('renders the localized timing, not a raw token, for each timing value', () => {
        const cases: Array<[string, string]> = [
            ['half', 'Half'],
            ['full', 'Full'],
            ['reaction', 'Reaction'],
            ['varies', 'Varies'],
            ['half-full', 'Half / Full'],
        ];
        for (const [type, expected] of cases) {
            const root = render([{ key: 'k', label: 'WH40K.Combat.Action.Move', description: 'WH40K.Combat.Action.MoveDesc', type, icon: 'fa-walking' }]);
            const button = root.querySelector('button[data-action-key="k"]');
            expect(badgeText(button)).toBe(expected);
        }
    });

    it('renders NO badge — never a raw item type — when entry.type is absent', () => {
        const root = render([{ key: 'k', label: 'WH40K.Combat.Action.Move', description: 'WH40K.Combat.Action.MoveDesc', icon: 'fa-walking' }]);
        const button = root.querySelector('button[data-action-key="k"]');
        // Only the accent bar + label spans — no third (timing) span.
        expect(button?.querySelectorAll('span').length).toBe(2);
        // And nothing resembling the reported WEAPON/TALENT/ORIGINPATH tokens.
        expect(button?.textContent ?? '').not.toMatch(/WEAPON|TALENT|ORIGINPATH|weapon|talent|originPath/);
    });
});

describe('combat-action-group — tooltip never degrades to a bare ":" (#245)', () => {
    it('joins label and description when both are present', () => {
        const root = render([{ key: 'k', label: 'WH40K.Combat.Action.Move', description: 'WH40K.Combat.Action.MoveDesc', type: 'half', icon: 'fa-walking' }]);
        const aria = root.querySelector('button[data-action-key="k"]')?.getAttribute('aria-label') ?? '';
        expect(aria).toContain(':');
        // story-mode localize returns unknown keys verbatim, so both halves are present.
        expect(aria).toBe('WH40K.Combat.Action.Move: WH40K.Combat.Action.MoveDesc');
    });

    it('drops the separator when description is absent', () => {
        const root = render([{ key: 'k', label: 'WH40K.Combat.Action.Move', type: 'half', icon: 'fa-walking' }]);
        const aria = root.querySelector('button[data-action-key="k"]')?.getAttribute('aria-label') ?? '';
        expect(aria).not.toContain(':');
        expect(aria).toBe('WH40K.Combat.Action.Move');
    });

    it('never emits a bare ":" when label and description resolve to empty', () => {
        // Models a degraded/normalized-but-empty entry (the raw-item case the
        // issue reported, post-localize): both halves are falsy, so the guards
        // skip them and no separator survives.
        const root = render([{ key: 'k', label: '', description: '', type: 'half', icon: 'fa-walking' }]);
        const aria = root.querySelector('button[data-action-key="k"]')?.getAttribute('aria-label') ?? '';
        expect(aria.trim()).not.toBe(':');
        expect(aria).not.toContain(':');
        expect(aria).toBe('');
    });
});

/** The Font Awesome glyph class on a button's action icon (the `fa-*` token). */
function iconClass(button: Element | null): string {
    const i = button?.querySelector('i.fas');
    const cls = i?.getAttribute('class') ?? '';
    return cls.split(/\s+/).find((c) => c.startsWith('fa-')) ?? '';
}

describe('combat-action-group — present-but-invalid type renders NO badge (#245)', () => {
    it('never emits a raw WH40K.Combat.Actions.Timing.<type> key for a non-timing type', () => {
        for (const type of ['weapon', 'talent', 'originPath', 'trait']) {
            const root = render([{ key: 'k', label: 'WH40K.Combat.Action.Move', description: 'WH40K.Combat.Action.MoveDesc', type, icon: 'fa-walking' }]);
            const button = root.querySelector('button[data-action-key="k"]');
            // No timing badge span (accent bar + label only).
            expect(button?.querySelectorAll('span').length).toBe(2);
            // And the unresolved key must not leak into the rendered text.
            expect(button?.textContent ?? '').not.toContain('WH40K.Combat.Actions.Timing.');
            expect(badgeText(button)).toBe('');
        }
    });
});

describe('combat-action-group — every action button has an icon (#245)', () => {
    it('uses the entry icon when present', () => {
        const root = render([{ key: 'k', label: 'WH40K.Combat.Action.Move', type: 'reaction', icon: 'fa-running' }]);
        expect(iconClass(root.querySelector('button[data-action-key="k"]'))).toBe('fa-running');
    });

    it('falls back to a per-timing icon when the entry has none — never iconless', () => {
        const root = render([{ key: 'k', label: 'WH40K.Combat.Action.Move', type: 'reaction' }]);
        expect(iconClass(root.querySelector('button[data-action-key="k"]'))).toBe('fa-bolt');
    });

    it('falls back to a generic glyph for a degraded entry (no icon, non-timing type)', () => {
        const root = render([{ key: 'k', label: 'WH40K.Combat.Action.Move', type: 'weapon' }]);
        expect(iconClass(root.querySelector('button[data-action-key="k"]'))).toBe('fa-circle-dot');
    });
});
