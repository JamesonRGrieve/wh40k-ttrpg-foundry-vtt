import { describe, expect, it } from 'vitest';
import { buildSafeAttrs } from './safe-attrs.ts';

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

describe('buildSafeAttrs', () => {
    it('joins alternating name/value pairs into escaped attributes', () => {
        expect(buildSafeAttrs(['data-a', 'x"y', 'data-b', 3, 'data-c', false], escapeHtml)).toBe('data-a="x&quot;y" data-b="3" data-c="false"');
    });

    it('skips empty or non-string names and non-primitive values', () => {
        expect(buildSafeAttrs(['', 'v', 7, 'v', 'data-obj', { a: 1 }, 'data-null', null, 'data-ok', 'y'], escapeHtml)).toBe('data-ok="y"');
    });

    it('ignores a dangling name with no value', () => {
        expect(buildSafeAttrs(['data-a', 'x', 'data-dangling'], escapeHtml)).toBe('data-a="x"');
    });
});
