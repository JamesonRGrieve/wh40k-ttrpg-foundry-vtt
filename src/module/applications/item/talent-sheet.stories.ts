/**
 * Stories for TalentSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/talent-sheet.hbs?raw';

initializeStoryHandlebars();

const talentTpl = Hbs.compile(templateSrc);

/**
 * Render the talent sheet under a `.wh40k-rpg` + `data-wh40k-system` ancestor
 * for the given game line. The talent header/benefit headings carry per-system
 * Tailwind variant classes (`bc:tw-text-crimson-light dh1:… dh2:… dw:… ow:…
 * rt:… im:…`) which only fire when an ancestor stamps the system id — the
 * default `renderSheet` wrapper hardcodes `dh2`, so a per-system wrapper is
 * needed to exercise the other six lines (CLAUDE.md "Adaptation procedure 3a").
 */
function renderTalentForSystem(ctx: TalentCtx, systemId: SystemId): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wh40k-rpg theme-dark sheet';
    wrapper.setAttribute('data-wh40k-system', systemId);
    wrapper.innerHTML = talentTpl(ctx);
    return wrapper;
}
// Issue #201: opening a talent in a compendium previously threw a Handlebars
// parse error because `{{#if (eq activeTab"overview")}}` was missing the space
// between the variable and the literal. Compiling at module load asserts the
// template parses cleanly; if a future edit reintroduces the typo, Storybook
// (and the regression spec in tests/storybook/issue-201-...) will fail loudly.
// renderSheet(templateSrc, ctx) compiles the src string on each call, which
// surfaces the same parse-error as the old HandlebarsLib.compile(templateSrc)
// module-level compile: if the template has the typo, the first renderSheet call
// in any story will throw.
const rng = seedRandom(0x7a1e47);

interface TalentTab {
    id: string;
    tab: string;
    group: string;
    active: boolean;
    cssClass: string;
}
interface TalentSummary {
    identifier: string;
    category: string;
    categoryLabel: string;
    tier: number;
    tierLabel: string;
    cost: number;
    isPassive: boolean;
    isRollable: boolean;
    stackable: boolean;
    rank: number;
    hasSpecialization: boolean;
    specialization: string;
    notes: string;
    source: string;
    sourceBook: string;
    sourcePage: string;
    aptitudes: ReadonlyArray<string>;
    hasAptitudes: boolean;
    benefit: string;
    hasBenefit: boolean;
    fullName: string;
}
interface TalentPrerequisites {
    hasAny: boolean;
    text: string;
    characteristics: ReadonlyArray<string>;
    skills: ReadonlyArray<string>;
    talents: ReadonlyArray<string>;
    hasText: boolean;
    hasCharacteristics: boolean;
    hasSkills: boolean;
    hasTalents: boolean;
    label: string;
}
interface TalentCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    source: ReturnType<typeof mockItem>['system'];
    talent: TalentSummary;
    prerequisites: TalentPrerequisites;
    modifierRows: ReadonlyArray<never>;
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    isOwnedByActor: boolean;
    isCompendiumItem?: boolean;
    effects: ReadonlyArray<never>;
    tabs: Record<string, TalentTab>;
    activeTab: string;
}
function makeCtx(overrides: Partial<TalentCtx> = {}): TalentCtx {
    const id = randomId('talent', rng);
    // The talent sheet template gates each tab panel on `(eq activeTab "<id>")`
    // — `activeTab` is set at runtime from `this.tabGroups.primary` in
    // `TalentSheet._prepareContext`. Without it the story renders every panel
    // simultaneously (the issue-201 "duplicate Benefit" symptom). Stories that
    // need a different active tab should pass `activeTab: '<tab-id>'` via the
    // overrides argument.
    const activeTab = overrides.activeTab ?? 'overview';
    const item = mockItem({
        _id: id,
        id,
        name: 'Mighty Shot',
        type: 'talent',
        img: 'icons/skills/ranged/target-bullseye-arrow-glowing.webp',
        system: {
            identifier: 'mighty-shot',
            category: 'combat',
            tier: 1,
            isPassive: true,
            isRollable: false,
            stackable: false,
            rank: 1,
            cost: 200,
            aptitudes: ['Ballistic Skill', 'Offence'],
            source: '',
            sourceBook: 'Dark Heresy 2e Core',
            sourcePage: '123',
            notes: '',
            benefit: 'Add half BS bonus to ranged damage.',
            description: { value: '<p>Your mastery of ranged combat allows for more powerful shots.</p>' },
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        talent: {
            identifier: 'mighty-shot',
            category: 'combat',
            categoryLabel: 'Combat',
            tier: 1,
            tierLabel: 'Tier 1',
            cost: 200,
            isPassive: true,
            isRollable: false,
            stackable: false,
            rank: 1,
            hasSpecialization: false,
            specialization: '',
            notes: '',
            source: '',
            sourceBook: 'Dark Heresy 2e Core',
            sourcePage: '123',
            aptitudes: ['Ballistic Skill', 'Offence'],
            hasAptitudes: true,
            benefit: 'Add half BS bonus to ranged damage.',
            hasBenefit: true,
            fullName: 'Mighty Shot',
        },
        prerequisites: {
            hasAny: false,
            text: '',
            characteristics: [],
            skills: [],
            talents: [],
            hasText: false,
            hasCharacteristics: false,
            hasSkills: false,
            hasTalents: false,
            label: 'None',
        },
        modifierRows: [],
        canEdit: true,
        inEditMode: false,
        editable: true,
        isOwnedByActor: false,
        effects: [],
        tabs: {
            overview: {
                id: 'overview',
                tab: 'overview',
                group: 'primary',
                active: activeTab === 'overview',
                cssClass: activeTab === 'overview' ? 'active' : '',
            },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: activeTab === 'effects', cssClass: activeTab === 'effects' ? 'active' : '' },
            properties: {
                id: 'properties',
                tab: 'properties',
                group: 'primary',
                active: activeTab === 'properties',
                cssClass: activeTab === 'properties' ? 'active' : '',
            },
            description: {
                id: 'description',
                tab: 'description',
                group: 'primary',
                active: activeTab === 'description',
                cssClass: activeTab === 'description' ? 'active' : '',
            },
        },
        activeTab,
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/TalentSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const EditMode: Story = { render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })) };

