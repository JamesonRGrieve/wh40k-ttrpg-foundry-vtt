/**
 * Event Tracker auto-resolution chat card (#591) — whispered to the GM when a
 * completion trigger resolves an event. One story per trigger kind, with the
 * detail line built from the real langpack keys the watcher formats.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { renderSheet } from '../../../stories/test-helpers';
import type { I18nKey } from '../../module/types/i18n-keys';
import cardSrc from './event-auto-resolved-chat.hbs?raw';

const meta: Meta = { title: 'Chat / Event Auto-Resolved (#591)' };
export default meta;
type Story = StoryObj;

/** en.json-backed stand-in for `t()`, substituting `{name}` placeholders. */
function translate(key: I18nKey, data: Record<string, string>): string {
    let text = localizeKey(key);
    for (const [name, value] of Object.entries(data)) text = text.replaceAll(`{${name}}`, value);
    return text;
}

function card(eventName: string, detail: string): HTMLElement {
    return renderSheet(cardSrc, { eventName, detail });
}

async function assertCard(canvasElement: HTMLElement, eventName: string, detail: string): Promise<void> {
    const scope = within(canvasElement);
    await expect(scope.getByText(localizeKey('WH40K.EventTracker.Auto.ChatTitle'))).toBeTruthy();
    await expect(scope.getByText(eventName)).toBeTruthy();
    await expect(scope.getByText(detail)).toBeTruthy();
    await expect(scope.getByText(localizeKey('WH40K.EventTracker.Auto.ChatUndoHint'))).toBeTruthy();
}

function story(name: string, eventName: string, detail: string): Story {
    return {
        name,
        render: () => card(eventName, detail),
        play: async ({ canvasElement }) => assertCard(canvasElement, eventName, detail),
    };
}

export const ItemAcquired = story(
    'Item acquired',
    'Recover the Data-Slate',
    translate('WH40K.EventTracker.Auto.ItemAcquired', { item: 'Data-Slate', holder: 'Acolyte Vell' }),
);
export const ActorDied = story('Actor died', 'Silence the Witness', translate('WH40K.EventTracker.Auto.ActorDied', { actor: 'The Witness' }));
export const StatusGained = story(
    'Status gained',
    'Subdue the Courier',
    translate('WH40K.EventTracker.Auto.StatusGained', { actor: 'The Courier', status: 'Stunned' }),
);
export const StatusLost = story(
    'Status lost',
    'The Patient Wakes',
    translate('WH40K.EventTracker.Auto.StatusLost', { actor: 'The Patient', status: 'Unconscious' }),
);
export const SceneEntered = story(
    'Scene entered',
    'Arrive at the Hab Block',
    translate('WH40K.EventTracker.Auto.SceneEntered', { actor: 'Acolyte Vell', scene: 'Hab Block' }),
);
export const EventResolved = story(
    'Event resolved',
    'Report to the Inquisitor',
    translate('WH40K.EventTracker.Auto.EventResolved', { event: 'Recover the Data-Slate' }),
);
