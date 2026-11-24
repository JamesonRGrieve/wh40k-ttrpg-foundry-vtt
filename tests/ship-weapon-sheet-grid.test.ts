/**
 * Ship item sheets lay their numbers out as compact tiles (operator, 2026-11-24:
 * "Full width fields for numbers?"). #701 lined the ship weapon's columns up; the
 * shared number-tile grid keeps them equal and sizes each box to its value.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const WEAPON = readRepoFile('src/templates/item/ship-weapon-sheet.hbs');
const COMPONENT = readRepoFile('src/templates/item/ship-component-sheet.hbs');
const UPGRADE = readRepoFile('src/templates/item/ship-upgrade-sheet.hbs');
const GRID = readRepoFile('src/templates/item/partial/number-tile-grid.hbs');
const MODIFIERS = readRepoFile('src/templates/item/partial/ship-stat-modifier-tiles.hbs');
const TILE_GRID = '{{> systems/wh40k-rpg/templates/item/partial/number-tile-grid.hbs';
const MODIFIER_TILES = '{{> systems/wh40k-rpg/templates/item/partial/ship-stat-modifier-tiles.hbs}}';

describe('ship item sheet number tiles', () => {
    it('gives every box one fixed width, never the full row', () => {
        expect(GRID).toContain('tw-w-[5.5rem]');
        expect(GRID).not.toContain('tw-w-full');
        expect(GRID).toContain('tw-grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]');
    });

    it('the ship weapon keeps its two hooked grids, now as tiles', () => {
        for (const hook of ['ship-weapon-stat-grid', 'ship-weapon-resource-grid']) {
            const at = WEAPON.indexOf(`<div data-wh40k-hook="${hook}">`);
            expect(at, hook).toBeGreaterThan(-1);
            expect(WEAPON.indexOf(TILE_GRID, at)).toBeGreaterThan(at);
        }
        for (const name of ['strength', 'damage', 'crit', 'range', 'power', 'space', 'shipPoints']) {
            expect(WEAPON).toContain(`name="system.${name}"`);
        }
    });

    it('components and upgrades share the nine stat modifier tiles', () => {
        expect(COMPONENT).toContain(MODIFIER_TILES);
        expect(UPGRADE).toContain(MODIFIER_TILES);
        for (const stat of ['speed', 'manoeuvrability', 'detection', 'armour', 'hullIntegrity', 'turretRating', 'voidShields', 'morale', 'crewRating']) {
            expect(MODIFIERS).toContain(`name="system.modifiers.${stat}"`);
        }
    });

    it('keeps no unstyled full-width form rows on the ship sheets', () => {
        for (const sheet of [WEAPON, COMPONENT, UPGRADE]) {
            expect(sheet).not.toContain('class="form-row"');
            expect(sheet).not.toContain('<input class="tw-w-full" type="number"');
        }
    });
});
