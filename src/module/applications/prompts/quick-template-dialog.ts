/**
 * @file QuickTemplateDialog — drop an area on the map as a V14 Region (#758).
 *
 * Foundry V14 merged the old measured templates into Regions, whose own form is long. This
 * dialog asks only what a table needs: the shape and its size in metres, whether the area
 * blocks sight (a smokescreen), a condition tokens inside gain (Blinded, off by default),
 * and how many rounds it lasts. Place hands the canvas to a drag-to-place preview
 * (`canvas/area-placement.ts`), then the system builds the Region (`canvas/area-regions.ts`).
 *
 * Opened from the WH40K scene-control group.
 */
import { pickAreaPlacement } from '../../canvas/area-placement.ts';
import { clearSceneAreas, createAreaRegion } from '../../canvas/area-regions.ts';
import { t } from '../../i18n/t.ts';
import { applicationV2Base } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import {
    buildQuickTemplateContext,
    type ConditionOption,
    type FormValue,
    initialQuickTemplateState,
    type QuickTemplateContext,
    type QuickTemplateState,
    quickTemplateShape,
    readQuickTemplateForm,
} from './quick-template-view.ts';

/** Fill colour of a quick template. */
const QUICK_TEMPLATE_COLOR = '#c9a227';

/** The conditions the form offers: every registered status, by its localized name. */
function conditionOptions(): ConditionOption[] {
    return CONFIG.statusEffects.map((status) => ({ id: status.id, label: game.i18n.localize(status.name) })).sort((a, b) => a.label.localeCompare(b.label));
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface QuickTemplateRenderContext extends Record<string, unknown>, QuickTemplateContext {}

export default class QuickTemplateDialog extends ApplicationV2Mixin(applicationV2Base()) {
    /** The form's current state; kept across re-renders. */
    formState: QuickTemplateState = initialQuickTemplateState();

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'quick-template-dialog', 'standard-form'],
        actions: {
            place: QuickTemplateDialog.#onPlace,
            clear: QuickTemplateDialog.#onClear,
        },
        form: {
            handler: QuickTemplateDialog.#onFormChange,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        position: { width: 380 },
        window: { title: 'WH40K.Area.QuickTemplate.Title', resizable: false },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: { template: 'systems/wh40k-rpg/templates/prompt/quick-template-dialog.hbs', classes: [], scrollable: [] },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<QuickTemplateRenderContext> {
        const context = await super._prepareContext(options);
        return { ...context, ...buildQuickTemplateContext(this.formState, conditionOptions()) };
    }

    static async #onFormChange(this: QuickTemplateDialog, _event: Event, _form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: FormDataExtended.object is Foundry's untyped submitted form; readQuickTemplateForm validates each field
        this.formState = readQuickTemplateForm(this.formState, formData.object as Record<string, FormValue>);
        await this.render();
    }

    /** Hand the canvas to the drag-to-place preview, then build the area. */
    static async #onPlace(this: QuickTemplateDialog): Promise<void> {
        const shape = quickTemplateShape(this.formState);
        if (shape === null) return;
        const state = this.formState;
        await this.close();
        const placement = await pickAreaPlacement({ shape, color: QUICK_TEMPLATE_COLOR });
        if (placement === null) return;
        await createAreaRegion(
            {
                name: state.name === '' ? t('WH40K.Area.QuickTemplate.DefaultName') : state.name,
                shape,
                origin: placement.origin,
                rotation: placement.rotation,
                blocksSight: state.blocksSight,
                condition: state.condition,
                source: 'quick',
                color: QUICK_TEMPLATE_COLOR,
            },
            state.duration,
        );
    }

    /** Remove every area the system placed on this scene that the user may delete. */
    static async #onClear(this: QuickTemplateDialog): Promise<void> {
        await clearSceneAreas();
    }
}

/** Open the quick-template tool. */
export function openQuickTemplateDialog(): void {
    void new QuickTemplateDialog().render({ force: true });
}
