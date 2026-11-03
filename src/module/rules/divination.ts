/**
 * @file divination — the Divination a character records: the maxim alone, as plain text.
 *
 * A Divination table result is rich text: the maxim in bold, then its effect
 * (`<p><b>Maxim.</b></p><p>Effect…</p>`). The character keeps only the maxim. It
 * is the line shown under the portrait, and it is the name of the divination's
 * origin-path document, which the builder matches to apply the divination's grants.
 * Storing the whole result showed its HTML tags on the sheet and never matched a
 * document, so the grants never applied.
 */

/** HTML character references a table result uses, decoded to their characters. */
const ENTITIES: Readonly<Record<string, string>> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
    mdash: '—',
    ndash: '–',
    hellip: '…',
};

/** `html` with its tags removed, character references decoded and whitespace collapsed. Pure. */
export function plainText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The maxim of a Divination, as plain text: the first bold run of a rich-text table
 * result, else its first paragraph, else the whole text stripped of markup. Text that
 * is already plain (typed by the player, or a stored maxim) comes back unchanged
 * apart from whitespace. Pure.
 */
export function divinationMaxim(text: string): string {
    if (text.search(/<[a-z][^>]*>/i) === -1) return plainText(text);
    const bold = /<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(text);
    const boldText = bold?.[2] === undefined ? '' : plainText(bold[2]);
    if (boldText !== '') return boldText;
    const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(text);
    const paragraphText = paragraph?.[1] === undefined ? '' : plainText(paragraph[1]);
    return paragraphText !== '' ? paragraphText : plainText(text);
}
