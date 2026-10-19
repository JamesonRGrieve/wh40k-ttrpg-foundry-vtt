/**
 * Regression (#656): an item-sheet form names an array element's inputs by index
 * and carries only those it renders. An `ArrayField` is written whole, so editing
 * an NPC Template skill row's bonus reset the row's key and name to blank. Only the
 * reference-list sheets folded the submitted fields back onto the stored elements;
 * BaseItemSheet now does it for every item sheet. The sheet can't load under
 * happy-dom, so this checks the source, and Tier B
 * (npc-template-edit-save.spec.ts) checks the live round trip.
 */

import { describe, expect, it } from 'vitest';
import { mergeIndexedArrays } from '../src/module/applications/item/reference-list-edits.ts';
import { readRepoFile } from './lib/repo-file.ts';

describe('item sheets keep the fields an array row does not render (#656)', () => {
    it('BaseItemSheet folds index-keyed form fields onto the stored arrays', () => {
        const base = readRepoFile('src/module/applications/item/base-item-sheet.ts');
        expect(base).toMatch(/_processFormData\([^)]*\): FormObject \{[\s\S]*?mergeIndexedArrays\(system, source\)/);
    });

    it('no item sheet keeps a second copy of the fold', () => {
        expect(readRepoFile('src/module/applications/item/reference-list-item-sheet.ts')).not.toContain('_processFormData');
    });

    it("a skill row's bonus edit keeps the row's key and name", () => {
        const stored = { trainedSkills: [{ key: 'awareness', name: 'Awareness', characteristic: 'perception', level: 'trained', bonus: 0 }] };
        const submitted = { trainedSkills: { 0: { level: 'plus10', bonus: 5 } } };
        expect(mergeIndexedArrays(submitted, stored)).toEqual({
            trainedSkills: [{ key: 'awareness', name: 'Awareness', characteristic: 'perception', level: 'plus10', bonus: 5 }],
        });
    });
});
