/**
 * Storybook stories for the OW Mounted Combat chat card (#159).
 * Covers the chat-card outcomes the runtime emits:
 *
 *   1. ChargeMounted       — full-action Charge with a Brutal Charge mount.
 *   2. MountedAttackHalf   — half-action saddle attack with a Steadfast mount.
 *   3. TrampleNoMount      — full-action Trample dispatched without a
 *                            mount link (edge case the catalogue renders
 *                            even though the panel disables the button).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsLib from 'handlebars';
import { renderTemplate as renderStoryTemplate } from '../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import cardSrc from './ow-mount-action-chat.hbs?raw';

initializeStoryHandlebars();

interface MountChatLink {
    mountId: string;
    traits: string[];
}

interface MountActionChatCtx {
    gameSystem: 'ow';
    actionId: string;
    actionNameKey: string;
    descriptionKey: string;
    timingKey: string;
    mount: MountChatLink | null;
}

const cardTpl = HbsLib.compile(cardSrc);

function renderCard(ctx: MountActionChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderStoryTemplate(cardTpl, ctx));
    return wrapper;
}

const meta: Meta<MountActionChatCtx> = {
    title: 'Chat/OwMountActionChat',
};
export default meta;
type Story = StoryObj<MountActionChatCtx>;

export const ChargeMounted: Story = {
    name: 'Charge — full action, mount has Brutal Charge',
    args: {
        gameSystem: 'ow',
        actionId: 'charge',
        actionNameKey: 'WH40K.OW.Mount.Action.Charge',
        descriptionKey: 'WH40K.OW.Mount.Description.Charge',
        timingKey: 'WH40K.OW.Mount.Timing.Full',
        mount: {
            mountId: 'Compendium.wh40k-rpg.ow-mounts.Actor.destrier-002',
            traits: ['quadruped', 'brutal-charge', 'unnatural-speed'],
        },
    },
    render: (args) => renderCard(args),
};

export const MountedAttackHalf: Story = {
    name: 'Mounted Attack — half action, mount has Steadfast',
    args: {
        gameSystem: 'ow',
        actionId: 'mounted-attack',
        actionNameKey: 'WH40K.OW.Mount.Action.MountedAttack',
        descriptionKey: 'WH40K.OW.Mount.Description.MountedAttack',
        timingKey: 'WH40K.OW.Mount.Timing.Half',
        mount: {
            mountId: 'Compendium.wh40k-rpg.ow-mounts.Actor.warhorse-001',
            traits: ['quadruped', 'steadfast', 'sure-footed'],
        },
    },
    render: (args) => renderCard(args),
};

export const TrampleNoMount: Story = {
    name: 'Trample — dispatched with no active mount link',
    args: {
        gameSystem: 'ow',
        actionId: 'trample',
        actionNameKey: 'WH40K.OW.Mount.Action.Trample',
        descriptionKey: 'WH40K.OW.Mount.Description.Trample',
        timingKey: 'WH40K.OW.Mount.Timing.Full',
        mount: null,
    },
    render: (args) => renderCard(args),
};
