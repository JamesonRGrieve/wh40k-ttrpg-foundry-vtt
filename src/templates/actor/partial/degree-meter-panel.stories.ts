import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderTemplate, mockActor } from '../../../../stories/mocks';
import { withSystem, type SystemId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();

// degree-meter-panel composes vital-panel-shell, vital-quick-controls,
// vital-progress-bar, vital-edit-input, vital-quick-adjust, and section-card.
// Several runtime helpers it transitively expects aren't part of the shared
// story helper bundle — register reasonable stubs here.
function ensureHelpers() {
    if (!Handlebars.helpers.range) {
        Handlebars.registerHelper('range', (start: number, end: number) => {
            const out: number[] = [];
            for (let i = Number(start); i <= Number(end); i++) out.push(i);
            return out;
        });
    }
    if (!Handlebars.helpers.any) {
        Handlebars.registerHelper('any', (list: unknown, prop: string) => {
            if (!Array.isArray(list)) return false;
            return list.some((entry) => Boolean((entry as Record<string, unknown>)?.[prop]));
        });
    }
    if (!Handlebars.helpers.countType) {
        Handlebars.registerHelper('countType', (list: unknown, prop: string) => {
            if (!Array.isArray(list)) return 0;
            return list.filter((entry) => Boolean((entry as Record<string, unknown>)?.[prop])).length;
        });
    }
    if (!Handlebars.helpers.hideIfNot) {
        Handlebars.registerHelper('hideIfNot', (check: unknown) =>
            check ? '' : new Handlebars.SafeString('style="display:none"'),
        );
    }
}

ensureHelpers();

const meta: Meta = {
    title: 'Actor/Partials/DegreeMeterPanel',
};
export default meta;

type Story = StoryObj;

const wrapperTemplate = Handlebars.compile(
    `{{> systems/wh40k-rpg/templates/actor/partial/degree-meter-panel
        key=key label=label icon=icon actor=actor system=system value=value
        sourceValue=sourceValue field=field cssPrefix=cssPrefix
        gradientClass=gradientClass decTitle=decTitle incTitle=incTitle
        modifierWord=modifierWord editTitle=editTitle editLabel=editLabel
        meta=meta thresholds=thresholds activeWarning=activeWarning
        itemFlag=itemFlag itemIcon=itemIcon itemPlural=itemPlural
        itemSingular=itemSingular dropType=dropType dropLabel=dropLabel
        dropCompactLabel=dropCompactLabel infoIcon=infoIcon
        infoIntro=infoIntro degreeInfoTitle=degreeInfoTitle
        degreeInfo=degreeInfo}}`,
);

interface CorruptionLikeContext {
    key: string;
    label: string;
    icon: string;
    actor: ReturnType<typeof mockActor>;
    system: ReturnType<typeof mockActor>['system'];
    value: number;
    sourceValue: number;
    field: string;
    cssPrefix: string;
    gradientClass: string;
    decTitle: string;
    incTitle: string;
    modifierWord: string;
    editTitle: string;
    editLabel: string;
    meta: { degreeLabel: string; degreeClass: string; modifier: string; modifierLabel?: string };
    thresholds: Array<{ at: number; label: string; title: string }>;
    activeWarning?: { icon: string; text: string; bannerClass: string } | false;
    itemFlag: string;
    itemIcon: string;
    itemPlural: string;
    itemSingular: string;
    dropType: string;
    dropLabel: string;
    dropCompactLabel: string;
    infoIcon: string;
    infoIntro: string;
    degreeInfoTitle: string;
    degreeInfo: Array<{ label: string; range: string; description: string; extraClass?: string }>;
}

function corruptionContext(value: number, systemId: SystemId): CorruptionLikeContext {
    const baseActor = mockActor({ system: { corruption: { value, max: 100 } } });
    const actor = withSystem(baseActor, systemId);
    return {
        key: 'corruption',
        label: 'Corruption',
        icon: 'fa-skull',
        actor,
        system: actor.system,
        value,
        sourceValue: value,
        field: 'system.corruption',
        cssPrefix: 'wh40k-corruption',
        gradientClass: 'tw-from-green-700 tw-to-crimson-dark',
        decTitle: '−1',
        incTitle: '+1',
        modifierWord: 'Modifier:',
        editTitle: 'Edit Corruption',
        editLabel: 'Corruption Points (0-100)',
        meta: {
            degreeLabel: value >= 90 ? 'Profane' : value >= 60 ? 'Debased' : value >= 30 ? 'Soiled' : value > 0 ? 'Tainted' : 'Pure',
            degreeClass: value >= 90 ? 'wh40k-degree-profane' : value >= 60 ? 'wh40k-degree-debased' : 'wh40k-degree-soiled',
            modifier: value >= 60 ? '−20' : value >= 30 ? '−10' : '0',
        },
        thresholds: [
            { at: 30, label: '30', title: 'Soiled threshold' },
            { at: 60, label: '60', title: 'Debased threshold' },
            { at: 90, label: '90', title: 'Profane threshold' },
        ],
        activeWarning:
            value >= 60
                ? {
                      icon: 'fa-skull-crossbones',
                      text: 'The Warp tugs at your soul.',
                      bannerClass: 'tw-bg-[rgba(139,69,19,0.2)] tw-border-2 tw-border-[rgba(139,69,19,0.5)] tw-text-warning',
                  }
                : false,
        itemFlag: 'isMalignancy',
        itemIcon: 'fa-biohazard',
        itemPlural: 'Malignancies',
        itemSingular: 'Malignancy',
        dropType: 'malignancy',
        dropLabel: 'Drop a malignancy here',
        dropCompactLabel: 'Add another',
        infoIcon: 'fa-book-dead',
        infoIntro: 'Corruption corrodes the soul.',
        degreeInfoTitle: 'Corruption Degrees',
        degreeInfo: [
            { label: 'Pure', range: '0', description: 'Untainted soul.' },
            { label: 'Tainted', range: '1-30', description: 'A flicker of the Warp.' },
            { label: 'Soiled', range: '31-60', description: 'Visible corruption.' },
            { label: 'Debased', range: '61-90', description: 'Marked for damnation.' },
            { label: 'Profane', range: '91-99', description: 'Nearly fallen.' },
            { label: 'Damned', range: '100', description: 'Lost forever.', extraClass: 'wh40k-degree-damned' },
        ],
    };
}

function insanityContext(value: number, systemId: SystemId): CorruptionLikeContext {
    const ctx = corruptionContext(value, systemId);
    return {
        ...ctx,
        key: 'insanity',
        label: 'Insanity',
        icon: 'fa-brain',
        cssPrefix: 'wh40k-insanity',
        field: 'system.insanity',
        editTitle: 'Edit Insanity',
        editLabel: 'Insanity Points (0-100)',
        gradientClass: 'tw-from-violet-700 tw-to-pink-500',
        itemFlag: 'isMentalDisorder',
        itemIcon: 'fa-brain',
        itemPlural: 'Mental Disorders',
        itemSingular: 'Mental Disorder',
        dropType: 'mentalDisorder',
        dropLabel: 'Drop a disorder here',
        dropCompactLabel: 'Add another',
        infoIcon: 'fa-head-side-virus',
        infoIntro: 'A frayed mind invites the Warp.',
        degreeInfoTitle: 'Insanity Degrees',
    };
}

export const CorruptionDH2Pure: Story = {
    name: 'Corruption · DH2 · Pure',
    render: () => renderTemplate(wrapperTemplate, corruptionContext(0, 'dh2')),
    play: async ({ canvasElement }) => {
        // No active warning at value=0.
        const banner = canvasElement.querySelector('.tw-text-warning, .tw-text-crimson, .tw-text-crimson-light');
        expect(banner).toBeNull();
    },
};

export const CorruptionDH2Soiled: Story = {
    name: 'Corruption · DH2 · Soiled (45)',
    render: () => renderTemplate(wrapperTemplate, corruptionContext(45, 'dh2')),
};

export const CorruptionDH2Debased: Story = {
    name: 'Corruption · DH2 · Debased (75)',
    render: () => renderTemplate(wrapperTemplate, corruptionContext(75, 'dh2')),
    play: async ({ canvasElement }) => {
        // Warning banner is rendered when value >= 60.
        const icon = canvasElement.querySelector('.fa-skull-crossbones');
        expect(icon).toBeTruthy();
    },
};

export const InsanityDH2: Story = {
    name: 'Insanity · DH2 · Mid (50)',
    render: () => renderTemplate(wrapperTemplate, insanityContext(50, 'dh2')),
};

export const CorruptionIM: Story = {
    name: 'Corruption · IM · Mid (40)',
    render: () => renderTemplate(wrapperTemplate, corruptionContext(40, 'im')),
};

export const CorruptionRT: Story = {
    name: 'Corruption · RT · Profane (95)',
    render: () => renderTemplate(wrapperTemplate, corruptionContext(95, 'rt')),
};
