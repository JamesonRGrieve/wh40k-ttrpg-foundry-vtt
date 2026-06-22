/**
 * Stories for OriginPathSheet.
 *
 * Origin paths are character-creation lifepath steps that exist in all seven
 * game lines but diverge per line: the canonical first step is `homeWorld` in
 * the Dark Heresy / Black Crusade / Deathwatch / Only War families but
 * `birthright`-shaped or faction-shaped elsewhere, and the source book + granted
 * skills differ. The sheet template carries per-system icon variants
 * (`bc:tw-text-* dh1:* dh2:* dw:* ow:* rt:* im:*`), so the per-system stories
 * stamp a `data-wh40k-system` ancestor to activate them (CLAUDE.md "Adaptation
 * procedure 3a / per-system variants"). RNG is seeded once so the generated item
 * ids stay deterministic across runs.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-origin-path-sheet.hbs?raw';

initializeStoryHandlebars();
const rng = seedRandom(0x0a1b2c);

interface OriginPathCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    grants: ReturnType<typeof mockItem>['system']['grants'];
    modifiers: ReturnType<typeof mockItem>['system']['modifiers'];
    requirements: ReturnType<typeof mockItem>['system']['requirements'];
    step: ReturnType<typeof mockItem>['system']['step'];
    xpCost: ReturnType<typeof mockItem>['system']['xpCost'];
    hasCharModifiers: boolean;
    charModifiers: Array<{ key: string; label: string; short: string; value: number }>;
    hasSkillGrants: boolean;
    skillGrants: Array<{ name: string; level: string }>;
    hasTalentGrants: boolean;
    talentGrants: ReadonlyArray<never>;
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    tabs: Record<string, { id: string; tab: string; group: string; active: boolean; cssClass: string }>;
}
function makeCtx(overrides: Partial<OriginPathCtx> = {}): OriginPathCtx {
    const id = randomId('origin', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Hive World',
        type: 'originPath',
        img: 'icons/environment/settlement/town-exterior.webp',
        system: {
            step: 'homeWorld',
            stepLabel: 'Home World',
            stepIndex: 0,
            xpCost: 0,
            isAdvancedOrigin: false,
            description: { value: '<p>Born in the press of the underhive.</p>' },
            grants: {
                skills: [{ name: 'Dodge', specialization: '', level: 'trained' }],
                talents: [],
                traits: [],
                equipment: [],
                choices: [],
            },
            modifiers: { characteristics: { agility: 5 } },
            requirements: { text: '', previousSteps: [], excludedSteps: [] },
            source: { book: 'Dark Heresy 2e Core', page: '15' },
        },
    });
    return {
        item,
        system: item.system,
        grants: item.system.grants,
        modifiers: item.system.modifiers,
        requirements: item.system.requirements,
        step: item.system.step,
        xpCost: item.system.xpCost,
        hasCharModifiers: true,
        charModifiers: [{ key: 'agility', label: 'Agility', short: 'Ag', value: 5 }],
        hasSkillGrants: true,
        skillGrants: [{ name: 'Dodge', level: 'Trained' }],
        hasTalentGrants: false,
        talentGrants: [],
        canEdit: true,
        inEditMode: false,
        editable: true,
        tabs: {
            details: { id: 'details', tab: 'details', group: 'primary', active: true, cssClass: 'active' },
            grants: { id: 'grants', tab: 'grants', group: 'primary', active: false, cssClass: '' },
            description: { id: 'description', tab: 'description', group: 'primary', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/OriginPathSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const EditMode: Story = { render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })) };

export const RendersOriginName: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Hive World')).toBeTruthy();
    },
};

export const RendersStepBadge: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Home World')).toBeTruthy();
    },
};

/* -------------------------------------------- */
/*  Per-system homologation (all 7 game lines)  */
/* -------------------------------------------- */

/** A representative first-step origin path for one game line. */
interface SystemOriginFixture {
    /** Origin-path entity display name (the homeworld / starting-step name). */
    name: string;
    /** The lifepath step id this entry occupies. */
    step: string;
    /** Localized step label rendered in the header badge. */
    stepLabel: string;
    /** Source book + page, rendered on the description tab and used as `system.source`. */
    source: string;
    /** Skills this step grants, shown on the grants tab. */
    skillGrants: Array<{ name: string; specialization: string; level: string }>;
    /** Characteristic modifier this step applies (single entry keeps the fixture compact). */
    charModifier: { key: string; label: string; short: string; value: number };
}

/**
 * One canonical lifepath step per game line. Each line's first step and source
 * book differ; the data is fixed (not generated) so the visual snapshot is
 * deterministic. Keyed by the seven {@link SystemId} ids.
 */
