/**
 * @file A wall's scan fields in the Wall Configuration (#759).
 *
 * An auspex sees through a wall up to a thickness its line prints (50 cm; DH2's Poor
 * scanner 20 cm), and not through certain shielding materials. Foundry walls have no
 * thickness, so the GM sets these on the wall: its thickness in centimetres and
 * whether it shields. Both are flags the scan reads (`canvas/auspex-scan-canvas.ts`);
 * a wall with neither is thin and hides nothing from a scanner.
 */
import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';

/** The form field names: the flags the wall sheet's submit writes. */
export const WALL_SCAN_THICKNESS_INPUT = `flags.${SYSTEM_ID}.scanThickness`;
export const WALL_SCAN_SHIELDED_INPUT = `flags.${SYSTEM_ID}.scanShielded`;

/** The labels the fields show. */
export interface WallScanLabels {
    legend: string;
    thickness: string;
    thicknessHint: string;
    shielded: string;
    shieldedHint: string;
}

/** A labelled form-group row holding one input, with its hint. */
function formRow(doc: Document, label: string, input: HTMLInputElement, hint: string): HTMLElement {
    const group = doc.createElement('div');
    group.className = 'form-group';
    const labelEl = doc.createElement('label');
    labelEl.textContent = label;
    const fields = doc.createElement('div');
    fields.className = 'form-fields';
    fields.appendChild(input);
    const hintEl = doc.createElement('p');
    hintEl.className = 'hint';
    hintEl.textContent = hint;
    group.append(labelEl, fields, hintEl);
    return group;
}

/** The wall's scan fields: thickness (cm, blank for a thin wall) and shielding. */
export function buildWallScanFields(doc: Document, labels: WallScanLabels, values: { thickness: number | null; shielded: boolean }): HTMLElement {
    const fieldset = doc.createElement('fieldset');
    fieldset.dataset['wallScan'] = 'true';
    const legend = doc.createElement('legend');
    legend.textContent = labels.legend;

    const thickness = doc.createElement('input');
    thickness.type = 'number';
    thickness.name = WALL_SCAN_THICKNESS_INPUT;
    thickness.min = '0';
    thickness.step = '1';
    thickness.placeholder = '—';
    thickness.value = values.thickness === null ? '' : String(values.thickness);
    thickness.dataset['dtype'] = 'Number';

    const shielded = doc.createElement('input');
    shielded.type = 'checkbox';
    shielded.name = WALL_SCAN_SHIELDED_INPUT;
    shielded.checked = values.shielded;

    fieldset.append(legend, formRow(doc, labels.thickness, thickness, labels.thicknessHint), formRow(doc, labels.shielded, shielded, labels.shieldedHint));
    return fieldset;
}

/** The wall sheet as the render hook hands it over. */
interface WallConfigLike {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Document#getFlag returns unknown; the caller narrows each flag it reads
    document?: { getFlag: (scope: string, key: string) => unknown } | null;
}

/** Add the scan fields to a GM's Wall Configuration, once per render. */
export function onRenderWallConfig(app: WallConfigLike, html: HTMLElement): void {
    if (!game.user.isGM || html.querySelector('[data-wall-scan]') !== null) return;
    const wall = app.document ?? null;
    if (wall === null) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Document#getFlag returns unknown; narrowed to the number / boolean the scan writes
    const thickness: unknown = wall.getFlag(SYSTEM_ID, 'scanThickness');
    const fields = buildWallScanFields(
        document,
        {
            legend: t('WH40K.Auspex.Wall.Legend'),
            thickness: t('WH40K.Auspex.Wall.Thickness'),
            thicknessHint: t('WH40K.Auspex.Wall.ThicknessHint'),
            shielded: t('WH40K.Auspex.Wall.Shielded'),
            shieldedHint: t('WH40K.Auspex.Wall.ShieldedHint'),
        },
        { thickness: typeof thickness === 'number' && thickness > 0 ? thickness : null, shielded: wall.getFlag(SYSTEM_ID, 'scanShielded') === true },
    );
    const host = html.querySelector('.form-footer') ?? html.querySelector('footer');
    const form = html.querySelector('form') ?? html;
    if (host !== null && host.parentElement !== null) host.parentElement.insertBefore(fields, host);
    else form.appendChild(fields);
}
