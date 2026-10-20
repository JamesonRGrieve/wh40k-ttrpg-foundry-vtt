/**
 * Guard: `system.notes` carries one title on every item sheet.
 *
 * The same field read "GM Notes" on gear, "Notes" on armour and weapon, and the ammo,
 * lead and armour-mod sheets each had their own key. It is the GM's notes field (the
 * sheets' placeholders say so), so every detail-section panel that holds it is titled
 * `WH40K.ItemSheet.Common.GmNotes`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const NOTES_KEY = 'WH40K.ItemSheet.Common.GmNotes';
const SECTION = 'systems/wh40k-rpg/templates/item/partial/item-detail-section.hbs';
/** One item-detail-section block: its opening hash and its body. */
const BLOCK = new RegExp(`\\{\\{#> ${SECTION.replace(/[.]/g, '\\.')}([^}]*)\\}\\}([\\s\\S]*?)\\{\\{/${SECTION.replace(/[.]/g, '\\.')}\\}\\}`, 'g');

function templatesUnder(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return templatesUnder(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

/** The title key of every detail-section block that holds the `system.notes` field. */
function notesTitles(): Array<{ file: string; key: string }> {
    return templatesUnder(resolve(ROOT, 'src/templates/item')).flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(BLOCK)]
            .filter(([, , body]) => body.includes('name="system.notes"'))
            .map(([, hash]) => ({ file: relative(ROOT, file), key: /labelKey="([^"]+)"/.exec(hash)?.[1] ?? '' })),
    );
}

describe('item-sheet notes title', () => {
    it('titles every notes panel with the GM Notes key', () => {
        const titles = notesTitles();
        // The gear, armour and weapon sheets at least hold it.
        expect(titles.length).toBeGreaterThanOrEqual(3);
        expect(titles.filter((t) => t.key !== NOTES_KEY)).toEqual([]);
    });
});