const PER_SYSTEM_ORIGINS: Record<SystemId, SystemOriginFixture> = {
    dh2: {
        name: 'Hive World',
        step: 'homeWorld',
        stepLabel: 'Home World',
        source: 'Dark Heresy 2e Core, pg. 15',
        skillGrants: [{ name: 'Dodge', specialization: '', level: 'trained' }],
        charModifier: { key: 'agility', label: 'Agility', short: 'Ag', value: 5 },
    },
    dh1: {
        name: 'Imperial World',
        step: 'homeWorld',
        stepLabel: 'Home World',
        source: 'Dark Heresy Core, pg. 18',
        skillGrants: [{ name: 'Common Lore', specialization: 'Imperium', level: 'trained' }],
        charModifier: { key: 'willpower', label: 'Willpower', short: 'WP', value: 3 },
    },
    rt: {
        name: 'Void Born',
        step: 'homeWorld',
        stepLabel: 'Home World',
        source: 'Rogue Trader Core, pg. 22',
        skillGrants: [{ name: 'Navigation', specialization: 'Stellar', level: 'known' }],
        charModifier: { key: 'willpower', label: 'Willpower', short: 'WP', value: 5 },
    },
    bc: {
        name: 'Renegade',
        step: 'homeWorld',
        stepLabel: 'Pride',
        source: 'Black Crusade Core, pg. 30',
        skillGrants: [{ name: 'Deceive', specialization: '', level: 'trained' }],
        charModifier: { key: 'fellowship', label: 'Fellowship', short: 'Fel', value: 5 },
    },
    ow: {
        name: 'Death World',
        step: 'homeWorld',
        stepLabel: 'Home World',
        source: 'Only War Core, pg. 28',
        skillGrants: [{ name: 'Survival', specialization: '', level: 'trained' }],
        charModifier: { key: 'toughness', label: 'Toughness', short: 'T', value: 5 },
    },
    dw: {
        name: 'Chapter — Ultramarines',
        step: 'career',
        stepLabel: 'Chapter',
        source: 'Deathwatch Core, pg. 24',
        skillGrants: [{ name: 'Common Lore', specialization: 'War', level: 'trained' }],
        charModifier: { key: 'weaponSkill', label: 'Weapon Skill', short: 'WS', value: 5 },
    },
    im: {
        name: 'Hive World Origin',
        step: 'homeWorld',
        stepLabel: 'Origin',
        source: 'Imperium Maledictum Core, pg. 26',
        skillGrants: [{ name: 'Awareness', specialization: '', level: 'trained' }],
        charModifier: { key: 'perception', label: 'Perception', short: 'Per', value: 5 },
    },
};

/**
 * Build the origin-path context for one game line, then wrap the rendered sheet
 * in a `data-wh40k-system` ancestor so the template's `<id>:tw-*` icon variants
 * cascade (the variants are scoped to `[data-wh40k-system="<id>"] &`).
 */
function renderPerSystem(systemId: SystemId): HTMLElement {
    const fixture = PER_SYSTEM_ORIGINS[systemId];
    const id = randomId(`origin-${systemId}`, rng);
    const item = mockItem({
        _id: id,
        id,
        name: fixture.name,
        type: 'originPath',
        img: 'icons/environment/settlement/town-exterior.webp',
        system: {
            step: fixture.step,
            stepLabel: fixture.stepLabel,
            stepIndex: 0,
            xpCost: 0,
            isAdvancedOrigin: false,
            description: { value: `<p>${fixture.name} origin for the ${systemId} line.</p>` },
            grants: {
                skills: fixture.skillGrants,
                talents: [],
                traits: [],
                equipment: [],
                choices: [],
            },
            modifiers: { characteristics: { [fixture.charModifier.key]: fixture.charModifier.value } },
            requirements: { text: '', previousSteps: [], excludedSteps: [] },
            source: fixture.source,
        },
    });
    const ctx = makeCtx({
        item,
        system: item.system,
        grants: item.system.grants,
        modifiers: item.system.modifiers,
        step: item.system.step,
        charModifiers: [fixture.charModifier],
        skillGrants: fixture.skillGrants.map((s) => ({ name: s.name, level: s.level })),
    });
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = systemId;
    wrapper.appendChild(renderSheet(templateSrc, ctx));
    return wrapper;
}

/** Assert the line's homeworld name and step badge both render under its system ancestor. */
function makePerSystemPlay(systemId: SystemId) {
    return async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
        const fixture = PER_SYSTEM_ORIGINS[systemId];
        const view = within(canvasElement);
        await expect(view.getByDisplayValue(fixture.name)).toBeTruthy();
        await expect(view.getAllByText(fixture.stepLabel).length).toBeGreaterThanOrEqual(1);
        await expect(canvasElement.querySelector('[data-wh40k-system]')?.getAttribute('data-wh40k-system')).toBe(systemId);
    };
}

export const Dh2HomeWorld: Story = {
    name: 'Per-system — DH2e Home World (Hive World)',
    render: () => renderPerSystem('dh2'),
    play: makePerSystemPlay('dh2'),
};

export const Dh1HomeWorld: Story = {
    name: 'Per-system — DH1 Home World (Imperial World)',
    render: () => renderPerSystem('dh1'),
    play: makePerSystemPlay('dh1'),
};

export const RtHomeWorld: Story = {
    name: 'Per-system — Rogue Trader Home World (Void Born)',
    render: () => renderPerSystem('rt'),
    play: makePerSystemPlay('rt'),
};

export const BcPride: Story = {
    name: 'Per-system — Black Crusade Pride (Renegade)',
    render: () => renderPerSystem('bc'),
    play: makePerSystemPlay('bc'),
};

export const OwHomeWorld: Story = {
    name: 'Per-system — Only War Home World (Death World)',
    render: () => renderPerSystem('ow'),
    play: makePerSystemPlay('ow'),
};

export const DwChapter: Story = {
    name: 'Per-system — Deathwatch Chapter (Ultramarines)',
    render: () => renderPerSystem('dw'),
    play: makePerSystemPlay('dw'),
};

export const ImOrigin: Story = {
    name: 'Per-system — Imperium Maledictum Origin',
    render: () => renderPerSystem('im'),
    play: makePerSystemPlay('im'),
};
