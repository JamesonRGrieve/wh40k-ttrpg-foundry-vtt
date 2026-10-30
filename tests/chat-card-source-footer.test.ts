/**
 * Regression guard: an item chat card's footer prints the item's source through
 * the `sourceLabel` helper, never the raw `item.system.source`.
 *
 * Every item that mixes DescriptionTemplate stores `source` as a structured
 * `{ book, page, url }` object, so a card that passed it straight to the card
 * shell's `footerLabel` printed "[object Object]" under every weapon and armour
 * card (seen on the Bolas card in the #601 Tier B capture). `sourceLabel`
 * collapses either shape to a "<book>, p.<page>" label and to '' when there is no reference,
 * which also hides the footer.
 *
 * A source scan rather than a render: the guard is the literal hash argument on
 * every chat template, including ones no story renders.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAT_DIR = resolve(__dirname, '../src/templates/chat');

/** Every .hbs under the chat templates, recursively. */
function chatTemplates(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return chatTemplates(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

describe('chat card source footers', () => {
    it('never hand the structured item source straight to the footer', () => {
        const raw = chatTemplates(CHAT_DIR).filter((path) => /footerLabel=item\.system\.source\b/u.test(readFileSync(path, 'utf8')));
        expect(raw).toEqual([]);
    });

    it('format the weapon and armour card footers through sourceLabel', () => {
        for (const name of ['weapon-card-chat.hbs', 'armour-card-chat.hbs']) {
            expect(readFileSync(join(CHAT_DIR, name), 'utf8')).toContain('footerLabel=(sourceLabel item.system.source)');
        }
    });
});
