import { expect, type Page } from '@playwright/test';

/**
 * Assert that a Storybook iframe rendered the requested story rather than a
 * Storybook error page. Storybook renders a structured error doc (containing
 * the literal text "Couldn't find story matching …") when the requested id is
 * missing — a regression introduced by typos, kebab-case mistakes, or stories
 * that live outside the `main.ts` `stories` glob. Earlier `expect(page.locator('body')).toBeAttached()`
 * lenient assertions silently passed against that error page; this helper
 * exists so a missing story can never green-light again.
 *
 * Every Playwright spec under tests/storybook/ that navigates to a story URL
 * should call this immediately after `waitForLoadState('networkidle')`.
 */
export async function assertStoryRendered(page: Page): Promise<void> {
    const bodyText = await page.locator('body').innerText();
    if (/Couldn[’']t find story matching/i.test(bodyText)) {
        const slug = page.url().split('id=')[1]?.split('&')[0] ?? '<unknown>';
        throw new Error(
            `Storybook error page detected for story id "${slug}". ` +
                'The story title/export combo does not exist, or its file is outside the ' +
                '.storybook/main.ts `stories` glob.',
        );
    }
    await expect(page.locator('body')).toBeAttached();
}
