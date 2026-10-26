/**
 * The craft sidebar shows the vehicle's armour by facing, under an "Armour" label
 * (#701 item 16). It printed one bare row, "FRONT 0", which named no stat and
 * left out the side and rear armour.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const HEADER = readRepoFile('src/templates/actor/craft/header.hbs');

describe('craft sidebar armour (#701)', () => {
    it('labels the block "Armour" and shows front, side and rear', () => {
        const block = /data-wh40k-hook="craft-sidebar-armour"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/u.exec(HEADER)?.[0] ?? '';
        expect(block).toContain('WH40K.Vehicle.Armour"');
        for (const facing of ['front', 'side', 'rear']) {
            expect(block).toContain(`data-facing="${facing}"`);
            expect(block).toContain(`{{source.armour.${facing}.value}}`);
        }
    });

    it('stays read-only: the inputs live on the Combat tab, and a second input would submit an array', () => {
        expect(HEADER).not.toMatch(/name="system\.armour\./u);
    });
});
