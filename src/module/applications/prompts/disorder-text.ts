/**
 * Pure text helpers for the Disorder roll card (#116) — Foundry-free so they are
 * unit-testable without loading the ApplicationV2 dialog (which evaluates the
 * `foundry` global at import and cannot be imported under happy-dom). The dialog
 * imports these to turn a resolved Mental Disorder item's HTML body into the
 * concise chat-card effect line.
 */

/** Strip tags and decode the handful of entities the disorder bodies use, collapsing to a single plain-text line. */
export function htmlToPlainText(html: string): string {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&ndash;/g, '–')
        .replace(/&mdash;/g, '—')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Concise, plain-text effect summary: the item's trigger prose when present, else the first paragraph of its effect. */
export function conciseEffect(trigger: string, effect: string): string {
    const triggerText = htmlToPlainText(trigger);
    if (triggerText !== '') return triggerText;
    const firstParagraph = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(effect);
    return htmlToPlainText(firstParagraph?.[1] ?? effect);
}
