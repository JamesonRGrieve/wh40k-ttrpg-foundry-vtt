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
import { mockItem, mockSourceReference } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { localizeKey } from '../../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickEachTab, detailSectionTitles, renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-origin-path-sheet.hbs?raw';
import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import { type OriginGrantFieldFlags, type OriginStepOption, originSheetLine, originSheetLineContext } from '../../rules/origin-step-options.ts';
import { originStepLabelKey } from '../../rules/origin-steps.ts';

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
    /** What the sheet derives from the item's line (#687): the step select and the line's grant fields. */
    stepOptions: OriginStepOption[];
    grantFields: OriginGrantFieldFlags;
}

/** The step select and grant fields the sheet builds for `step` on `systemId`, from the line's own config (#687). */
function lineContext(systemId: SystemId, step: string): Pick<OriginPathCtx, 'stepOptions' | 'grantFields'> {
    return originSheetLineContext(systemId, step, (key) => localizeKey(originStepLabelKey(key)));
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
            stepIndex: 1,
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
            source: mockSourceReference({ book: 'Dark Heresy 2e Core', page: '15' }),
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
        ...lineContext('dh2', 'homeWorld'),
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/OriginPathSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const EditMode: Story = { render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })) };

/**
 * Each tab of the accent strip opens its own panel, through the live sheet's tab
 * machinery (#690). The panels hard-coded `tw-hidden`, and the content held no
 * `.wh40k-tab-content` for the machinery to bind, so the Description tab (with the
 * text, GM notes and Source) could not be opened.
 */
export const TabsSwitch: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const results = clickEachTab(canvasElement);
        await expect(results.map((r) => r.tab)).toEqual(['grants', 'requirements', 'choices', 'description']);
        await expect(results.map((r) => r.active)).toEqual(results.map((r) => [r.tab]));
        await expect(results.flatMap((r) => r.forcedHidden)).toEqual([]);
    },
};

/**
 * Every section of the Description tab is a detail-section panel (#686), in view and
 * edit mode alike. The Effect Text section kept the old bare header, with a tall empty
 * gap under it before the panelled Description section.
 */
export const DescriptionSectionsArePanels: Story = {
    render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })),
    play: async ({ canvasElement }) => {
        const panel = canvasElement.querySelector<HTMLElement>('.tab[data-tab="description"]');
        await expect(panel).not.toBeNull();
        const children = panel === null ? [] : [...panel.children];
        await expect(children.filter((child) => !child.hasAttribute('data-item-section'))).toEqual([]);
        await expect(detailSectionTitles(canvasElement, 'description').map((s) => s.key)).toEqual([
            'WH40K.ItemSheet.OriginPath.EffectText',
            'WH40K.Tabs.Description',
            'WH40K.ItemSheet.Common.GmNotes',
            'WH40K.Common.Source',
        ]);
    },
};

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
        // The header's step badge (titled with the step), not the Step Type select's option of the same name.
        const badge = canvasElement.querySelector<HTMLElement>('span[title="Home World"]');
        await expect(badge).toBeTruthy();
        if (badge === null) return;
        await expect(within(badge).getByText('Home World')).toBeTruthy();
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="system.step"]')?.value).toBe('homeWorld');
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
    /** The step's 1-based builder order, as the line config and the packs store it. */
    stepIndex: number;
    /** Source book + page, stored as the structured `system.source` reference (#229). */
    source: { book: string; page: string };
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
        name: 'Psyker',
        step: 'elite',
        stepLabel: 'Elite Advance',
        stepIndex: 4,
        source: { book: 'Dark Heresy 2e Core', page: '90' },
        skillGrants: [{ name: 'Psyniscience', specialization: '', level: 'trained' }],
        charModifier: { key: 'willpower', label: 'Willpower', short: 'WP', value: 5 },
    },
    dh1: {
        name: 'Imperial World',
        step: 'homeWorld',
        stepLabel: 'Home World',
        stepIndex: 1,
        source: { book: 'Dark Heresy Core', page: '18' },
        skillGrants: [{ name: 'Common Lore', specialization: 'Imperium', level: 'trained' }],
        charModifier: { key: 'willpower', label: 'Willpower', short: 'WP', value: 3 },
    },
    rt: {
        name: 'Void Born',
        step: 'homeWorld',
        stepLabel: 'Home World',
        stepIndex: 1,
        source: { book: 'Rogue Trader Core', page: '22' },
        skillGrants: [{ name: 'Navigation', specialization: 'Stellar', level: 'known' }],
        charModifier: { key: 'willpower', label: 'Willpower', short: 'WP', value: 5 },
    },
    bc: {
        name: 'Psyker',
        step: 'archetype',
        stepLabel: 'Archetype',
        stepIndex: 2,
        source: { book: 'Black Crusade Core', page: '30' },
        skillGrants: [{ name: 'Deceive', specialization: '', level: 'trained' }],
        charModifier: { key: 'fellowship', label: 'Fellowship', short: 'Fel', value: 5 },
    },
    ow: {
        name: 'Weapon Specialist',
        step: 'speciality',
        stepLabel: 'Speciality',
        stepIndex: 7,
        source: { book: 'Only War Core', page: '28' },
        skillGrants: [{ name: 'Survival', specialization: '', level: 'trained' }],
        charModifier: { key: 'toughness', label: 'Toughness', short: 'T', value: 5 },
    },
    dw: {
        name: 'Chapter — Ultramarines',
        step: 'chapter',
        stepLabel: 'Chapter',
        stepIndex: 1,
        source: { book: 'Deathwatch Core', page: '24' },
        skillGrants: [{ name: 'Common Lore', specialization: 'War', level: 'trained' }],
        charModifier: { key: 'weaponSkill', label: 'Weapon Skill', short: 'WS', value: 5 },
    },
    im: {
        name: 'Hive World Origin',
        step: 'homeWorld',
        stepLabel: 'Origin',
        stepIndex: 1,
        source: { book: 'Imperium Maledictum Core', page: '26' },
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
            stepIndex: fixture.stepIndex,
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
            source: mockSourceReference(fixture.source),
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
        inEditMode: true,
        ...lineContext(systemId, fixture.step),
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
        // The structured source edits as Book + Page, never as a raw object (#229).
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="system.source.book"]')?.value).toBe(fixture.source.book);
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="system.source.page"]')?.value).toBe(fixture.source.page);
        await expect(canvasElement.innerHTML).not.toContain('[object Object]');

        // #687: the step select offers the line's own steps, with the item's step selected, so a
        // save keeps it; the header's "Step N" is the stored 1-based order; the Fate threshold and
        // the Emperor's Blessing show only where the line declares them.
        const line = SystemConfigRegistry.get(systemId);
        const select = canvasElement.querySelector<HTMLSelectElement>('select[name="system.step"]');
        await expect(select?.value).toBe(fixture.step);
        await expect([...(select?.options ?? [])].map((option) => option.value)).toEqual(line.getOriginPathStepKeys());
        await expect(view.getByText(localizeKey('WH40K.ItemSheet.OriginPath.StepNumber').replace('{number}', String(fixture.stepIndex)))).toBeTruthy();
        const declared = line.getOriginStepConfig().grantFields ?? [];
        await expect(canvasElement.querySelector('input[name="system.grants.fateThreshold"]') !== null).toBe(declared.includes('fateThreshold'));
        await expect(canvasElement.querySelector('input[name="system.grants.blessedByEmperor"]') !== null).toBe(declared.includes('blessedByEmperor'));
    };
}

