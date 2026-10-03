/**
 * @file acquisition-resources - which acquisition currencies a character's
 * Resources panel shows, per game line.
 *
 * Each line's RAW acquisition currency (and the throne-gelt baseline every line
 * shares) is declared once in `WH40K.currencies`; this derives the panel rows
 * from that table instead of hard-wiring one line's set onto all of them.
 */

/** The `WH40K.currencies` fields this module reads. */
export interface ResourceCurrency {
    label: string;
    line: string;
    walletPath: string;
    primary?: boolean;
}

/** One Resources-panel row: the actor field to bind and its label key. */
export interface ResourceRow {
    field: string;
    labelKey: string;
}

/**
 * Rows for `line`: the line's own currencies, then the primary (throne-gelt)
 * baseline unless the line's currency already is it (DH1). Currencies whose
 * wallet already has an editor elsewhere on the sheet (`shownElsewhere`) are
 * skipped so one value never gets two inputs.
 */
export function lineResourceRows(line: string, currencies: Readonly<Record<string, ResourceCurrency>>, shownElsewhere: ReadonlySet<string>): ResourceRow[] {
    const all = Object.values(currencies);
    const rows = all.filter((c) => c.line === line).map((c) => ({ field: c.walletPath, labelKey: c.label }));
    const primary = all.find((c) => c.primary === true);
    if (primary !== undefined && !rows.some((r) => r.field === primary.walletPath)) {
        rows.push({ field: primary.walletPath, labelKey: primary.label });
    }
    return rows.filter((r) => !shownElsewhere.has(r.field));
}
