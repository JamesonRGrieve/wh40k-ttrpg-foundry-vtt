/**
 * Foundry VTT V14 Type Overrides
 *
 * Extends/patches the V13 community types (@league-of-foundry-developers/foundry-vtt-types,
 * fvtt-types) for V14-specific API changes. Remove this file when V14 types are published.
 *
 * All declarations live in this file. The `fvtt-types` package under `node_modules/` is
 * never modified — v14 shapes are added here as new reference namespaces/classes that
 * system code imports explicitly, or as `declare global` interface merges where the
 * upstream types allow.
 *
 * Source anchors point into /home/jameson/Documents/foundry-dump/scripts/foundry.mjs
 * (v14 runtime bundle) so future audits can re-verify each shape.
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
            /** Last-modified timestamp (set by framework during recursive updates) */
            modifiedTime?: number;
        }

        /**
         * V14 signature for DataModel#updateSource(changes, options).
         * @source foundry.mjs:11342, 11586
         * The v13 fvtt-types declares `updateSource(changes?, options?)` but the v14 options
         * bag is richer — use this type when annotating system-side updateSource calls.
         */
        type UpdateSourceSignature = (
            changes?: Record<string, unknown>,
            options?: UpdateOptions,
        ) => Record<string, unknown>;

        /**
         * V14 signature for DataModel.cleanData(source, options, _state).
         * @source foundry.mjs:13525
         * v13 fvtt-types: 2 args. v14 runtime: 3 args. System overrides that forward
         * _state to super.cleanData() must annotate their override with this signature.
         */
        type CleanDataSignature = (
            source?: Record<string, unknown>,
            options?: CleaningOptions,
            _state?: UpdateState,
        ) => Record<string, unknown>;
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

        /**
         * V14 signature for Document.updateDocuments(updates, operation).
         * @source foundry.mjs:14743
         */
        type UpdateDocumentsSignature = (
            updates?: Record<string, unknown>[],
            operation?: UpdateOperation,
        ) => Promise<InstanceType<typeof foundry.abstract.Document>[]>;
    }

    // =========================================================================
    // Document V14 Lifecycle Method Signatures
    // =========================================================================

    /**
     * V14 Document lifecycle hooks.
     * @source foundry.mjs:15122, 15133, 15181, 15192, 15238
     *
     * Parameter convention in V14:
     *   - pre-ops (_preCreate / _preUpdate / _preDelete) receive a User *instance* as `user`
     *   - post-ops (_onCreate / _onUpdate / _onDelete) receive a userId *string* as `userId`
     *
     * The system currently has 5 Document lifecycle overrides (BaseActor, Vehicle, NPC-V2,
     * Starship, Item) — use these signatures when annotating them.
     */
    namespace DocumentV14Lifecycle {
        type PreCreate<D = Record<string, unknown>> = (
            data: D,
            options: Record<string, unknown>,
            user: unknown,
        ) => Promise<boolean | void>;

        type PreUpdate<D = Record<string, unknown>> = (
            changes: D,
            options: Record<string, unknown>,
            user: unknown,
        ) => Promise<boolean | void>;

        type PreDelete = (
            options: Record<string, unknown>,
            user: unknown,
        ) => Promise<boolean | void>;

        type OnCreate<D = Record<string, unknown>> = (
            data: D,
            options: Record<string, unknown>,
            userId: string,
        ) => void;

        type OnUpdate<D = Record<string, unknown>> = (
            changed: D,
            options: Record<string, unknown>,
            userId: string,
        ) => void;

        type OnDelete = (
            options: Record<string, unknown>,
            userId: string,
        ) => void;

        type OnCreateDescendantDocuments = (
            parent: InstanceType<typeof foundry.abstract.Document>,
            collection: string,
            documents: InstanceType<typeof foundry.abstract.Document>[],
            data: Record<string, unknown>[],
            options: Record<string, unknown>,
            userId: string,
        ) => void;

        type OnUpdateDescendantDocuments = (
            parent: InstanceType<typeof foundry.abstract.Document>,
            collection: string,
            documents: InstanceType<typeof foundry.abstract.Document>[],
            changes: Record<string, unknown>[],
            options: Record<string, unknown>,
            userId: string,
        ) => void;

        type OnDeleteDescendantDocuments = (
            parent: InstanceType<typeof foundry.abstract.Document>,
            collection: string,
            documents: InstanceType<typeof foundry.abstract.Document>[],
            ids: string[],
            options: Record<string, unknown>,
            userId: string,
        ) => void;

        /**
         * Static pre-operation hook for bulk creates (used by ItemContainer).
         * @source foundry.mjs search for `_onCreateOperation`
         */
        type OnCreateOperationStatic = (
            documents: InstanceType<typeof foundry.abstract.Document>[],
            context: Record<string, unknown>,
            user: unknown,
        ) => Promise<void>;
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
            /** Legacy V1-style tab config still used by some migrated sheets */
            tabs?: Array<{
                navSelector: string;
                contentSelector: string;
                initial?: string;
                group?: string;
            }>;
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

    /**
     * V14 ApplicationV2 / HandlebarsApplicationMixin lifecycle method signatures.
     * @source foundry.mjs:29048 (_onRender), 30197 (_prepareContext), 31042 (changeTab)
     *
     * The 30 sheets in the system each implement some subset of these. Use these
     * signatures when annotating method overrides; fvtt-types' ApplicationV2 class
     * already declares the matching prototype stubs, so these exist to document the
     * v14 shapes and allow call-site typing where the upstream types are too lax.
     */
    namespace ApplicationV2Lifecycle {
        type PrepareContext = (
            options: ApplicationV2Config.RenderOptions,
        ) => Promise<Record<string, unknown>>;

        type OnRender = (
            context: Record<string, unknown>,
            options: ApplicationV2Config.RenderOptions,
        ) => Promise<void> | void;

        type RenderHTML = (
            context: Record<string, unknown>,
            options: ApplicationV2Config.RenderOptions,
        ) => Promise<unknown>;

        type ReplaceHTML = (
            result: unknown,
            content: HTMLElement,
            options: ApplicationV2Config.RenderOptions,
        ) => void;

        type OnSubmitForm = (
            formConfig: ApplicationV2Config.FormConfiguration,
            event: SubmitEvent | Event,
        ) => Promise<void>;

        /**
         * V14 changeTab signature (HandlebarsApplicationMixin).
         * @source foundry.mjs:31042
         */
        type ChangeTab = (
            tab: string,
            group: string,
            options?: {
                event?: Event;
                navElement?: HTMLElement;
                force?: boolean;
                updatePosition?: boolean;
            },
        ) => void;
    }

    // =========================================================================
    // V14 HandlebarsApplicationMixin Tab Configuration
    // =========================================================================

    namespace HandlebarsApplicationV14 {
        /**
         * A single-tab descriptor (one entry inside a TabGroupConfiguration.tabs map).
         * @source foundry.mjs:32424 (example TABS shape)
         *
         * Note: fvtt-types declares `ApplicationV2.TabsConfiguration` (plural) as the
         * group-level wrapper type. This `TabDescriptor` is the *inner* per-tab shape
         * that the wrapper's `.tabs` record is keyed against.
         */
        interface TabDescriptor {
            tab: string;
            label: string;
            group?: string;
            icon?: string;
            cssClass?: string;
        }

        /**
         * Group-level tab configuration. V14 `static TABS` is
         * `Record<groupId, TabGroupConfiguration>`.
         * @source foundry.mjs:29654, 32424
         */
        interface TabGroupConfiguration {
            initial?: string;
            tabs: Record<string, TabDescriptor>;
        }

        /**
         * The `tabGroups` instance property — tracks the active tab per group.
         * @source foundry.mjs search for `this.tabGroups`
         */
        type TabGroupsState = Record<string, string>;

        /** @deprecated Use `TabDescriptor`. Retained for back-compat with existing imports. */
        // eslint-disable-next-line @typescript-eslint/no-empty-interface
        interface TabConfiguration extends TabDescriptor {}
    }

    // =========================================================================
    // FormDataExtended (used by DocumentSheetV2 form handlers)
    // =========================================================================

    /**
     * @source foundry.mjs:29316 — FormDataExtended constructor (v14)
     * v14 adds `disabled` and `readonly` boolean options to the constructor.
     */
    class FormDataExtended extends FormData {
        constructor(
            form: HTMLFormElement,
            options?: {
                editors?: Record<string, unknown>;
                dtypes?: Record<string, string>;
                /** v14: whether disabled inputs are included (default: false) */
                disabled?: boolean;
                /** v14: whether readonly inputs are included (default: true) */
                readonly?: boolean;
            },
        );
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

    /**
     * @source foundry.mjs:1309-1390 — foundry.data.operators classes (v14)
     * The operators namespace is entirely absent from fvtt-types v13; it is a pure v14
     * addition used by DataModel.updateSource() to express non-merging updates
     * (replacements and deletions) without trampling sibling fields.
     */
    namespace foundry.data.operators {
        class DataFieldOperator {
            constructor(value: unknown);
            /** Extract the underlying value if `value` is a DataFieldOperator; otherwise return it unchanged */
            static get(value: unknown): unknown;
            /** Apply a DataFieldOperator's intent at the target location */
            static set(operator: DataFieldOperator, value: unknown): void;
            /** Equality comparison honoring operator semantics */
            static equals(a: unknown, b: unknown): boolean;
        }
        class ForcedReplacement extends DataFieldOperator {
            /** Wrap a value so that DataModel merging replaces instead of recursively merging */
            static create(value: unknown): unknown;
        }
        class ForcedDeletion extends DataFieldOperator {}
    }

    // =========================================================================
    // V14 DataField instance-method signatures (for system field subclasses)
    // =========================================================================

    /**
     * V14 signatures for DataField / SchemaField / ObjectField / TypeDataField
     * instance methods that the system overrides.
     * @source foundry.mjs:9606, 10035, 10415, 10586, 10898, 11473, 11847, 12217, 12761, 12963
     *
     * The 19 system `_cleanData` overrides and the custom `MappingField._cleanType`
     * in `src/module/data/fields/mapping-field.ts` must adopt the 3-arg form to
     * participate correctly in partial updates. Use these types when annotating
     * those overrides.
     */
    namespace DataFieldV14 {
        /**
         * Generic v14 `_cleanType(value, options, _state)` signature for any field class.
         * TypeDataField and ObjectField both use this three-arg form in v14.
         */
        type CleanType = <V = unknown>(
            value: V,
            options?: DataModelV14.CleaningOptions,
            _state?: DataModelV14.UpdateState,
        ) => V;

        /**
         * Generic v14 `initialize(value, model, options)` signature. Kept as a reference
         * so custom field subclasses can annotate their override consistently.
         */
        type Initialize = (
            value: unknown,
            model: InstanceType<typeof foundry.abstract.DataModel>,
            options?: Record<string, unknown>,
        ) => unknown;

        /**
         * Static `_cleanData(source, options, _state)` signature on DataModel subclasses
         * (the pattern the 19 system data templates use). This mirrors
         * `DataModelV14.CleanDataSignature` but is kept here for discoverability
         * alongside the field signatures it interacts with.
         */
        type StaticCleanData = (
            source?: Record<string, unknown>,
            options?: DataModelV14.CleaningOptions,
            _state?: DataModelV14.UpdateState,
        ) => Record<string, unknown>;
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
    //
    // See `DataModelV14.CleanDataSignature` / `DataFieldV14.StaticCleanData`
    // for the concrete function types system code should annotate overrides with.
    //
    // V14 partial-update propagation chain (for future maintainers):
    //   Document.updateDocuments(updates, operation)
    //     → Document.update(changes, operation)
    //       → DataModel.updateSource(changes, UpdateOptions)
    //         → DataModel.cleanData(source, CleaningOptions, UpdateState)
    //           → Field._cleanType(value, CleaningOptions, UpdateState)
    //             (TypeDataField uses UpdateState.documentType to resolve polymorphic types)

    // =========================================================================
    // foundry.applications Namespace
    // =========================================================================

    namespace foundry.applications.api {
        // fvtt-types' _module.d.mts re-exports the default of application.mjs as both
        // "ApplicationV2" and "Application". Under some tsconfig configurations (notably
        // moduleResolution:bundler with the fvtt-types 13.x package shape), the
        // "ApplicationV2" alias may not resolve through the namespace re-export chain.
        // Declaring these here ensures every
        //   const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
        // call compiles without 'Property api does not exist' errors.
        class ApplicationV2 {
            get element(): HTMLElement;
            render(options?: boolean | Record<string, unknown>): Promise<unknown>;
            close(options?: Record<string, unknown>): Promise<unknown>;
            submit(): Promise<void>;
            _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>>;
            _onRender(context: Record<string, unknown>, options: Record<string, unknown>): void | Promise<void>;
        }
        namespace ApplicationV2 {
            type Any = ApplicationV2;
        }
        function HandlebarsApplicationMixin<TBase extends new (...args: any[]) => ApplicationV2>(
            Base: TBase,
        ): TBase;
        class DialogV2 {
            constructor(options?: Record<string, unknown>);
            render(force?: boolean): Promise<unknown>;
            close(options?: Record<string, unknown>): Promise<unknown>;
            static confirm(options?: Record<string, unknown>): Promise<boolean>;
            static prompt(options?: Record<string, unknown>): Promise<string | null>;
        }
        class FormDataExtended extends FormData {
            constructor(form: HTMLFormElement, options?: Record<string, unknown>);
            object: Record<string, unknown>;
            toObject(): Record<string, unknown>;
        }
    }

    namespace foundry.applications.handlebars {
        /**
         * Render a Handlebars template.
         * @param template The path to the template file
         * @param data The data to render the template with
         * @returns The rendered HTML string
         */
        function renderTemplate(template: string, data: Record<string, unknown>): Promise<string>;
    }

    namespace foundry.applications.apps {
        class DocumentSheetConfig {
            static registerSheet(documentClass: any, scope: string, sheetClass: any, options?: Record<string, any>): void;
            static unregisterSheet(documentClass: any, scope: string, sheetClass: any): void;
        }
    }

    // =========================================================================
    // foundry.appv1 Namespace
    // =========================================================================

    namespace foundry.appv1.sheets {
        class ActorSheet {}
        class ItemSheet {}
    }

    // =========================================================================
    // Runtime Value Access for foundry.data.fields
    // =========================================================================
    //
    // fvtt-types declares foundry.data.fields as a type namespace but not as a
    // runtime-accessible value. At runtime in Foundry VTT, foundry.data.fields
    // is an object containing all field constructors (NumberField, StringField,
    // etc.). This declaration bridges the gap so that
    //   `const fields = foundry.data.fields;`
    // compiles without `as any`.
    namespace foundry.data {
        const fields: typeof foundry.data.fields;
    }
}

export {};