export const Dh2Elite: Story = {
    name: 'Per-system — DH2e Elite Advance (Psyker)',
    render: () => renderPerSystem('dh2'),
    play: makePerSystemPlay('dh2'),
};

/**
 * An RT character's Void Born, whose canonical document is DH2's: the sheet follows
 * the owning actor's line (#690), so it offers RT's steps and RT's grant fields.
 * The Fate threshold shows; the DH2-only Emperor's Blessing does not.
 */
export const RtOwnedVoidBorn: Story = {
    name: "RT character's Void Born (DH2 canonical)",
    render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true, ...lineContext(ownedLine(), 'homeWorld') })),
    play: async ({ canvasElement }) => {
        await expect(ownedLine()).toBe('rt');
        const select = canvasElement.querySelector<HTMLSelectElement>('select[name="system.step"]');
        await expect([...(select?.options ?? [])].map((option) => option.value)).toEqual(SystemConfigRegistry.get('rt').getOriginPathStepKeys());
        await expect(canvasElement.querySelector('input[name="system.grants.fateThreshold"]')).not.toBeNull();
        await expect(canvasElement.querySelector('input[name="system.grants.blessedByEmperor"]')).toBeNull();
    },
};

/** The line the sheet resolves for a DH2-canonical origin owned by an RT character. */
function ownedLine(): SystemId {
    return originSheetLine({ type: 'rt-character', system: { gameSystem: 'rt' } }, 'dh2') as SystemId;
}

/** A stored step the line does not declare stays the selected option, so a save never rewrites it (#687). */
export const UndeclaredStepKept: Story = {
    name: 'Step outside the line stays selected',
    render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true, ...lineContext('dh2', 'lureOfTheVoid') })),
    play: async ({ canvasElement }) => {
        const select = canvasElement.querySelector<HTMLSelectElement>('select[name="system.step"]');
        await expect(select?.value).toBe('lureOfTheVoid');
        await expect([...(select?.options ?? [])].map((option) => option.value)).toEqual([
            ...SystemConfigRegistry.get('dh2').getOriginPathStepKeys(),
            'lureOfTheVoid',
        ]);
    },
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

export const BcArchetype: Story = {
    name: 'Per-system — Black Crusade Archetype (Psyker)',
    render: () => renderPerSystem('bc'),
    play: makePerSystemPlay('bc'),
};

export const OwSpeciality: Story = {
    name: 'Per-system — Only War Speciality (Weapon Specialist)',
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
