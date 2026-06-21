/**
 * @file Unit tests for the shared lead-status registry (#361).
 *
 * The registry is the single source of truth: choices, labels, icons, terminal
 * flags, select options, and the legacy-spelling normalisation all derive from
 * {@link LEAD_STATUSES}. `normalizeLeadStatus` is the delegate the journal
 * model's `migrateData` uses to coerce the legacy `deadEnd` spelling.
 */
import { describe, expect, it } from 'vitest';
import {
    LEAD_STATUS_CHOICES,
    LEAD_STATUSES,
    isTerminalLeadStatus,
    leadStatusIcon,
    leadStatusLabelKey,
    leadStatusSelectOptions,
    normalizeLeadStatus,
} from './lead-status.ts';

describe('lead-status registry', () => {
    it('is the unified four-state vocabulary in display order', () => {
        expect(LEAD_STATUS_CHOICES).toEqual(['active', 'pursued', 'resolved', 'dead-end']);
        expect(Object.keys(LEAD_STATUSES)).toEqual(['active', 'pursued', 'resolved', 'dead-end']);
    });

    it('each entry carries an id, a WH40K.Lead.State label key, an icon, and a terminal flag', () => {
        for (const [key, def] of Object.entries(LEAD_STATUSES)) {
            expect(def.id).toBe(key);
            expect(def.labelKey.startsWith('WH40K.Lead.State.')).toBe(true);
            expect(def.icon).toBeTruthy();
            expect(typeof def.terminal).toBe('boolean');
        }
    });

    it('marks resolved and dead-end terminal, active and pursued open', () => {
        expect(LEAD_STATUSES.active.terminal).toBe(false);
        expect(LEAD_STATUSES.pursued.terminal).toBe(false);
        expect(LEAD_STATUSES.resolved.terminal).toBe(true);
        expect(LEAD_STATUSES['dead-end'].terminal).toBe(true);
    });
});

describe('normalizeLeadStatus', () => {
    it('coerces the legacy camel-cased spelling to the canonical id', () => {
        expect(normalizeLeadStatus('deadEnd')).toBe('dead-end');
    });

    it('leaves canonical ids unchanged (idempotent)', () => {
        for (const id of LEAD_STATUS_CHOICES) {
            expect(normalizeLeadStatus(id)).toBe(id);
        }
    });

    it('passes through unknown ids untouched', () => {
        expect(normalizeLeadStatus('whatever')).toBe('whatever');
    });
});

describe('isTerminalLeadStatus', () => {
    it('is true for resolved and dead-end, including the legacy spelling', () => {
        expect(isTerminalLeadStatus('resolved')).toBe(true);
        expect(isTerminalLeadStatus('dead-end')).toBe(true);
        expect(isTerminalLeadStatus('deadEnd')).toBe(true);
    });

    it('is false for open states and unknown ids', () => {
        expect(isTerminalLeadStatus('active')).toBe(false);
        expect(isTerminalLeadStatus('pursued')).toBe(false);
        expect(isTerminalLeadStatus('whatever')).toBe(false);
    });
});

describe('leadStatusLabelKey / leadStatusIcon', () => {
    it('resolves the registry label key for every canonical id', () => {
        expect(leadStatusLabelKey('active')).toBe('WH40K.Lead.State.Active');
        expect(leadStatusLabelKey('pursued')).toBe('WH40K.Lead.State.Pursued');
        expect(leadStatusLabelKey('resolved')).toBe('WH40K.Lead.State.Resolved');
        expect(leadStatusLabelKey('dead-end')).toBe('WH40K.Lead.State.DeadEnd');
    });

    it('resolves the legacy spelling to the same terminal label / icon', () => {
        expect(leadStatusLabelKey('deadEnd')).toBe(leadStatusLabelKey('dead-end'));
        expect(leadStatusIcon('deadEnd')).toBe(leadStatusIcon('dead-end'));
    });

    it('falls back gracefully for unknown ids', () => {
        expect(leadStatusLabelKey('whatever')).toBe('WH40K.Lead.State.Active');
        expect(leadStatusIcon('whatever')).toBe('fa-circle-question');
    });
});

describe('leadStatusSelectOptions', () => {
    it('maps every canonical id to its label key for sheet dropdowns', () => {
        expect(leadStatusSelectOptions()).toEqual({
            'active': 'WH40K.Lead.State.Active',
            'pursued': 'WH40K.Lead.State.Pursued',
            'resolved': 'WH40K.Lead.State.Resolved',
            'dead-end': 'WH40K.Lead.State.DeadEnd',
        });
    });
});
