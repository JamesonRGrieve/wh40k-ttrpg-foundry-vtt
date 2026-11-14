/**
 * Plays the schema item sheets' stories (#731) under happy-dom: each of the eight
 * types submits an edited field under its `system.` path and renders under every
 * game line, and a list field renders its entries with add / remove controls.
 */
import { describe, expect, it } from 'vitest';
import { playStory, type ViteGlobMeta } from './lib/play-story.ts';

const FILE = '../src/module/applications/item/define-schema-item-sheet.stories.ts';
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/module/applications/item/define-schema-item-sheet.stories.ts'], { eager: true });

describe('schema item sheet stories (#731)', () => {
    it.each(['Backpack', 'NavigatorPower', 'Oath', 'Order', 'Ritual', 'ShipRole', 'VehicleTrait', 'VehicleUpgrade', 'ListEditing'])('%s', async (name) => {
        await expect(playStory(MODULES, FILE, name)).resolves.toBeUndefined();
    });
});
