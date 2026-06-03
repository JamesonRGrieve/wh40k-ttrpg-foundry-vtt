import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message.ts';

describe('errorMessage', () => {
    it('returns the message of an Error instance', () => {
        expect(errorMessage(new Error('boom'))).toBe('boom');
    });

    it('returns the message of an Error subclass', () => {
        class CustomError extends Error {}
        expect(errorMessage(new CustomError('custom'))).toBe('custom');
    });

    it('returns a thrown string verbatim', () => {
        expect(errorMessage('plain string failure')).toBe('plain string failure');
    });

    it('stringifies thrown numbers', () => {
        expect(errorMessage(42)).toBe('42');
    });

    it('stringifies null and undefined without throwing', () => {
        expect(errorMessage(null)).toBe('null');
        expect(errorMessage(undefined)).toBe('undefined');
    });

    it('stringifies plain objects', () => {
        expect(errorMessage({ code: 500 })).toBe('[object Object]');
    });
});
