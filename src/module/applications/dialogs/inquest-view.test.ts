import { describe, expect, it } from 'vitest';
import { DH2_INQUEST_RULES } from '../../config/game-systems/dh2-config.ts';
import { inquestRulesFor } from '../../config/game-systems/index.ts';
import { createInquest } from '../../rules/inquest.ts';
import { inquestPanelRows, inquestScopeLabelKey, inquestScopeOptions, inquestStatusLabelKey } from './inquest-view';

describe('inquestRulesFor — per-line gating (#90)', () => {
    it('only DH2 prints Inquest rules', () => {
        expect(inquestRulesFor('dh2')).toBe(DH2_INQUEST_RULES);
        for (const line of ['dh1', 'bc', 'dw', 'ow', 'rt', 'im']) {
            expect(inquestRulesFor(line)).toBeNull();
        }
        expect(inquestRulesFor(undefined)).toBeNull();
        expect(inquestRulesFor('unknown')).toBeNull();
    });
});

describe('inquest label keys', () => {
    it('namespaces scope and status under WH40K.Inquest', () => {
        expect(inquestScopeLabelKey('majoris')).toBe('WH40K.Inquest.Scope.majoris');
        expect(inquestStatusLabelKey('goalsFailed')).toBe('WH40K.Inquest.Status.goalsFailed');
    });
});

describe('inquestScopeOptions', () => {
    it('lists each scope with its printed IP total', () => {
        expect(inquestScopeOptions(DH2_INQUEST_RULES)).toEqual([
            { value: 'minoris', labelKey: 'WH40K.Inquest.Scope.minoris', points: 600 },
            { value: 'majoris', labelKey: 'WH40K.Inquest.Scope.majoris', points: 900 },
            { value: 'extremis', labelKey: 'WH40K.Inquest.Scope.extremis', points: 1200 },
        ]);
    });
});

describe('inquestPanelRows', () => {
    it('lists active Inquests first, keeping stored order otherwise', () => {
        const rows = inquestPanelRows(DH2_INQUEST_RULES, [
            createInquest('done', { target: 'Zethor', status: 'goalsMet' }),
            createInquest('a', { target: 'Purple Flowers', scope: 'minoris', investigationPoints: 350 }),
            createInquest('b', { target: 'Childes of Kappellax', scope: 'extremis' }),
        ]);
        expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'done']);
        expect(rows[0]).toMatchObject({
            isActive: true,
            points: 350,
            scopeLabelKey: 'WH40K.Inquest.Scope.minoris',
            progress: { required: 600, revelationsReached: 1, revelationCount: 2 },
        });
        expect(rows[2]).toMatchObject({ isActive: false, statusLabelKey: 'WH40K.Inquest.Status.goalsMet' });
    });
    it('is empty for no Inquests', () => {
        expect(inquestPanelRows(DH2_INQUEST_RULES, [])).toEqual([]);
    });
});
