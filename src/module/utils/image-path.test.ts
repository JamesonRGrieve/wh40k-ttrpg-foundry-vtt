import { describe, expect, it } from 'vitest';
import { isValidImagePath } from './image-path.ts';

/**
 * #699: a sheet save sent the portrait's `<img …>` markup as `img`; it must read as
 * no image path, so the save drops it instead of storing a placeholder.
 */
describe('isValidImagePath', () => {
    it('accepts image and video paths, with or without a query string', () => {
        expect(isValidImagePath('icons/svg/item-bag.svg')).toBe(true);
        expect(isValidImagePath('systems/wh40k-rpg/assets/Voidborn.WEBP')).toBe(true);
        expect(isValidImagePath('https://kanka.example/img/full.png?v=3')).toBe(true);
        expect(isValidImagePath('tokens/glow.webm')).toBe(true);
    });

    it('rejects the portrait markup a sheet save once sent', () => {
        expect(isValidImagePath('<img class="tw-h-full tw-w-full tw-object-cover" src="icons/svg/item-bag.svg" alt="Rope">')).toBe(false);
    });

    it('rejects empty, placeholder and extension-less values', () => {
        expect(isValidImagePath('')).toBe(false);
        expect(isValidImagePath('   ')).toBe(false);
        expect(isValidImagePath('null')).toBe(false);
        expect(isValidImagePath('undefined')).toBe(false);
        expect(isValidImagePath('icons/svg/item-bag')).toBe(false);
        expect(isValidImagePath(null)).toBe(false);
        expect(isValidImagePath(42)).toBe(false);
    });
});
