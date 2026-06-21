/**
 * Unit tests for the shared investigation-lead status vocabulary.
 *
 * Pure consts + lookup maps — no Foundry runtime needed.
 */
import { describe, expect, it } from 'vitest';
import { JOURNAL_LEAD_STATUS_CHOICES, LEAD_STATE_CHOICES, LEAD_STATUS_ICONS, LEAD_STATUS_LABEL_KEYS } from './lead-status.ts';

describe('lead-status vocabulary', () => {
    it('LEAD_STATE_CHOICES is the three-state LeadData vocabulary', () => {
        expect(LEAD_STATE_CHOICES).toEqual(['active', 'pursued', 'dead-end']);
    });

    it('JOURNAL_LEAD_STATUS_CHOICES is the four-state journal vocabulary', () => {
        expect(JOURNAL_LEAD_STATUS_CHOICES).toEqual(['active', 'pursued', 'resolved', 'deadEnd']);
    });

    it('every LeadData choice has a label key', () => {
        for (const state of LEAD_STATE_CHOICES) {
            expect(LEAD_STATUS_LABEL_KEYS[state]).toBeTruthy();
        }
    });

    it('every journal choice has a label key', () => {
        for (const status of JOURNAL_LEAD_STATUS_CHOICES) {
            expect(LEAD_STATUS_LABEL_KEYS[status]).toBeTruthy();
        }
    });

    it('every LeadData choice has an icon', () => {
        for (const state of LEAD_STATE_CHOICES) {
            expect(LEAD_STATUS_ICONS[state]).toBeTruthy();
        }
    });

    it('both spellings of the terminal "dead end" state share the same label key', () => {
        expect(LEAD_STATUS_LABEL_KEYS['dead-end']).toBe('WH40K.Lead.State.DeadEnd');
        expect(LEAD_STATUS_LABEL_KEYS['deadEnd']).toBe(LEAD_STATUS_LABEL_KEYS['dead-end']);
    });

    it('both spellings of the terminal "dead end" state share the same icon', () => {
        expect(LEAD_STATUS_ICONS['deadEnd']).toBe(LEAD_STATUS_ICONS['dead-end']);
    });

    it('reuses only existing WH40K.Lead.State.* label keys (no fabricated keys)', () => {
        const allowed = new Set(['WH40K.Lead.State.Active', 'WH40K.Lead.State.Pursued', 'WH40K.Lead.State.DeadEnd']);
        for (const key of Object.values(LEAD_STATUS_LABEL_KEYS)) {
            expect(allowed.has(key)).toBe(true);
        }
    });
});
