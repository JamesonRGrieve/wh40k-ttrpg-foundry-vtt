/**
 * The craft Components tab listed each vehicle upgrade beside an unlabelled
 * checkbox (#701 item 17). The box wrote `system.active`, a field the
 * vehicleUpgrade schema does not have, so the write was dropped and the box
 * never stayed checked. The box and its action are gone.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

describe('craft components tab (#701)', () => {
    it('the vehicleUpgrade schema has no active field to toggle', () => {
        expect(readRepoFile('src/module/data/item/vehicle-upgrade.ts')).not.toMatch(/^\s*active\s*:/mu);
    });

    it('the tab offers no checkbox and the sheet no toggleComponentActive action', () => {
        expect(readRepoFile('src/templates/actor/craft/tab-components.hbs')).not.toContain('type="checkbox"');
        expect(readRepoFile('src/module/applications/actor/craft-sheet.ts')).not.toContain('toggleComponentActive');
    });
});
