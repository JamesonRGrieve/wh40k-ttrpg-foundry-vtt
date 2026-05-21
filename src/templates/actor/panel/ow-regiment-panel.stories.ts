/**
 * Storybook stories for the Only War Regiment Creation panel (#151).
 *
 * Covers three operator-relevant visual states:
 *
 *   1. Empty           — fresh OW PC, 0 / 12 points spent, 0 / 30 kit.
 *   2. PartialSelection — mid-character-build, 7 / 12 points across a
 *                          few categories (over/under flagged).
 *   3. Valid12Pt        — completed Regiment Creation, exactly 12 spent,
 *                          full kit allocated.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsStory from 'handlebars';
import { renderTemplate as renderStoryTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './ow-regiment-panel.hbs?raw';

initializeStoryHandlebars();

interface RegimentPanelCtx {
    regimentPanel: {
        regiment: {
            spent: number;
            remaining: number;
            valid: boolean;
            budget: number;
            perCategory: {
                homeWorld: number;
                commandingOfficer: number;
                regimentType: number;
                trainingDoctrine: number;
                specialEquipmentDoctrine: number;
                favouredWeapons: number;
            };
        };
        kit: {
            spent: number;
            remaining: number;
            valid: boolean;
            budget: number;
        };
    };
}

const panelTpl = HbsStory.compile(panelSrc);

function renderPanel(ctx: RegimentPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderStoryTemplate(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<RegimentPanelCtx> = {
    title: 'Actor/Character/OwRegimentPanel',
};
export default meta;
type Story = StoryObj<RegimentPanelCtx>;

export const Empty: Story = {
    name: 'Empty — no Regiment selections made yet',
    args: {
        regimentPanel: {
            regiment: {
                spent: 0,
                remaining: 12,
                valid: false,
                budget: 12,
                perCategory: {
                    homeWorld: 0,
                    commandingOfficer: 0,
                    regimentType: 0,
                    trainingDoctrine: 0,
                    specialEquipmentDoctrine: 0,
                    favouredWeapons: 0,
                },
            },
            kit: {
                spent: 0,
                remaining: 30,
                valid: true,
                budget: 30,
            },
        },
    },
    render: (args) => renderPanel(args),
};

export const PartialSelection: Story = {
    name: 'Partial — 7 / 12 spent, kit half-filled',
    args: {
        regimentPanel: {
            regiment: {
                spent: 7,
                remaining: 5,
                valid: false,
                budget: 12,
                perCategory: {
                    homeWorld: 3,
                    commandingOfficer: 2,
                    regimentType: 0,
                    trainingDoctrine: 1,
                    specialEquipmentDoctrine: 0,
                    favouredWeapons: 1,
                },
            },
            kit: {
                spent: 14,
                remaining: 16,
                valid: true,
                budget: 30,
            },
        },
    },
    render: (args) => renderPanel(args),
};

export const Valid12Pt: Story = {
    name: 'Valid — exactly 12 spent and kit fully allocated',
    args: {
        regimentPanel: {
            regiment: {
                spent: 12,
                remaining: 0,
                valid: true,
                budget: 12,
                perCategory: {
                    homeWorld: 3,
                    commandingOfficer: 2,
                    regimentType: 2,
                    trainingDoctrine: 2,
                    specialEquipmentDoctrine: 2,
                    favouredWeapons: 1,
                },
            },
            kit: {
                spent: 30,
                remaining: 0,
                valid: true,
                budget: 30,
            },
        },
    },
    render: (args) => renderPanel(args),
};