export const RendersTalentName: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByRole('heading', { name: 'Mighty Shot' })).toBeTruthy();
    },
};

export const RendersEditImageAction: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="editImage"]');
        void expect(btn).toBeTruthy();
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};

/**
 * Regression coverage for issue #201.
 *
 * Asserts the compendium-render path of the talent sheet:
 *   1. The template parses (compiling it at module load would have already
 *      thrown if the `activeTab"overview"` typo were present — this story
 *      simply re-renders it inside a story so Storybook's static build covers
 *      the same surface, and the Playwright regression spec under
 *      `tests/storybook/issue-201-talent-compendium-render.spec.ts` can drive
 *      a real browser against the rendered DOM.
 *   2. Each of the four tab buttons (`overview`, `effects`, `properties`,
 *      `description`) is present in the DOM — proving every
 *      `(eq activeTab "<tab>")` token reached compile time correctly spaced.
 */
export const CompendiumRender: Story = {
    name: 'Issue 201 — Compendium Render',
    render: () => renderSheet(templateSrc, makeCtx({ inEditMode: false, editable: false, isCompendiumItem: true })),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // No parse error => rendered output contains the tab nav.
        void expect(storyCanvas.getByRole('heading', { name: 'Mighty Shot' })).toBeTruthy();
        for (const tabId of ['overview', 'effects', 'properties', 'description'] as const) {
            const button = canvasElement.querySelector(`button[data-tab="${tabId}"]`);
            void expect(button, `tab button [data-tab="${tabId}"] should render`).toBeTruthy();
            const panel = canvasElement.querySelector(`div[data-tab="${tabId}"]`);
            void expect(panel, `tab panel [data-tab="${tabId}"] should render`).toBeTruthy();
        }
    },
};

// ── Per-system homologation: all 7 game lines ────────────────────────────────
//
// The talent header/benefit headings carry per-system Tailwind variant classes
// gated on a `data-wh40k-system` ancestor. One story per game line stamps that
// ancestor so DH2-only theming assumptions surface across DH1 / RT / BC / OW /
// DW / IM (CLAUDE.md homologation rule). The rendered content is identical; the
// variant only changes which colour token cascades onto the heading.

/** Build a per-system story (explicit named exports keep Storybook's static scan happy). */
function perSystemStory(systemId: SystemId): Story {
    return {
        name: `Per-system — ${systemId.toUpperCase()}`,
        render: () => renderTalentForSystem(makeCtx(), systemId),
        play: ({ canvasElement }) => {
            const storyCanvas = within(canvasElement);
            void expect(storyCanvas.getByRole('heading', { name: 'Mighty Shot' })).toBeTruthy();
            // The system-stamped ancestor must be present for the variant to fire.
            const root = canvasElement.querySelector(`[data-wh40k-system="${systemId}"]`);
            void expect(root, `wrapper carries data-wh40k-system="${systemId}"`).toBeTruthy();
        },
    };
}

export const PerSystemDh2: Story = perSystemStory('dh2');
export const PerSystemDh1: Story = perSystemStory('dh1');
export const PerSystemRt: Story = perSystemStory('rt');
export const PerSystemBc: Story = perSystemStory('bc');
export const PerSystemOw: Story = perSystemStory('ow');
export const PerSystemDw: Story = perSystemStory('dw');
export const PerSystemIm: Story = perSystemStory('im');
