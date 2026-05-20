/**
 * Storybook stories for the Dark Pact tracker panel (issue #84).
 *
 * Renders the panel against a hand-crafted `system.pacts` context. Three
 * stories cover the visible states the panel must handle:
 *   1. SinglePact          — one undiscovered, payment-current pact.
 *   2. MultiPactMixed      — two pacts mixing discovered / not, paid / not,
 *                            and disposition at +2 vs -1 so the stepper
 *                            display can be eyeballed.
 *   3. PaymentLapsedEnemy  — one discovered, payment-LAPSED pact sitting at
 *                            disposition -3 (the floor enforced by
 *                            `adjustPactDisposition`).
 *
 * The companion e2e spec (`tests/e2e/dark-pact-panel.spec.ts`) creates a
 * dh2-character with two pacts in `system.pacts` and snaps the panel
 * against a live Foundry instance.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';
import panelSrc from '../../src/templates/actor/panel/dark-pact-panel.hbs?raw';

initializeStoryHandlebars();

// uuid-name resolution is a runtime concern (see uuid-name-cache.ts); for
// the static story we register a passthrough that returns the literal UUID
// segment after the last `.` so rows show a human-recognisable label.
if (!Handlebars.helpers['uuid-name']) {
    Handlebars.registerHelper('uuid-name', (uuid: unknown) => {
        const s = String(uuid ?? '');
        const last = s.split('.').pop() ?? s;
        return last || 'Unknown Pact';
    });
}

interface PactRow {
    pactUuid: string;
    discovered: boolean;
    disposition: number;
    paymentCurrent: boolean;
    boon?: string;
    bane?: string;
}

interface PanelContext {
    system: { pacts: PactRow[] };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: PanelContext): HTMLElement {
    return renderTemplate(panelTpl, ctx);
}

const meta: Meta<PanelContext> = {
    title: 'Actor/Panels/DarkPactPanel',
};
export default meta;
type Story = StoryObj<PanelContext>;

export const SinglePact: Story = {
    name: 'Single pact — undiscovered, payment current',
    args: {
        system: {
            pacts: [
                {
                    pactUuid: 'Compendium.wh40k-rpg.dh2-pacts.Item.PactOfHungerForKnowledge',
                    discovered: false,
                    disposition: 0,
                    paymentCurrent: true,
                    boon: '+10 to all Lore tests for one scene.',
                    bane: 'Forfeit one Fate point on next failed Willpower test.',
                },
            ],
        },
    },
    render: (args) => renderPanel(args),
};

export const MultiPactMixed: Story = {
    name: 'Multi-pact — mixed discovered / disposition / payment states',
    args: {
        system: {
            pacts: [
                {
                    pactUuid: 'Compendium.wh40k-rpg.dh2-pacts.Item.PactOfRusticHands',
                    discovered: true,
                    disposition: 2,
                    paymentCurrent: true,
                    boon: 'Mechanicus-blessed weapon ignores Primitive.',
                    bane: 'Bleeds oil from one new wound each session.',
                },
                {
                    pactUuid: 'Compendium.wh40k-rpg.dh2-pacts.Item.PactOfBlackSilence',
                    discovered: false,
                    disposition: -1,
                    paymentCurrent: false,
                    boon: 'Silenced for one scene.',
                    bane: 'Cannot Vocalize psychic powers until paid.',
                },
            ],
        },
    },
    render: (args) => renderPanel(args),
};

export const PaymentLapsedEnemy: Story = {
    name: 'Payment lapsed, discovered, disposition at -3 floor',
    args: {
        system: {
            pacts: [
                {
                    pactUuid: 'Compendium.wh40k-rpg.dh2-pacts.Item.PactOfFlensingTeeth',
                    discovered: true,
                    disposition: -3,
                    paymentCurrent: false,
                    boon: '+1 damage on melee criticals.',
                    bane: 'Daemon hunts the warband across one session per missed payment.',
                },
            ],
        },
    },
    render: (args) => renderPanel(args),
};
