import type { Page } from '@playwright/test';

/**
 * The selector of a chat message's card in the sidebar chat log, after expanding the
 * sidebar onto the Chat tab and scrolling the card into view, for
 * `snap(page, label, { selector })`. The `#sidebar` scope skips the transient copy
 * the collapsed sidebar shows over the canvas.
 */
export async function showChatMessage(page: Page, messageId: string): Promise<string> {
    const selector = `#sidebar .chat-log [data-message-id="${messageId}"]`;
    await page.evaluate(async (sel: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `ui` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { ui?: { sidebar?: { expanded?: boolean; expand?: () => void; changeTab?: (tab: string, group: string) => void } } };
        if (g.ui?.sidebar?.expanded !== true) g.ui?.sidebar?.expand?.();
        g.ui?.sidebar?.changeTab?.('chat', 'primary');
        const { pollUntil, settle } = globalThis.wh40kE2E;
        await pollUntil(() => document.querySelector(sel) !== null);
        document.querySelector(sel)?.scrollIntoView({ block: 'start' });
        await settle(400);
    }, selector);
    return selector;
}
