import type { Page } from '@playwright/test';

/**
 * A story's play outcome, as Storybook reports it on its channel.
 *
 * Storybook 10 ends a failed play in the render phase "finished", the same phase
 * a passing one ends in, and logs the assertion to the console. Neither the phase
 * nor the error display tells the two apart, so a spec that only waits for the
 * phase passes a failed play. The channel's `storyFinished` event carries the
 * real status, and `playFunctionThrewException` the error.
 */
export interface PlayOutcome {
    status: 'success' | 'error';
    /** The play's error message, when it threw. */
    error: string | null;
}

/** The slice of Storybook's preview channel the watcher listens on. */
interface StoryChannel {
    on: (event: string, listener: (payload: { status?: 'success' | 'error'; message?: string; stack?: string }) => void) => void;
}

declare global {
    interface Window {
        /** The outcome {@link watchPlayOutcome} records for the loaded story. */
        __wh40kPlayOutcome?: PlayOutcome;
    }
}

/** How long a story may take to render and play. */
const PLAY_TIMEOUT_MS = 30_000;

/**
 * Record the outcome of the next story the page loads. Call before `page.goto`:
 * it hooks Storybook's channel the moment the preview creates it.
 */
export async function watchPlayOutcome(page: Page): Promise<void> {
    await page.addInitScript(() => {
        let channel: StoryChannel | undefined;
        let error: string | null = null;
        // The preview assigns the global `__STORYBOOK_ADDONS_CHANNEL__` once it creates the channel.
        Object.defineProperty(window, '__STORYBOOK_ADDONS_CHANNEL__', {
            configurable: true,
            get: () => channel,
            set: (next: StoryChannel) => {
                channel = next;
                next.on('playFunctionThrewException', (payload) => {
                    // The message, then the frame in the story file that threw, to find the assertion.
                    const frame = (payload.stack ?? '').split('\n').find((line) => line.includes('.stories')) ?? '';
                    error = `${payload.message ?? 'the play threw'}${frame === '' ? '' : `\n${frame.trim()}`}`;
                });
                next.on('storyFinished', (payload) => {
                    window.__wh40kPlayOutcome = { status: payload.status ?? 'error', error };
                });
            },
        });
    });
}

/** Wait for the story loaded after {@link watchPlayOutcome} to finish, and return how its play ended. */
export async function playOutcome(page: Page): Promise<PlayOutcome> {
    await page.waitForFunction(() => window.__wh40kPlayOutcome !== undefined, null, { timeout: PLAY_TIMEOUT_MS });
    const outcome = await page.evaluate(() => window.__wh40kPlayOutcome);
    if (outcome === undefined) throw new Error('the story finished without an outcome');
    return outcome;
}
