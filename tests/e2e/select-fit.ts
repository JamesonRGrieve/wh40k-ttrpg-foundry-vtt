import type { Page } from '@playwright/test';

/** A rendered select's chosen text, and whether its line fits the select's content box. */
export interface SelectFit {
    text: string;
    contentHeight: number;
    lineHeight: number;
    fits: boolean;
}

/**
 * Read the first select matching `selector` on the page (#624). Foundry's chrome gives a
 * select a fixed height and a matching line height; vertical padding on top pushes the
 * chosen option's line below the box and clips it. The line fits when it is no taller
 * than the select's height less its vertical padding. Null when no such select renders.
 */
export async function readSelectFit(page: Page, selector: string): Promise<SelectFit | null> {
    return page.evaluate((sel): SelectFit | null => {
        const select = document.querySelector<HTMLSelectElement>(sel);
        if (select === null) return null;
        const style = getComputedStyle(select);
        const fontSize = parseFloat(style.fontSize);
        const parsedLine = parseFloat(style.lineHeight);
        // `line-height: normal` reports no pixel value; it is ~1.2× the font size.
        const lineHeight = Number.isNaN(parsedLine) ? fontSize * 1.2 : parsedLine;
        const contentHeight = select.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        return {
            text: Array.from(select.selectedOptions, (option) => option.textContent.trim()).join(''),
            contentHeight,
            lineHeight,
            fits: lineHeight <= contentHeight,
        };
    }, selector);
}
