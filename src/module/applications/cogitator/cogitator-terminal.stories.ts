import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/applications/cogitator-terminal.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

/** One index row as the template consumes it (mirrors TerminalIndexEntry). */
interface IndexEntry {
    uuid: string;
    label: string;
    accessible: boolean;
    active: boolean;
}

interface Args {
    terminalTitle: string;
    hasRecords: boolean;
    index: IndexEntry[];
    activeName: string | null;
    restricted: boolean;
    bodyHtml: string | null;
}

// Illustrative records only — the terminal is content-agnostic; these stand in for
// whatever Items a GM curates into a terminal folder.
const SAMPLE_INDEX: IndexEntry[] = [
    { uuid: 'Item.rec1', label: 'Medicae Record 04-A', accessible: true, active: true },
    { uuid: 'Item.rec2', label: 'Transfer Manifest 70Y', accessible: true, active: false },
    { uuid: 'Item.rec3', label: '▓ RESTRICTED ▓', accessible: false, active: false },
];

const SAMPLE_BODY =
    '<p>Attending medicae logged an incidental finding. Cross-reference <a class="content-link" data-uuid="Item.rec2">Transfer Manifest 70Y</a>.</p>';

const meta = {
    title: 'Applications/CogitatorTerminal',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        terminalTitle: 'Medicae Archive Cogitator',
        hasRecords: true,
        index: SAMPLE_INDEX,
        activeName: 'Medicae Record 04-A',
        restricted: false,
        bodyHtml: SAMPLE_BODY,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** An open record with an in-terminal cross-link and a restricted sibling in the index. */
export const ViewingRecord: Story = {
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // Accessible records render as clickable index buttons; the restricted one does not.
        const buttons = canvasElement.querySelectorAll('button[data-action="selectRecord"]');
        void expect(buttons.length).toBe(2);
        void expect(storyCanvas.getByText('▓ RESTRICTED ▓')).toBeTruthy();
        // The active record body renders (enriched HTML passed through).
        void expect(storyCanvas.getByText('Medicae Record 04-A')).toBeTruthy();
    },
};

/** A record the viewer lacks clearance for → REDACTED body, content never rendered. */
export const RestrictedRecord: Story = {
    args: {
        activeName: '▓ RESTRICTED ▓',
        restricted: true,
        bodyHtml: null,
    },
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('.wh40k-cog-content')).toBeNull();
        void expect(canvasElement.textContent).toContain('Record sealed');
    },
};

/** No record selected yet — the landing / boot screen. */
export const Landing: Story = {
    args: {
        activeName: null,
        restricted: false,
        bodyHtml: null,
    },
};

/** An empty terminal (folder with no records). */
export const Empty: Story = {
    args: {
        hasRecords: false,
        index: [],
        activeName: null,
        bodyHtml: null,
    },
};

/** Per-system accent: the title tints by active game line (data-wh40k-system on an ancestor). */
export const ImperiumMaledictumAccent: Story = {
    render: (args) => {
        const wrapper = document.createElement('div');
        wrapper.dataset['wh40kSystem'] = 'im';
        wrapper.appendChild(renderSheet(templateSrc, { ...args }));
        return wrapper;
    },
};
