import { describe, expect, it } from 'vitest';
import { buildQuickTemplateContext, initialQuickTemplateState, quickTemplateShape, readQuickTemplateForm, withShapeKind } from './quick-template-view.ts';

/** #758: the quick-template form's state and view-model. */
const CONDITIONS = [
    { id: 'blinded', label: 'Blinded' },
    { id: 'stunned', label: 'Stunned' },
];

describe('quick template form', () => {
    it('opens as a 4 m sight-blocking circle with no condition, lasting until removed', () => {
        const state = initialQuickTemplateState();
        expect(state).toMatchObject({ kind: 'circle', primary: 4, blocksSight: true, condition: '', duration: null });
        expect(quickTemplateShape(state)).toEqual({ kind: 'circle', radius: 2 });
    });

    it('shows a circle one size field (diameter) and a cone two (length, angle)', () => {
        const circle = buildQuickTemplateContext(initialQuickTemplateState(), CONDITIONS);
        expect(circle.primaryLabelKey).toBe('WH40K.Area.QuickTemplate.Diameter');
        expect(circle.secondaryLabelKey).toBeNull();
        const cone = buildQuickTemplateContext(withShapeKind(initialQuickTemplateState(), 'cone'), CONDITIONS);
        expect([cone.primaryLabelKey, cone.secondaryLabelKey]).toEqual(['WH40K.Area.QuickTemplate.Length', 'WH40K.Area.QuickTemplate.Angle']);
        expect([cone.primary, cone.secondary]).toEqual([10, 30]);
    });

    it('reads the form: the condition, a duration in whole rounds, and sight blocking', () => {
        const next = readQuickTemplateForm(initialQuickTemplateState(), {
            kind: 'circle',
            primary: 6,
            blocksSight: false,
            condition: 'blinded',
            duration: 12.7,
            name: ' Smoke ',
        });
        expect(next).toMatchObject({ primary: 6, blocksSight: false, condition: 'blinded', duration: 12, name: 'Smoke' });
        const ctx = buildQuickTemplateContext(next, CONDITIONS);
        expect(ctx.conditions.find((c) => c.selected)?.value).toBe('blinded');
        expect(ctx.duration).toBe(12);
    });

    it('resets the sizes when the shape changes, and keeps a bad number at its last value', () => {
        const line = readQuickTemplateForm(initialQuickTemplateState(), { kind: 'line' });
        expect([line.kind, line.primary, line.secondary]).toEqual(['line', 10, 1]);
        const kept = readQuickTemplateForm(line, { kind: 'line', primary: 'x', secondary: 2, blocksSight: true });
        expect([kept.primary, kept.secondary]).toEqual([10, 2]);
    });

    it('cannot place while a size is invalid; an empty duration lasts until removed', () => {
        const bad = readQuickTemplateForm(initialQuickTemplateState(), { kind: 'circle', primary: 0, duration: 0 });
        expect(buildQuickTemplateContext(bad, CONDITIONS).canPlace).toBe(false);
        expect(bad.duration).toBeNull();
        expect(buildQuickTemplateContext(bad, CONDITIONS).duration).toBe('');
    });
});
