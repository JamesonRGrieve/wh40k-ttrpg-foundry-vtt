/**
 * Guard (#724): item data models built a `chatProperties` string list for
 * `ItemDataModel.getChatData()`, which nothing called. No chat card, sheet or
 * template ever showed those lines, so the 45 getters, the
 * `inheritedChatProperties` helper, `getChatData` and the item data model's
 * `getRollData` were removed, together with the label getters only they read.
 * The item chat cards are built from their own templates.
 *
 * This test fails if any of them comes back under `src/` without a consumer
 * being wired up first.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

/** Members removed with the tree; each is unread by production code. */
const REMOVED =
    /\b(?:chatProperties|getChatData|inheritedChatProperties|grantsSummary|availabilityByPlaceLabels|placeRatingLabels|overloadRangeLabel|weaponTypesLabel|vehicleUpgradeTypes)\b/;

function sourceFilesUnder(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFilesUnder(path);
        return /\.(?:ts|hbs)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
    });
}

/** `file:line: text` for every line under `src/` naming a removed member. */
function removedMemberReferences(): string[] {
    return sourceFilesUnder(resolve(ROOT, 'src')).flatMap((file) =>
        readFileSync(file, 'utf8')
            .split('\n')
            .map((line, index) => ({ line, index }))
            .filter(({ line }) => REMOVED.test(line))
            .map(({ line, index }) => `${relative(ROOT, file)}:${index + 1}: ${line.trim()}`),
    );
}

describe('item chatProperties tree stays removed (#724)', () => {
    it('no source file defines or reads the removed chat-property members', () => {
        expect(removedMemberReferences()).toEqual([]);
    });

    it('the item data model has no getRollData of its own', () => {
        const source = readFileSync(resolve(ROOT, 'src/module/data/abstract/item-data-model.ts'), 'utf8');
        expect(source).not.toMatch(/^\s*getRollData\(/m);
    });
});
