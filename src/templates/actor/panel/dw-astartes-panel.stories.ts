/**
 * Storybook stories for the Deathwatch Astartes baseline panel (#167).
 * Covers the three visual states an operator needs to verify in review:
 *
 *   1. AllImplants    — every Battle-Brother implant present, including
 *                       the Black Carapace power-armour interface banner.
 *   2. MissingSome    — partial set; Black Carapace and a few sense
 *                       implants are absent, so the interface banner is
 *                       suppressed and the missing badges render dim.
 *   3. JustBase       — only the three Unnatural-feeding implants
 *                       (Ossmodula / Biscopea / Haemastamen) are present
 *                       — the baseline a fresh Marine pre-Initiation
 *                       trial would have.
 *
 * No randomness — every value is fixed for diff stability per the
 * "Seeded RNG in stories" rule in CLAUDE.md.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsLib from 'handlebars';
import { renderTemplate as renderStoryTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import {
    ASTARTES_IMPLANTS,
    IMPLANT_EFFECTS,
    astartesStrengthBonus,
    astartesToughnessBonus,
    hasBlackCarapace,
    type AstartesImplantId,
    type ImplantMechanicCategory,
} from '../../../module/rules/dw-astartes.ts';
import panelSrc from './dw-astartes-panel.hbs?raw';

initializeStoryHandlebars();

interface AstartesPanelImplantCtx {
    id: AstartesImplantId;
    nameKey: string;
    categoryKey: string;
    has: boolean;
}

interface AstartesPanelCtx {
    astartesPanel: {
        implants: AstartesPanelImplantCtx[];
        strengthBonus: number;
        toughnessBonus: number;
        hasBlackCarapace: boolean;
    };
}

/**
 * kebab-case implant id → PascalCase i18n suffix. Mirrors the langpack
 * shape (`WH40K.DW.Astartes.Implant.<Name>.Name`) so the orchestrator's
 * context builder and these stories produce the same keys.
 */
const IMPLANT_NAME_KEY: Record<AstartesImplantId, string> = {
    'secondary-heart': 'SecondaryHeart',
    'ossmodula': 'Ossmodula',
    'biscopea': 'Biscopea',
    'haemastamen': 'Haemastamen',
    'larramans-organ': 'LarramansOrgan',
    'catalepsean-node': 'CatalepseanNode',
    'preomnor': 'Preomnor',
    'omophagea': 'Omophagea',
    'multi-lung': 'MultiLung',
    'occulobe': 'Occulobe',
    'lymans-ear': 'LymansEar',
    'sus-an-membrane': 'SusAnMembrane',
    'melanchromic-organ': 'MelanchromicOrgan',
    'oolitic-kidney': 'OoliticKidney',
    'neuroglottis': 'Neuroglottis',
    'mucranoid': 'Mucranoid',
    'betchers-gland': 'BetchersGland',
    'progenoids': 'Progenoids',
    'black-carapace': 'BlackCarapace',
};

/**
 * Mechanic category → langpack key suffix. Implants without a discrete
 * mechanic (Ossmodula / Biscopea / Haemastamen) tag as "Baseline" since
 * they feed directly into the Unnatural Str/Tgh multipliers rather than
 * producing a category-tagged effect.
 */
const CATEGORY_KEY: Record<ImplantMechanicCategory, string> = {
    'auto-heal': 'AutoHeal',
    'immune-poison': 'ImmunePoison',
    'immune-suspended-animation': 'ImmuneSuspendedAnimation',
    'enhanced-vision': 'EnhancedVision',
    'enhanced-hearing': 'EnhancedHearing',
    'enhanced-smell': 'EnhancedSmell',
    'enhanced-taste': 'EnhancedTaste',
    'environmental': 'Environmental',
    'spit-acid': 'SpitAcid',
    'gene-seed-organ': 'GeneSeedOrgan',
    'power-armor-interface': 'PowerArmorInterface',
};

function buildImplantCtx(present: ReadonlySet<AstartesImplantId>): AstartesPanelImplantCtx[] {
    return ASTARTES_IMPLANTS.map((id) => {
        const effect = IMPLANT_EFFECTS[id];
        const categorySuffix = effect.mechanic ? CATEGORY_KEY[effect.mechanic] : 'Baseline';
        return {
            id,
            nameKey: `WH40K.DW.Astartes.Implant.${IMPLANT_NAME_KEY[id]}.Name`,
            categoryKey: `WH40K.DW.Astartes.Category.${categorySuffix}`,
            has: present.has(id),
        };
    });
}

function buildCtx(presentIds: ReadonlyArray<AstartesImplantId>, rawSB: number, rawTB: number): AstartesPanelCtx {
    const present = new Set(presentIds);
    return {
        astartesPanel: {
            implants: buildImplantCtx(present),
            strengthBonus: astartesStrengthBonus(rawSB),
            toughnessBonus: astartesToughnessBonus(rawTB),
            hasBlackCarapace: hasBlackCarapace(presentIds),
        },
    };
}

const panelTpl = HbsLib.compile(panelSrc);

function renderPanel(ctx: AstartesPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderStoryTemplate(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<AstartesPanelCtx> = {
    title: 'Actor/Character/DwAstartesPanel',
};
export default meta;
type Story = StoryObj<AstartesPanelCtx>;

const ALL_IMPLANTS = [...ASTARTES_IMPLANTS];

const MISSING_SOME: AstartesImplantId[] = [
    'secondary-heart',
    'ossmodula',
    'biscopea',
    'haemastamen',
    'larramans-organ',
    'catalepsean-node',
    'preomnor',
    'multi-lung',
    'occulobe',
    'sus-an-membrane',
    'melanchromic-organ',
    'oolitic-kidney',
    'progenoids',
    // omophagea, lymans-ear, neuroglottis, mucranoid, betchers-gland,
    // black-carapace — all absent
];

const JUST_BASE: AstartesImplantId[] = ['ossmodula', 'biscopea', 'haemastamen'];

export const AllImplants: Story = {
    name: 'All implants — full Battle-Brother, Black Carapace active',
    args: buildCtx(ALL_IMPLANTS, 5, 5),
    render: (args) => renderPanel(args),
};

export const MissingSome: Story = {
    name: 'Missing some — partial loadout, no Black Carapace, six gaps',
    args: buildCtx(MISSING_SOME, 4, 5),
    render: (args) => renderPanel(args),
};

export const JustBase: Story = {
    name: 'Just base — only the three Unnatural-feeding implants present',
    args: buildCtx(JUST_BASE, 4, 4),
    render: (args) => renderPanel(args),
};
