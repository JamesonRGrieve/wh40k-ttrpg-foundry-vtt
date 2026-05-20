/**
 * Stories for EndeavourSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { randomId, seedRandom } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/item/item-endeavour-sheet.hbs?raw';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0xe7de8a04);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('endeavour', rng);
    const objectives = [
        { name: 'Make landfall on Solenne Minoris', description: '', complete: true, ap: 1 },
        { name: 'Open the archive', description: '', complete: false, ap: 1 },
        { name: 'Extract the cipher', description: '', complete: false, ap: 2 },
    ];
    const apEarned = objectives.filter((o) => o.complete).reduce((sum, o) => sum + o.ap, 0);
    const apRequired = objectives.reduce((sum, o) => sum + o.ap, 0);
    const pctComplete = apRequired > 0 ? Math.round((apEarned / apRequired) * 100) : 0;
    const item = mockItem({
        _id: id,
        id,
        name: 'Recover the Lathe Records',
        type: 'endeavour',
        system: {
            apEarned,
            apRequired,
            objectives,
            reward: { profitFactor: 3, narrative: 'Acolyte favour from the Mechanicus contact.' },
            isComplete: apRequired > 0 && apEarned >= apRequired,
            pctComplete,
            description: { value: '', chat: '', summary: '' },
        },
    });
    return {
        item,
        system: item.system,
        canEdit: true,
        inEditMode: false,
        editable: true,
        tabs: {
            details: { id: 'details', tab: 'details', group: 'primary', active: true, cssClass: 'active', label: 'WH40K.Endeavours.Header' },
            objectives: { id: 'objectives', tab: 'objectives', group: 'primary', active: false, cssClass: '', label: 'WH40K.Endeavours.Objectives' },
            description: { id: 'description', tab: 'description', group: 'primary', active: false, cssClass: '', label: 'WH40K.Endeavours.DescriptionHeader' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/EndeavourSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderTemplate(compiled, makeCtx()) };

export const RendersProgressBar: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const bar = canvasElement.querySelector('[data-testid="endeavour-progress-bar"]');
        expect(bar).toBeTruthy();
        const pct = bar?.getAttribute('aria-valuenow');
        expect(pct).not.toBeNull();
        expect(Number(pct)).toBeGreaterThan(0);
    },
};

export const RendersObjectiveRows: Story = {
    render: () =>
        renderTemplate(
            compiled,
            makeCtx({
                tabs: {
                    details: { id: 'details', tab: 'details', group: 'primary', active: false, cssClass: '', label: 'WH40K.Endeavours.Header' },
                    objectives: {
                        id: 'objectives',
                        tab: 'objectives',
                        group: 'primary',
                        active: true,
                        cssClass: 'active',
                        label: 'WH40K.Endeavours.Objectives',
                    },
                    description: {
                        id: 'description',
                        tab: 'description',
                        group: 'primary',
                        active: false,
                        cssClass: '',
                        label: 'WH40K.Endeavours.DescriptionHeader',
                    },
                },
            }),
        ),
    play: async ({ canvasElement }) => {
        const rows = within(canvasElement).queryAllByTestId('endeavour-objective-row');
        expect(rows.length).toBe(3);
    },
};
