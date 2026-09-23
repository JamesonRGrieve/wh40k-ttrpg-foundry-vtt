/**
 * @file CelestialBodiesDialog — GM editor for the campaign's celestial bodies
 * (#588): each body's name, rotation period, orbital period, axial tilt and
 * CURRENT weather. The bodies drive the world-time widget's local clock and the
 * darkness of every scene bound to one (Scene Config → "Celestial body").
 *
 * The bodies are world data (the `celestial-bodies` setting), so this is the only
 * place a campaign's planets and moons are defined — none are hardcoded. Opened
 * from the world-time widget's GM controls. All conversion
 * between form rows and stored bodies is the pure, unit-tested
 * `bodiesFromRows` / `rowsFromBodies` in `rules/scene-lighting.ts`.
 */

import { t } from '../../i18n/t.ts';
import { bodiesFromRows, type CelestialBodyRow, rowsFromBodies, WEATHER_KINDS, weatherLabelKey } from '../../rules/scene-lighting.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** A field each body row posts (`data-field` in the template). */
type RowField = keyof CelestialBodyRow;

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 context is a free-form template payload; Record<string, unknown> is the correct base shape
interface CelestialBodiesContext extends Record<string, unknown> {
    rows: Array<CelestialBodyRow & { index: number }>;
    weatherOptions: Array<{ value: string; label: string }>;
}

export default class CelestialBodiesDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'celestial-bodies-dialog',
        classes: ['wh40k-rpg', 'celestial-bodies-dialog'],
        tag: 'div',
        window: {
            title: 'WH40K.CelestialBodies.Title',
            icon: 'fa-solid fa-earth-europe',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 720,
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry accepts 'auto' at runtime but types declare number
            height: 'auto' as unknown as number,
        },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            addBody: CelestialBodiesDialog.#onAddBody,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            removeBody: CelestialBodiesDialog.#onRemoveBody,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            save: CelestialBodiesDialog.#onSave,
        },
    };

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/celestial-bodies.hbs',
        },
    };

    /** The rows being edited (seeded from the setting, mutated by add/remove). */
    #rows: CelestialBodyRow[] = rowsFromBodies(WH40KSettings.getCelestialBodies());

    /** @override */
    get title(): string {
        return t('WH40K.CelestialBodies.Title');
    }

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<CelestialBodiesContext> {
        const context = await super._prepareContext(options);
        return {
            ...context,
            rows: this.#rows.map((row, index) => ({ ...row, index })),
            weatherOptions: WEATHER_KINDS.map((value) => ({ value, label: game.i18n.localize(weatherLabelKey(value)) })),
        };
    }

    /** Read the rows as currently typed, so add/remove keeps unsaved edits. */
    #readRows(): CelestialBodyRow[] {
        const rows: CelestialBodyRow[] = [];
        for (const row of this.element.querySelectorAll<HTMLElement>('[data-wh40k-hook="cb-row"]')) {
            const value = (field: RowField): string => row.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${field}"]`)?.value ?? '';
            rows.push({
                key: value('key'),
                name: value('name'),
                rotationHours: value('rotationHours'),
                orbitalDays: value('orbitalDays'),
                axialTilt: value('axialTilt'),
                weather: value('weather'),
            });
        }
        return rows;
    }

    /** Open the editor (GM only). */
    static open(): CelestialBodiesDialog | null {
        if (!game.user.isGM) {
            ui.notifications.warn(t('WH40K.CelestialBodies.GmOnly'));
            return null;
        }
        const dialog = new CelestialBodiesDialog();
        void dialog.render(true);
        return dialog;
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static async #onAddBody(this: CelestialBodiesDialog): Promise<void> {
        this.#rows = [...this.#readRows(), { key: '', name: '', rotationHours: '24', orbitalDays: '', axialTilt: '', weather: 'clear' }];
        await this.render();
    }

    static async #onRemoveBody(this: CelestialBodiesDialog, _event: Event, target: HTMLElement): Promise<void> {
        const index = Number(target.dataset['index']);
        this.#rows = this.#readRows().filter((_row, i) => i !== index);
        await this.render();
    }

    static async #onSave(this: CelestialBodiesDialog): Promise<void> {
        await WH40KSettings.setCelestialBodies(bodiesFromRows(this.#readRows()));
        await this.close();
    }
}
