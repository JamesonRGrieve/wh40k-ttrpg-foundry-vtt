/**
 * @file Pure view-model builders for the warband Inquests (#90).
 *
 * The Party Overview panel and the GM Inquest tracker both render the stored
 * Inquests through these helpers. They read no Foundry globals, so the sheet,
 * the dialog, the stories and the unit tests all use the same functions. The
 * templates localize the label keys.
 */

import { INQUEST_SCOPES, inquestProgress, type InquestProgress, type InquestRules, type InquestState } from '../../rules/inquest.ts';

/** Localization key for a scope label (`WH40K.Inquest.Scope.<scope>`). */
export function inquestScopeLabelKey(scope: InquestState['scope']): string {
    return `WH40K.Inquest.Scope.${scope}`;
}

/** Localization key for a status label (`WH40K.Inquest.Status.<status>`). */
export function inquestStatusLabelKey(status: InquestState['status']): string {
    return `WH40K.Inquest.Status.${status}`;
}

/** One read-only Inquest row on the Party Overview panel. */
export interface InquestPanelRow {
    id: string;
    target: string;
    scopeLabelKey: string;
    statusLabelKey: string;
    isActive: boolean;
    points: number;
    progress: InquestProgress;
}

/** The Party Overview rows for the stored Inquests, active ones first, otherwise in stored order. */
export function inquestPanelRows(rules: InquestRules, inquests: readonly InquestState[]): InquestPanelRow[] {
    const rows = inquests.map((q) => ({
        id: q.id,
        target: q.target,
        scopeLabelKey: inquestScopeLabelKey(q.scope),
        statusLabelKey: inquestStatusLabelKey(q.status),
        isActive: q.status === 'active',
        points: q.investigationPoints,
        progress: inquestProgress(rules, q),
    }));
    return [...rows.filter((r) => r.isActive), ...rows.filter((r) => !r.isActive)];
}

/** Scope `<select>` options: the label key plus the scope's printed IP total. */
export function inquestScopeOptions(rules: InquestRules): Array<{ value: InquestState['scope']; labelKey: string; points: number }> {
    return INQUEST_SCOPES.map((value) => ({ value, labelKey: inquestScopeLabelKey(value), points: rules.scopes[value].requiredPoints }));
}
