/**
 * Regression guard (#629): a locked compendium sheet disabled every control,
 * view-only toggles included, so a viewer could not expand a weapon's details.
 * Each sheet class now lists the actions that only change what the viewer sees
 * in a static `VIEW_ONLY_ACTIONS`, and the shared `_toggleDisabled` override
 * re-enables those controls.
 *
 * The sheet classes pull in Foundry globals at module load and cannot be
 * instantiated under the unit env, so the declarations are checked at the
 * source level: each listed action must be one the same class registers (a
 * misspelt name would silently leave its control disabled), and the weapon
 * sheet must list Show Details.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const DECLARING_FILES = [
    'src/module/applications/api/application-v2-mixin.ts',
    'src/module/applications/api/expandable-tooltip-mixin.ts',
    'src/module/applications/api/stat-breakdown-mixin.ts',
    'src/module/applications/actor/base-actor-sheet.ts',
    'src/module/applications/actor/npc-sheet.ts',
    'src/module/applications/item/base-item-sheet.ts',
    'src/module/applications/item/weapon-sheet.ts',
    'src/module/applications/item/talent-sheet.ts',
    'src/module/applications/item/reference-list-item-sheet.ts',
] as const;

/** Actions that write to the document and must never be listed as view-only. */
const MUTATING_ACTIONS = ['editImage', 'toggleEditMode', 'itemDelete', 'itemCreate', 'createEffect', 'deleteDocument', 'rollDamage'];

/** The names in a file's `static … VIEW_ONLY_ACTIONS … = [...]` declaration. */
function viewOnlyActionsIn(source: string): string[] {
    const match = /static (?:override )?VIEW_ONLY_ACTIONS: readonly string\[\] = \[([^\]]*)\]/.exec(source);
    if (match?.[1] === undefined) return [];
    return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('VIEW_ONLY_ACTIONS declarations (#629)', () => {
    it.each(DECLARING_FILES)('%s lists only actions it registers', (file) => {
        const source = readRepoFile(file);
        const actions = viewOnlyActionsIn(source);
        expect(actions.length).toBeGreaterThan(0);
        for (const action of actions) {
            expect(source, `${file} registers ${action}`).toMatch(new RegExp(`\\n\\s+${action}: \\w+\\.#?\\w+`));
            expect(MUTATING_ACTIONS).not.toContain(action);
        }
    });

    it("lists the weapon sheet's Show Details toggle", () => {
        expect(viewOnlyActionsIn(readRepoFile('src/module/applications/item/weapon-sheet.ts'))).toContain('toggleBody');
    });

    it('re-enables view-only controls in the shared mixin after Foundry locks the sheet', () => {
        const mixin = readRepoFile('src/module/applications/api/application-v2-mixin.ts');
        expect(mixin).toMatch(
            /_toggleDisabled\(disabled: boolean\): void \{[\s\S]*?prototype\._toggleDisabled\?\.call\(this, disabled\);[\s\S]*?enableViewOnlyControls\(/,
        );
    });
});
