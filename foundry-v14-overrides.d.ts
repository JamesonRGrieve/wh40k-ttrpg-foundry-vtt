/**
 * Foundry VTT V14 Type Overrides
 *
 * Extends/patches the V13 community types (@league-of-foundry-developers/foundry-vtt-types)
 * for V14-specific API changes. Remove this file when V14 types are published.
 */

declare global {
    // =========================================================================
    // DataModel V14 Changes
    // =========================================================================

    namespace DataModelV14 {
        /**
         * V14 cleaning options — expanded from V13.
         * Controls how cleanData processes source data.
         */
        interface CleaningOptions {
            /** Add polymorphic type data to cleaned output (default: false) */
            addTypes?: boolean;
            /** Copy the input data before cleaning (default: true) */
            copy?: boolean;
            /** Expand dot-notation keys in the source (default: true) */
            expand?: boolean;
            /** Apply field-level cleaning (default: true) */
            fields?: boolean;
            /** Run data migrations (default: true) */
            migrate?: boolean;
            /** Run model-level joint cleaning (default: true) */
            model?: boolean;
            /** Treat source as partial data — skip default-filling for missing fields (default: false) */
            partial?: boolean;
            /** Prune keys not in schema (default: true) */
            prune?: boolean;
            /** Prune non-persisted fields (default: true) */
            persisted?: boolean;
            /** Sanitize user input. false to skip, {} or object for options (default: true) */
            sanitize?: boolean | Record<string, unknown>;
        }

        /**
         * V14 internal state object passed through cleaning and update recursion.
         * This is the critical third parameter to cleanData that V13 types don't have.
         */
        interface UpdateState {
            /** Whether cleaning options have been initialized */
            cleanOptions?: boolean;
            /** Whether this is a document creation (vs update) */
            creation?: boolean;
            /** The DataModel instance being operated on */
            model?: InstanceType<typeof foundry.abstract.DataModel>;
            /** The current source data of the model */
            source?: Record<string, unknown>;
            /** The root model source data */
            modelSource?: Record<string, unknown>;
            /** The requesting user */
            user?: unknown;
            /** The document type for TypeDataField resolution */
            documentType?: string;
            /** The document ID for validation error context */
            documentId?: string;
        }

        /**
         * V14 update options for DataModel.updateSource()
         */
        interface UpdateOptions {
            /** Cleaning options, or true to clean with defaults, or false to skip cleaning */
            clean?: boolean | CleaningOptions;
            /** If true, compute the diff without committing changes */
            dryRun?: boolean;
            /** Whether to use fallback values for invalid data */
            fallback?: boolean;
            /** Whether to perform recursive merging (default: true) */
            recursive?: boolean;
            /** Whether to restore delta data */
            restoreDelta?: boolean;
            /** The requesting user */
            user?: unknown;
            /** Whether to compute and return only the diff (default: true for document updates) */
            diff?: boolean;
        }
    }

    // =========================================================================
    // SchemaField V14 Changes
    // =========================================================================

    namespace SchemaFieldV14 {
        /**
         * V14 SchemaField._cleanType checks _state.source to decide whether
         * to clean missing fields. The critical line:
         *   const cleanField = (name in data) || !options.partial || !_state.source;
         * Without _state.source, ALL fields get cleaned even in partial mode.
         */
        interface CleanTypeState extends DataModelV14.UpdateState {
            source?: Record<string, unknown>;
        }
    }

    // =========================================================================
    // Document V14 Changes
    // =========================================================================

    namespace DatabaseOperationV14 {
        interface UpdateOperation {
            /** Array of update data objects (each must include _id) */
            updates: Record<string, unknown>[];
            /** Whether to compute diff (default: true) */
            diff?: boolean;
            /** Whether to merge recursively (default: true) */
            recursive?: boolean;
            /** Whether to re-render sheets (default: true) */
            render?: boolean;
            /** Suppress hooks */
            noHook?: boolean;
            /** Parent document */
            parent?: InstanceType<typeof foundry.abstract.Document>;
            /** Compendium pack ID */
            pack?: string;
        }
    }

    // =========================================================================
    // ApplicationV2 V14 Changes
    // =========================================================================

    namespace ApplicationV2Config {
        interface FormConfiguration {
            /** Form submission handler function */
            handler?: (
                event: SubmitEvent,
                form: HTMLFormElement,
                formData: FormDataExtended,
                options?: Record<string, unknown>,
            ) => Promise<void>;
            /** Whether to auto-submit the form when any field changes */
            submitOnChange?: boolean;
            /** Whether to close the application after form submission */
            closeOnSubmit?: boolean;
        }

        interface DefaultOptions {
            /** Unique application ID pattern */
            id?: string;
            /** CSS classes */
            classes?: string[];
            /** Root element tag (default: 'div', DocumentSheetV2 default: 'form') */
            tag?: string;
            /** Form configuration */
            form?: FormConfiguration;
            /** Window configuration */
            window?: {
                title?: string;
                subtitle?: string;
                icon?: string;
                resizable?: boolean;
                controls?: Array<{
                    icon: string;
                    label: string;
                    action: string;
                    visible?: (() => boolean) | boolean;
                }>;
                contentTag?: string;
            };
            /** Position configuration */
            position?: {
                width?: number;
                height?: number;
                top?: number;
                left?: number;
            };
            /** Action handlers map */
            actions?: Record<string, Function | { handler: Function; buttons?: number[] }>;
        }

        interface RenderOptions {
            /** Force re-render even if already rendered */
            force?: boolean;
            /** Specific parts to re-render */
            parts?: string[];
            /** Whether this is the first render */
            isFirstRender?: boolean;
            /** Window options to update */
            window?: {
                title?: string;
                subtitle?: string;
            };
        }

        interface PartConfiguration {
            /** Path to the Handlebars template */
            template: string;
            /** Optional CSS classes for the part element */
            classes?: string[];
            /** Scrollable selectors within this part */
            scrollable?: string[];
            /** Container configuration for grouping parts */
            container?: {
                id: string;
                classes?: string[];
            };
        }
    }

    // =========================================================================
    // V14 HandlebarsApplicationMixin Tab Configuration
    // =========================================================================

    namespace HandlebarsApplicationV14 {
        interface TabConfiguration {
            tab: string;
            label: string;
            group?: string;
            icon?: string;
            cssClass?: string;
        }
    }

    // =========================================================================
    // FormDataExtended (used by DocumentSheetV2 form handlers)
    // =========================================================================

    class FormDataExtended extends FormData {
        constructor(form: HTMLFormElement, options?: { editors?: Record<string, unknown>; dtypes?: Record<string, string> });
        /** The processed form data as a plain object */
        object: Record<string, unknown>;
        /** Process the form data into a flat object */
        process(): Record<string, unknown>;
    }

    // =========================================================================
    // Hooks V14
    // =========================================================================

    namespace Hooks {
        function on(hook: string, fn: Function): number;
        function once(hook: string, fn: Function): number;
        function off(hook: string, fn: number | Function): void;
        function call(hook: string, ...args: unknown[]): boolean;
        function callAll(hook: string, ...args: unknown[]): boolean;
    }

    // =========================================================================
    // V14 Data Field Operator Classes
    // =========================================================================

    namespace foundry.data.operators {
        class DataFieldOperator {
            static get(value: unknown): unknown;
            static set(operator: DataFieldOperator, value: unknown): void;
        }
        class ForcedReplacement extends DataFieldOperator {}
        class ForcedDeletion extends DataFieldOperator {}
    }

    // =========================================================================
    // Augment foundry.abstract.TypeDataModel with V14 _state parameter
    // =========================================================================

    // The critical V14 change: cleanData takes a third _state parameter.
    // Systems MUST forward this parameter in any cleanData override or
    // partial updates will reset sibling fields to schema defaults.
    //
    // V13 signature: static cleanData(source?, options?)
    // V14 signature: static cleanData(source?, options?, _state?)
}

export {};
