/**
 * Render tests for the trade UI templates. These compile the actual `.hbs`
 * with the same Handlebars helper set Storybook uses, so a template/helper
 * regression fails here (fast) instead of only in the Playwright story run.
 */

import { describe, expect, it } from 'vitest';
import approvalSrc from '../src/templates/dialogs/transaction-approval-dialog.hbs?raw';
import requestSrc from '../src/templates/dialogs/transaction-request-dialog.hbs?raw';
import { renderSheet } from '../stories/test-helpers';

// Route both trade dialogs through the shared renderSheet helper (#269) — the prior
// HB.compile + renderTemplate was identical to renderSheet for these sources.
const compile = (source: string, context: object): HTMLElement => renderSheet(source, context);

const baseRequestCtx = {
    hasSources: true,
    selectedSource: { name: 'Black Market Contact' },
    sources: [
        { id: 'src-a', name: 'Inquisitorial Armoury', modeLabel: 'Requisition', selected: true },
        { id: 'src-b', name: 'Black Market Contact', modeLabel: 'Barter' },
    ],
    items: [
        { id: 'item-bolt', name: 'Bolt rounds', type: 'ammunition', quantity: 24, cost: 800 },
        { id: 'item-stub', name: 'Stub revolver', type: 'weapon', quantity: 1, cost: 250, selected: true },
    ],
};

describe('transaction-request-dialog template', () => {
    it('renders the two-column transfer layout with selectable source stock', () => {
        const el = compile(requestSrc, baseRequestCtx);
        const rows = el.querySelectorAll('[data-action="selectItem"]');
        expect(rows).toHaveLength(2);
        expect(el.querySelector('[data-item-id="item-stub"]')).not.toBeNull();
        expect(el.querySelector('[name="sourceId"]')).not.toBeNull();
        // No item picked yet → purchase pane shows the prompt, not the request button.
        expect(el.querySelector('[data-action="requestApproval"]')).toBeNull();
    });

    it('shows the quote and influence-burn input when a barter item is selected', () => {
        const el = compile(requestSrc, {
            ...baseRequestCtx,
            selectedItem: { id: 'item-stub', name: 'Stub revolver', type: 'weapon', quantity: 1, cost: 250 },
            quantity: 1,
            isBarter: true,
            influenceBurn: 2,
            quote: {
                mode: 'barter',
                baseCost: 250,
                finalCost: 200,
                resourceLabel: 'Throne Gelt',
                availableResource: 1000,
                remainingResource: 800,
                remainingInfluence: 3,
                allowInfluenceBurn: true,
                dispositionAttitude: 'hostile',
                stockAvailable: true,
                canAfford: true,
                adjustments: [{ label: 'Influence burn (2 spent)', value: -50 }],
            },
        });
        expect(el.querySelector('[name="influenceBurn"]')).not.toBeNull();
        expect(el.querySelector('[name="quantity"]')).not.toBeNull();
        expect(el.querySelector('[data-action="requestApproval"]')).not.toBeNull();
        expect(el.textContent).toContain('hostile');
    });

    it('hides the influence-burn input when the quote forbids it', () => {
        const el = compile(requestSrc, {
            ...baseRequestCtx,
            selectedItem: { id: 'item-stub', name: 'Stub revolver', type: 'weapon', quantity: 1, cost: 250 },
            quantity: 1,
            quote: {
                mode: 'barter',
                baseCost: 250,
                finalCost: 250,
                resourceLabel: 'Influence',
                availableResource: 50,
                remainingResource: 0,
                allowInfluenceBurn: false,
                stockAvailable: true,
                canAfford: false,
                adjustments: [],
            },
        });
        expect(el.querySelector('[name="influenceBurn"]')).toBeNull();
        expect(el.textContent).toContain('cannot currently afford');
    });

    it('renders the no-sources message when none are configured', () => {
        const el = compile(requestSrc, { hasSources: false, sources: [], items: [] });
        expect(el.querySelector('[data-action="selectItem"]')).toBeNull();
        expect(el.textContent).toContain('No barter or requisition sources');
    });
});

describe('transaction-approval-dialog template', () => {
    const approvalCtx = {
        summary: 'Trooper requests 2x Lasgun from Quartermaster.',
        modeLabel: 'Barter',
        gmModifierPercent: 0,
        estimatedFinal: 200,
        hasAdjustments: true,
        adjustments: [
            { label: 'Disposition: friendly', value: -30, positive: false },
            { label: 'Influence burn (2 spent)', value: -40, positive: false },
        ],
        quote: { baseCost: 200, finalCost: 130, resourceLabel: 'Throne Gelt', influenceBurn: 2 },
    };

    it('exposes approve/reject actions and the GM modifier input', () => {
        const el = compile(approvalSrc, approvalCtx);
        expect(el.querySelector('[data-action="approve"]')).not.toBeNull();
        expect(el.querySelector('[data-action="reject"]')).not.toBeNull();
        expect(el.querySelector('[name="gmModifierPercent"]')).not.toBeNull();
        expect(el.textContent).toContain('Trooper requests');
    });

    it('renders the no-adjustments state', () => {
        const el = compile(approvalSrc, { ...approvalCtx, hasAdjustments: false, adjustments: [] });
        expect(el.querySelector('[data-action="approve"]')).not.toBeNull();
    });
});
