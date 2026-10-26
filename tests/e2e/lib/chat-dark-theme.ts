import type { Page } from '@playwright/test';
import { popOutChatMessage } from './chat-capture';
import { setColorScheme } from './color-scheme';
import { CHAT_PARCHMENT_SURFACE, type ContrastViolation, scanContrast } from './contrast';
import { snap } from './screenshot';

/**
 * The light theme's translucent panel wash as the browser computes it: what a chat
 * card's panels take from the parchment message on either theme (the `.chat-message`
 * tokens in tailwind/design-tokens.js).
 */
export const CHAT_PANEL_TRANSLUCENT = 'hsla(0,0%,100%,.35)';

/** What a chat card shows under the dark theme. */
export interface DarkChatCardRead {
    /** The card's `--wh40k-panel-bg-translucent`, as computed. */
    panel: string;
    /** Every line of the card's text that fails WCAG AA on the parchment and its panels. */
    unreadable: ContrastViolation[];
}

/**
 * Pop a chat card out under the dark theme, read its panel wash and every line's
 * contrast over the parchment, capture it as `label`, and put the scheme back (#698).
 * The chat message stays parchment on the dark theme, so its cards must not take the
 * dark theme's panel washes or text colours.
 */
export async function readChatCardOnDarkTheme(page: Page, messageId: string, label: string): Promise<DarkChatCardRead> {
    const original = await setColorScheme(page, 'dark');
    try {
        const selector = await popOutChatMessage(page, messageId);
        const unreadable = await scanContrast(page, selector, 40, { imageSurface: CHAT_PARCHMENT_SURFACE });
        const panel = await page.evaluate(
            (sel: string) =>
                getComputedStyle(document.querySelector(sel) ?? document.body)
                    .getPropertyValue('--wh40k-panel-bg-translucent')
                    .trim(),
            `${selector} .message-content`,
        );
        await snap(page, label, { selector });
        return { panel, unreadable };
    } finally {
        await setColorScheme(page, null, original);
    }
}
