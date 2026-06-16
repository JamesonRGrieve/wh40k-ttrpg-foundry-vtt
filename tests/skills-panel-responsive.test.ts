/**
 * Regression tests for the Statistics-tab skills layout (#267).
 *
 * The Skills panel used to hard-split the standard skills into two fixed arrays
 * (`skillLists.standardColumns.[0]` / `.[1]`) rendered in a `tw-grid-cols-2`
 * grid, so the layout never collapsed to one column on a narrow sheet nor
 * expanded to three on a wide one. It now renders the flat `skillLists.standard`
 * list into a single width-responsive `auto-fit` grid. These tests pin:
 *
 *   - every standard skill renders (no entries dropped in the flatten);
 *   - the layout is a single responsive grid (auto-fit), not the old two-column
 *     split keyed off `standardColumns`.
 *
 * The skill-row partial is stubbed so the test isolates the panel's column
 * layout from row internals.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import skillsPanelSrc from '../src/templates/actor/panel/skills-panel.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

// Stub the skill-row partial: emit one marker per rendered entry, tagged with
// the skill key so we can assert the full set survives the flatten.
HbsStory.registerPartial('systems/wh40k-rpg/templates/actor/partial/skill-row.hbs', '<div class="srow" data-key="{{entry.[0]}}"></div>');
const template = HbsStory.compile(skillsPanelSrc);

// The stub skill-row only reads entry[0] (the key); the value's shape is
// irrelevant here, so a minimal interface keeps it off the boundary-unknown rule.
type SkillEntry = [string, { label?: string }];

function render(standard: SkillEntry[]): HTMLElement {
    // Provide the legacy two-array split too — the panel must IGNORE it now.
    const mid = Math.ceil(standard.length / 2);
    const html = template({
        skillLists: {
            standard,
            standardColumns: [standard.slice(0, mid), standard.slice(mid)],
        },
    });
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

const SKILLS: SkillEntry[] = [
    ['acrobatics', {}],
    ['athletics', {}],
    ['awareness', {}],
    ['charm', {}],
    ['command', {}],
    ['deceive', {}],
    ['dodge', {}],
];

describe('skills-panel — responsive single grid (#267)', () => {
    it('renders every standard skill exactly once', () => {
        const root = render(SKILLS);
        const rows = root.querySelectorAll('.srow');
        expect(rows).toHaveLength(SKILLS.length);
        const keys = Array.from(rows).map((r) => r.getAttribute('data-key'));
        expect(keys).toEqual(SKILLS.map(([k]) => k));
    });

    it('uses a single width-responsive auto-fit grid, not the fixed two-column split', () => {
        const root = render(SKILLS);
        // Exactly one grid container holds all rows.
        const grids = Array.from(root.querySelectorAll('div')).filter((d) => (d.getAttribute('style') ?? '').includes('grid-template-columns'));
        expect(grids).toHaveLength(1);
        const style = grids[0]?.getAttribute('style') ?? '';
        expect(style).toContain('auto-fit');
        // The grid holds the full skill set directly (no intermediate per-column wrappers).
        expect(grids[0]?.querySelectorAll('.srow').length).toBe(SKILLS.length);
    });

    it('drops to a single column source list when only one skill is present', () => {
        const root = render([['scrutiny', {}]]);
        expect(root.querySelectorAll('.srow')).toHaveLength(1);
    });
});
