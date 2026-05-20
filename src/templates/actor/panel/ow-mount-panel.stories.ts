/**
 * Storybook stories for the OW Mount panel (#159 — Hammer of the
 * Emperor §"MOUNTED COMBAT" / "MOUNT SPECIAL ACTIONS" / "MOUNT TRAITS",
 * hammer.md lines 4046-4260). Covers the three visual states an
 * operator needs to verify in review:
 *
 *   1. Unmounted             — no mount linked; trait badges absent;
 *                               action Issue buttons disabled.
 *   2. MountedWithTraits     — mount linked with several mechanical
 *                               trait badges; all action rows live.
 *   3. ChargingWithBrutal    — mount with Brutal Charge highlighted;
 *                               Charge row is the headline action.
 *
 * Every value is fixed for diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './ow-mount-panel.hbs?raw';

initializeStoryHandlebars();

interface MountTraitBadge {
    id: 'quadruped' | 'sure-footed' | 'steadfast' | 'unnatural-speed' | 'fearless' | 'brutal-charge';
    labelKey: string;
}

interface MountLink {
    mountId: string;
    mountName: string;
    traits: MountTraitBadge[];
}

interface MountedActionRow {
    actionId: 'charge' | 'trample' | 'run-down' | 'mounted-attack';
    nameKey: string;
    descriptionKey: string;
    timingKey: string;
    timing: 'full' | 'half' | 'reaction';
}

interface MountPanelCtx {
    mountPanel: {
        mount: MountLink | null;
        actions: MountedActionRow[];
    };
}

const panelTpl = Handlebars.compile(panelSrc);

const FOUR_ACTIONS: MountedActionRow[] = [
    {
        actionId: 'charge',
        nameKey: 'WH40K.OW.Mount.Action.Charge',
        descriptionKey: 'WH40K.OW.Mount.Description.Charge',
        timingKey: 'WH40K.OW.Mount.Timing.Full',
        timing: 'full',
    },
    {
        actionId: 'trample',
        nameKey: 'WH40K.OW.Mount.Action.Trample',
        descriptionKey: 'WH40K.OW.Mount.Description.Trample',
        timingKey: 'WH40K.OW.Mount.Timing.Full',
        timing: 'full',
    },
    {
        actionId: 'run-down',
        nameKey: 'WH40K.OW.Mount.Action.RunDown',
        descriptionKey: 'WH40K.OW.Mount.Description.RunDown',
        timingKey: 'WH40K.OW.Mount.Timing.Full',
        timing: 'full',
    },
    {
        actionId: 'mounted-attack',
        nameKey: 'WH40K.OW.Mount.Action.MountedAttack',
        descriptionKey: 'WH40K.OW.Mount.Description.MountedAttack',
        timingKey: 'WH40K.OW.Mount.Timing.Half',
        timing: 'half',
    },
];

function renderPanel(ctx: MountPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderTemplate(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<MountPanelCtx> = {
    title: 'Actor/Character/OwMountPanel',
};
export default meta;
type Story = StoryObj<MountPanelCtx>;

export const Unmounted: Story = {
    name: 'Unmounted — no mount link, Issue buttons disabled',
    args: {
        mountPanel: {
            mount: null,
            actions: FOUR_ACTIONS,
        },
    },
    render: (args) => renderPanel(args),
};

export const MountedWithTraits: Story = {
    name: 'Mounted with traits — Quadruped + Sure-Footed + Steadfast',
    args: {
        mountPanel: {
            mount: {
                mountId: 'Compendium.wh40k-rpg.ow-mounts.Actor.warhorse-001',
                mountName: 'Cavalry Warhorse',
                traits: [
                    { id: 'quadruped', labelKey: 'WH40K.OW.Mount.Trait.Quadruped' },
                    { id: 'sure-footed', labelKey: 'WH40K.OW.Mount.Trait.SureFooted' },
                    { id: 'steadfast', labelKey: 'WH40K.OW.Mount.Trait.Steadfast' },
                ],
            },
            actions: FOUR_ACTIONS,
        },
    },
    render: (args) => renderPanel(args),
};

export const ChargingWithBrutal: Story = {
    name: 'Charging with Brutal Charge — Charge headline, brutal-charge badge present',
    args: {
        mountPanel: {
            mount: {
                mountId: 'Compendium.wh40k-rpg.ow-mounts.Actor.destrier-002',
                mountName: 'Imperial Destrier',
                traits: [
                    { id: 'quadruped', labelKey: 'WH40K.OW.Mount.Trait.Quadruped' },
                    { id: 'brutal-charge', labelKey: 'WH40K.OW.Mount.Trait.BrutalCharge' },
                    { id: 'unnatural-speed', labelKey: 'WH40K.OW.Mount.Trait.UnnaturalSpeed' },
                    { id: 'fearless', labelKey: 'WH40K.OW.Mount.Trait.Fearless' },
                ],
            },
            actions: FOUR_ACTIONS,
        },
    },
    render: (args) => renderPanel(args),
};
