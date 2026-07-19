import { expect } from '@playwright/test';
import { recordCoverage } from './coverage-tracker';

/**
 * The result of one exercised flow inside a Tier B "probe" — a `page.evaluate`
 * that runs a batch of named checks against the live system and reports each.
 * `name` is a member of the spec's own `*_FLOWS` union (a subtype of string).
 */
interface FlowOutcome {
    name: string;
    ok: boolean;
    detail: string | null;
}

/** The shape every flow probe returns: per-flow outcomes plus any page errors. */
interface FlowProbe {
    results: readonly FlowOutcome[];
    pageErrors: readonly string[];
}

/**
 * Assert that a flow probe ran EVERY expected flow and each passed, recording
 * coverage (`recordCoverage(dimension, name)`) for the ones that did. Replaces
 * the identical ~15-line seen-Set + failures loop copy-pasted across ~33 flow
 * specs. A missing flow, a failed flow, or a page error is collected into one
 * readable assertion.
 *
 * (Page errors are also caught globally by the browser-error guard in
 * lib/test.ts; keeping the per-probe check here preserves each spec's original
 * in-body failure message and is harmless belt-and-suspenders.)
 *
 * @param probe          the probe result (`{ results, pageErrors }`)
 * @param expectedFlows  the spec's `*_FLOWS` constant — every one must have run
 * @param opts.dimension the `recordCoverage` dimension, e.g. `'loot.flow'`
 * @param opts.label     the human label in the failure summary, e.g. `'loot'`
 */
export function assertFlowResults(probe: FlowProbe, expectedFlows: readonly string[], opts: { dimension: string; label: string }): void {
    const seen = new Set<string>();
    const failures: string[] = [];
    for (const r of probe.results) {
        seen.add(r.name);
        if (r.ok) recordCoverage(opts.dimension, r.name);
        else failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
    }
    for (const flow of expectedFlows) {
        if (!seen.has(flow)) failures.push(`${flow}: flow did not run`);
    }
    if (probe.pageErrors.length > 0) {
        failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
    }
    expect(failures, `${failures.length}/${expectedFlows.length} ${opts.label} flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
}
