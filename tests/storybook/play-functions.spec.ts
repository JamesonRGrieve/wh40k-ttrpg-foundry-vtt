import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { playOutcome, watchPlayOutcome } from './lib/play-outcome';

/**
 * Every story's play function, run in the browser and held to its result.
 *
 * Storybook 10 marks a failed play as finished like a passing one, so loading a
 * story proves only that it rendered. This spec loads each story in the built
 * index and fails when Storybook reports its play as errored. A story without a
 * play passes once it renders.
 */

interface IndexEntry {
    id: string;
    type: string;
}

/** The built Storybook's story ids, read from its index. */
function storyIds(): string[] {
    const index = JSON.parse(readFileSync(resolve('storybook-static/index.json'), 'utf8')) as { entries: Record<string, IndexEntry> };
    return Object.values(index.entries)
        .filter((entry) => entry.type === 'story')
        .map((entry) => entry.id);
}

test.describe('story play functions', () => {
    for (const id of storyIds()) {
        test(id, async ({ page }) => {
            await watchPlayOutcome(page);
            await page.goto(`/iframe.html?id=${id}&viewMode=story`);
            const outcome = await playOutcome(page);
            expect(outcome.error, `play of ${id}`).toBeNull();
            expect(outcome.status, `story ${id}`).toBe('success');
        });
    }
});
