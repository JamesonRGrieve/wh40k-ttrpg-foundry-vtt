/**
 * Auspex scan GM card (#759): whispered to the GM when a scan succeeds, listing each
 * contact. The context comes from the same `scanCardContext` the canvas uses, with
 * the langpack lookup in place of Foundry's `t`.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { renderSheet } from '../../../stories/test-helpers';
import { scanCardContext, type Translate } from '../../module/canvas/auspex-scan-view.ts';
import type { ScanContact } from '../../module/rules/auspex-scan.ts';
import cardSrc from './auspex-scan-chat.hbs?raw';

const meta: Meta = { title: 'Chat / Auspex Scan (#759)' };
export default meta;
type Story = StoryObj;

/** The langpack lookup, substituting `{name}` placeholders. */
const translate: Translate = (key, params = {}) => {
    let text = localizeKey(key);
    for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
    return text;
};

const CONTACTS: ScanContact[] = [
    { id: 'a', name: 'Corpse-Crawler', kind: 'life', distance: 4.5, bearing: 90, center: { x: 0, y: 0 } },
    { id: 'b', name: 'Tawny Turdster', kind: 'life', distance: 12, bearing: 180, center: { x: 0, y: 0 } },
    { id: 'c', name: 'Servitor Crawler', kind: 'machine', distance: 31.2, bearing: 270, center: { x: 0, y: 0 } },
];

/** Three contacts, nearest first: two life signs and a machine, each with distance and bearing. */
export const Contacts: Story = {
    render: () => renderSheet(cardSrc, scanCardContext('Brother Kael', 'Auspex/Scanner', CONTACTS, translate)),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(localizeKey('WH40K.Auspex.ChatTitle'))).toBeTruthy();
        await expect(view.getByText('Brother Kael scanned with Auspex/Scanner: 3 contact(s).')).toBeTruthy();
        const rows = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-auspex-contact]'));
        await expect(rows.map((row) => row.dataset['auspexContact'])).toEqual(['life', 'life', 'machine']);
        await expect(view.getByText('4.5 m, bearing 90°')).toBeTruthy();
        await expect(view.getByText('Machine')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-auspex-none]')).toBeNull();
    },
};

/** A scan that finds nothing says so. */
export const NothingInReach: Story = {
    render: () => renderSheet(cardSrc, scanCardContext('Brother Kael', 'Auspex/Scanner', [], translate)),
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText(localizeKey('WH40K.Auspex.NoContacts'))).toBeTruthy();
        await expect(canvasElement.querySelectorAll('[data-auspex-contact]').length).toBe(0);
    },
};
