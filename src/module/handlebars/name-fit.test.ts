import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEM_NAME_FIT_MAX_FITTED_CHARS, NAME_FIT_MAX_FITTED_CHARS, nameFitClass } from './name-fit.ts';

describe('nameFitClass for the item header (#699)', () => {
    it('keeps text-xl for a name that fits', () => {
        expect(nameFitClass('Lasgun', 'itemHeader')).toBe('tw-text-xl');
        expect(nameFitClass('x'.repeat(22), 'itemHeader')).toBe('tw-text-xl');
    });

    it('steps down for the name the freeze audit found clipped mid-letter', () => {
        expect(nameFitClass('e2e-612 weaponModification', 'itemHeader')).toBe('tw-text-[1.1rem]');
        expect(nameFitClass('x'.repeat(30), 'itemHeader')).toBe('tw-text-[0.95rem]');
        expect(nameFitClass('x'.repeat(ITEM_NAME_FIT_MAX_FITTED_CHARS), 'itemHeader')).toBe('tw-text-[0.8rem]');
    });

    it('takes the floor past the longest fitted name, where the field ends in an ellipsis', () => {
        expect(nameFitClass('x'.repeat(ITEM_NAME_FIT_MAX_FITTED_CHARS + 1), 'itemHeader')).toBe('tw-text-[0.75rem]');
    });

    it('the sidebar stays the default field', () => {
        expect(nameFitClass('x'.repeat(18))).toBe(nameFitClass('x'.repeat(18), 'sidebar'));
    });

    it('throws on an unknown field, a template bug', () => {
        expect(() => nameFitClass('Lasgun', 'banner')).toThrow('unknown field');
    });
});

describe('every item-sheet title input is fitted (#699)', () => {
    const templates = resolve(__dirname, '../../templates/item');
    it.each(['panel/item-header.hbs', 'partial/item-name-input.hbs', 'item-weapon-quality-sheet.hbs', 'npc-template/header.hbs'])('%s', (path) => {
        const source = readFileSync(join(templates, path), 'utf8');
        expect(source).toContain("{{nameFitClass item.name 'itemHeader'}} tw-text-ellipsis");
        expect(source).toContain('data-tooltip="{{item.name}}"');
    });
});

describe('nameFitClass (#630)', () => {
    it('keeps the base size for a short name', () => {
        expect(nameFitClass('Bloodletter')).toBe('tw-text-[1.05rem]');
        expect(nameFitClass('x'.repeat(17))).toBe('tw-text-[1.05rem]');
    });

    it('steps the font down as the name grows', () => {
        expect(nameFitClass('x'.repeat(18))).toBe('tw-text-[0.9rem]');
        expect(nameFitClass('Asphodel Kroot Warrior')).toBe('tw-text-[0.8rem]');
        expect(nameFitClass('x'.repeat(25))).toBe('tw-text-[0.7rem]');
        expect(nameFitClass('x'.repeat(NAME_FIT_MAX_FITTED_CHARS))).toBe('tw-text-[0.7rem]');
    });

    it('drops to the floor size past the longest fitted name', () => {
        expect(nameFitClass('x'.repeat(NAME_FIT_MAX_FITTED_CHARS + 1))).toBe('tw-text-[0.65rem]');
        expect(nameFitClass('Lord of Change, Greater Daemon of Tzeentch')).toBe('tw-text-[0.65rem]');
    });

    it('ignores surrounding whitespace', () => {
        expect(nameFitClass(`   ${'x'.repeat(17)}   `)).toBe('tw-text-[1.05rem]');
    });

    it('treats an empty name as short', () => {
        expect(nameFitClass('')).toBe('tw-text-[1.05rem]');
    });

    it('sizes the two clipped vehicle names the freeze audit found', () => {
        expect(nameFitClass('Chimera Armoured Transport')).toBe('tw-text-[0.7rem]');
        expect(nameFitClass('Adeptus Astartes Dreadnought')).toBe('tw-text-[0.65rem]');
    });
});

describe('every sidebar name renders through the one fitted name field (#630)', () => {
    const templates = resolve(__dirname, '../../templates/actor');
    const read = (path: string): string => readFileSync(join(templates, path), 'utf8');
    const FIELD = 'templates/actor/partial/actor-name-field.hbs';

    it('the shared field fits the name and keeps the full name in its tooltip', () => {
        const field = read('partial/actor-name-field.hbs');
        expect(field).toContain('{{#if fitName}}{{nameFitClass actor.name}} tw-text-ellipsis');
        expect(field).toContain('data-tooltip="{{actor.name}}"');
    });

    it('the character / NPC / voidcraft identity block uses it', () => {
        expect(read('partial/actor-identity.hbs')).toContain(`${FIELD} nameLabelKey=nameLabelKey fitName=fitName placeholderKey=placeholderKey`);
        expect(read('partial/actor-identity.hbs')).not.toContain('name="name"');
    });

    it('the vehicle (craft) sidebar uses it, fitted — it used to carry its own unfitted input', () => {
        const header = read('craft/header.hbs');
        expect(header).toMatch(new RegExp(`${FIELD.replace(/\./g, '\\.')} fitName=true`));
        expect(header).not.toContain('name="name"');
    });

    it('the voidcraft sidebar fits its name, with no inline label taking half the field', () => {
        const header = read('voidcraft/header.hbs');
        expect(header).toContain('actor-identity.hbs fitName=true placeholderKey="WH40K.Voidcraft.Name"');
        expect(header).not.toContain('nameLabelKey');
    });
});
