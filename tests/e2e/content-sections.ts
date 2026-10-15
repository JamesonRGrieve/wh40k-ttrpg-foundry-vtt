import type { Page } from '@playwright/test';

/**
 * The content-block item sheet's sections that render with nothing in them (#597):
 * a shown section whose body has no text, and a modifiers group heading with no rows.
 * A read-only sheet should list none.
 */
export async function emptyContentSections(page: Page, appId: string): Promise<string[]> {
    return page.evaluate((id): string[] => {
        const app = document.getElementById(id);
        if (app === null) throw new Error(`app ${id} not in the DOM`);
        const sections = [...app.querySelectorAll<HTMLElement>('[data-content-section]')]
            .filter((section) => (section.querySelector(':scope > .tw-px-1')?.textContent.trim() ?? '') === '')
            .map((section) => section.dataset['contentSection'] ?? '');
        const groups = [...app.querySelectorAll<HTMLElement>('[data-content-section] h4')]
            .filter((heading) => (heading.nextElementSibling?.textContent.trim() ?? '') === '')
            .map((heading) => `group: ${heading.textContent.trim()}`);
        return [...sections, ...groups];
    }, appId);
}

/** The headings (section keys) a content-block item sheet shows. */
export async function shownContentSections(page: Page, appId: string): Promise<string[]> {
    return page.evaluate(
        (id): string[] =>
            [...(document.getElementById(id)?.querySelectorAll<HTMLElement>('[data-content-section]') ?? [])].map(
                (section) => section.dataset['contentSection'] ?? '',
            ),
        appId,
    );
}
