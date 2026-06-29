/**
 * Regression tests for the Specialist Skills panel (#3).
 *
 * Every specialist-skill group must render in the panel even when the character
 * has NO trained specialisation under it, so the player can see the group exists,
 * its governing characteristic, and can attempt it untrained. These tests pin:
 *
 *   - no group is dropped: a group with an empty `entries` list still renders its
 *     heading (the derivation passes empty groups through; the template's
 *     no-entries branch surfaces them);
 *   - the untrained parent is available as an ACTION — it carries a skill-roll
 *     control targeting the group key with NO specialty, so `rollSkill(key,
 *     undefined)` attempts the group untrained;
 *   - trained groups still render their specialisation entries.
 *
 * The panel is rendered through the real `panel.hbs` / `panel-header.hbs`
 * scaffold so the composed tree matches runtime.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import panelHeaderSrc from '../src/templates/actor/partial/panel-header.hbs?raw';
import panelSrc from '../src/templates/actor/partial/panel.hbs?raw';
import specialistPanelSrc from '../src/templates/actor/panel/skills-specialist-panel.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();
HbsStory.registerPartial('systems/wh40k-rpg/templates/actor/partial/panel.hbs', panelSrc);
HbsStory.registerPartial('systems/wh40k-rpg/templates/actor/partial/panel-header.hbs', panelHeaderSrc);
const template = HbsStory.compile(specialistPanelSrc);

interface SpecEntry {
    name: string;
    skillKey: string;
    entryIndex: number;
    current: number;
    trainingIndicators: unknown[];
}
interface SpecGroup {
    label: string;
    charShort: string;
    advanced: boolean;
    entries: SpecEntry[];
}
type SpecialistTuple = [string, SpecGroup];

function render(specialist: SpecialistTuple[]): HTMLElement {
    const html = template({ skillLists: { specialist }, inEditMode: false });
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

const trainedGroup = (): SpecialistTuple => [
    'commonLore',
    {
        label: 'Common Lore',
        charShort: 'Int',
        advanced: true,
        entries: [{ name: 'Imperium', skillKey: 'commonLore', entryIndex: 0, current: 30, trainingIndicators: [] }],
    },
];

const untrainedGroup = (key: string, label: string): SpecialistTuple => [key, { label, charShort: 'Int', advanced: true, entries: [] }];

describe('specialist-skill panel — untrained groups (#3)', () => {
    it('renders every group heading, including untrained groups with no specialisations', () => {
        const root = render([trainedGroup(), untrainedGroup('forbiddenLore', 'Forbidden Lore'), untrainedGroup('trade', 'Trade')]);
        const keys = Array.from(root.querySelectorAll('[data-skill]')).map((el) => el.getAttribute('data-skill'));
        expect(keys).toContain('commonLore');
        expect(keys).toContain('forbiddenLore');
        expect(keys).toContain('trade');
        expect(root.textContent).toContain('Forbidden Lore');
        expect(root.textContent).toContain('Trade');
    });

    it('shows the governing characteristic for an untrained group', () => {
        const root = render([untrainedGroup('forbiddenLore', 'Forbidden Lore')]);
        const group = root.querySelector('[data-skill="forbiddenLore"]');
        expect(group?.textContent).toContain('Int');
    });

    it('makes the untrained group rollable — a skill-roll control targeting the group with no specialty', () => {
        const root = render([untrainedGroup('forbiddenLore', 'Forbidden Lore')]);
        const group = root.querySelector('[data-skill="forbiddenLore"]');
        const rollBtn = group?.querySelector('[data-action="roll"][data-roll-type="skill"]');
        expect(rollBtn).not.toBeNull();
        expect(rollBtn?.getAttribute('data-roll-target')).toBe('forbiddenLore');
        // No specialty: rollSkill(key, undefined) attempts the group untrained.
        expect(rollBtn?.getAttribute('data-specialty')).toBeNull();
    });

    it('still renders specialisation entries for a trained group', () => {
        const root = render([trainedGroup()]);
        expect(root.textContent).toContain('Imperium');
        const specRoll = root.querySelector('[data-roll-target="commonLore"][data-specialty="0"]');
        expect(specRoll).not.toBeNull();
    });
});
