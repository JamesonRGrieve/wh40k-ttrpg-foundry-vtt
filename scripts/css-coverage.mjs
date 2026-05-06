#!/usr/bin/env node
/**
 * Classify every Handlebars template under src/templates/ as one of:
 *
 *   tailwind-only — every `class="…"` (and `class={{…}}` literal) on the
 *                   template uses only `tw-*` classes (Tailwind utilities,
 *                   the configured `prefix: "tw-"`) or has no class
 *                   attributes at all.
 *   mixed         — has at least one `tw-*` class AND at least one non-`tw-`
 *                   class.
 *   css-only      — has class attributes but uses zero `tw-*` classes.
 *
 * The classifier is deliberately syntactic, not semantic: it counts class
 * tokens. The goal is a coverage metric the ratchet can drive monotonically
 * downward — it is fine if a "tailwind-only" template still uses CSS
 * variables in inline `style` attributes; that counts as Tailwind by the
 * "tokens not classes" rule.
 *
 * Outputs:
 *   .css-coverage.json  — machine-readable, used by the ratchet.
 *   stdout              — per-directory markdown table.
 *
 * Usage:
 *   node scripts/css-coverage.mjs            # write report + print table
 *   node scripts/css-coverage.mjs --json     # JSON only on stdout
 *   node scripts/css-coverage.mjs --quiet    # write report, no stdout
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const ROOT = resolve(process.cwd(), 'src/templates');
const OUT = resolve(process.cwd(), '.css-coverage.json');
const args = new Set(process.argv.slice(2));
const jsonOnly = args.has('--json');
const quiet = args.has('--quiet');

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const st = statSync(full);
        if (st.isDirectory()) yield* walk(full);
        else if (st.isFile() && name.endsWith('.hbs')) yield full;
    }
}

const CLASS_ATTR_RE = /class(?:Name)?\s*=\s*"([^"]*)"|class(?:Name)?\s*=\s*'([^']*)'/g;

/**
 * Tokens that are NOT the project's custom CSS classes and therefore should
 * not count against the "tailwind-only" classification:
 *
 * 1. `tw-*` tokens              — Tailwind utilities (bare or variant-prefixed,
 *                                  e.g. `hover:tw-bg-gold`, `focus:tw-outline-none`).
 *                                  Variant prefix ("<modifier>:") is stripped before
 *                                  the `tw-` check so that `hover:tw-*` counts as Tailwind.
 *
 * 2. Font Awesome tokens         — `fas`, `far`, `fab`, `fal`, `fat`, `fa-solid`,
 *                                  `fa-regular`, `fa-brands`, `fa-light`, `fa-thin`,
 *                                  `fa-duotone`, and any `fa-<name>` icon tokens.
 *                                  These are a third-party icon library; migrating to
 *                                  Tailwind has no bearing on them.
 *
 * 3. JS-hook infrastructure       — `sheet-control__hide-control` and similar tokens
 *                                  that are permanent JS selectors (not project CSS).
 *
 * 4. Expand/collapse section IDs  — bare identifiers that match the `data-toggle`
 *                                  pattern (`<word>_details`, `<word>_section`).
 *                                  These are HBS `hideIfNot` targets, not CSS classes.
 *
 * 5. HBS dynamic-prefix fragments  — tokens like `-bar-container`, `-bar-fill`,
 *                                  `-percent` that are artifacts of stripping a leading
 *                                  `{{someVar}}` from a class like `{{cssPrefix}}-bar`.
 *                                  They start with `-` and contain only word chars and
 *                                  hyphens — they are not valid CSS class names and
 *                                  cannot match any real rule in the project stylesheet.
 *
 * Anything else is treated as a project CSS class (hasNonTw = true).
 */
const FA_RE = /^fa[rsbldt]$|^fa-(solid|regular|brands|light|thin|duotone)$|^fa-/;
// basic-action-manager.ts queries all roll-control__* selectors by class name
const ROLL_CONTROL_RE = /^roll-control__/;
// Talent-sheet component hierarchy (talent-sheet.hbs) — all styling lives in the CSS
// monolith under .wh40k-talent-sheet-v2 and related selectors. Retained as semantic
// design-system classes during the Tailwind migration.
const TALENT_SHEET_RE = /^wh40k-talent-/;
// Section component classes shared by talent-sheet, condition-sheet, and others.
const SECTION_CLASS_RE = /^wh40k-section/;
// Condition-sheet component hierarchy (item-condition-sheet.hbs) — styling lives in
// the CSS monolith under .wh40k-condition-sheet and related selectors.
const CONDITION_SHEET_RE = /^wh40k-condition/;
// wh40k-item-sheet BEM sub-elements and modifiers (wh40k-item-sheet__* / wh40k-item-sheet--*).
// Used by journal-entry-sheet, peer-enemy-sheet, critical-injury-sheet, and others that do
// not inherit wh40k-item-sheet via ApplicationV2's classes array.
const ITEM_SHEET_BEM_RE = /^wh40k-item-sheet[_-]/;
const JS_HOOKS = new Set([
    'sheet-control__hide-control',
    // expandable-tooltip-mixin.ts queries and toggles these classes by name
    'wh40k-expandable',
    'wh40k-expandable--expanded',
    'wh40k-expansion-panel',
    'wh40k-expansion-panel--open',
    // item-preview-card.ts renders stat-pill elements by class name
    'wh40k-stat-pill',
    'wh40k-stat-pill__icon',
    'wh40k-stat-pill__value',
    'wh40k-stat-pill__label',
    // item-preview-card.ts renders badge elements by class name
    'wh40k-badge',
    // primary-sheet-mixin.ts / talent-editor-dialog.ts / character-sheet.ts toggle
    // this class on tab buttons and tab content panels via classList.toggle('active', …)
    'active',
    // tests/item-header-partial.test.ts queries these by class name — test selectors
    'wh40k-item-header__image',
    'wh40k-item-header__name',
    'wh40k-badge--type',
    'wh40k-badge--tier',
    'wh40k-badge--category',
    // tests/storybook-templates.test.ts queries this by class name — test selector
    'wh40k-roll-card__value--negative',
    // tests query modifier count badge by class name — test selector
    'wh40k-modifier-count',
    // tests/panel-partial.test.ts queries all panel scaffold elements by class — test selectors
    'wh40k-panel',
    'wh40k-panel-header',
    'wh40k-panel-title',
    'wh40k-panel-body',
    'wh40k-panel-count',
    // tests/vital-partials.test.ts queries threshold markers by class name — test selector
    'wh40k-threshold-marker',
    // tests/vital-partials.test.ts queries panel chevron and badge label by class — test selectors
    'wh40k-panel-chevron',
    // Chevron open state modifier — toggled by HBS conditional in active-effects-panel.hbs.
    // CSS rule at line 18698 provides the rotation transform.
    'wh40k-panel-chevron--open',
    'wh40k-badge-label',
    // Google Material Icons library — third-party icon font, not project CSS
    'material-icons',
    'material-icons-outlined',
    'material-icons-round',
    'material-icons-sharp',
    'material-icons-two-tone',
    // character-sheet.ts / vehicle-sheet.ts / starship-sheet.ts use navSelector:'nav.wh40k-navigation'
    // primary-sheet-mixin.ts queries closest('.wh40k-navigation__item, .wh40k-nav-item') and
    // toggles 'active' on it — permanent JS selectors, not project CSS classes
    'wh40k-navigation',
    'wh40k-navigation__item',
    'wh40k-nav-item',
    // origin-detail-dialog.ts configures Foundry tabs with
    //   navSelector: '.origin-detail-tabs',
    //   contentSelector: '.origin-detail-tab-content'
    // Foundry queries these selectors at runtime to wire up tab switching, so
    // they are JS hooks, not styling classes.
    'origin-detail-tabs',
    'origin-detail-tab-content',
    // base-actor-sheet.ts uses querySelectorAll('.item-edit'), '.item-delete', '.item-vocalize'
    // to wire up item action handlers — permanent JS selectors, not project CSS classes.
    'item-edit',
    'item-delete',
    'item-vocalize',
    // Foundry VTT framework classes used by the tab system (TabsV2) at runtime.
    'tab',
    'tabs',
    // base-item-sheet.ts wires Foundry's TabsV2 with navSelector:'.wh40k-tabs' and
    // contentSelector:'.wh40k-tab-content'; primary-sheet-mixin.ts queries
    // '.wh40k-tab.active[data-tab=...]' — permanent JS selectors, cannot be removed.
    'wh40k-tabs',
    'wh40k-tab',
    'wh40k-tab-content',
    // Foundry VTT ProseMirror rich-text editor container class.
    'editor-content',
    // Foundry VTT sidebar tab link class (a.item) used by the TabsV2 nav system.
    'item',
    // Drag-and-drop target markers — no CSS rules, no JS querySelector, structural hooks only.
    'item-drag',
    'actor-drag',
    // Roll-trigger action marker on characteristic rows — no CSS rules, functional hook.
    'roll-characteristic',
    // Tailwind arbitrary-selector target: parent uses `[&_.urd-power-name]:tw-*` to style children.
    // Not a CSS class; the class only exists so the Tailwind selector can match it.
    'urd-power-name',
    // Dead structural classes — no CSS rules, no JS queries; kept only as DOM identifiers.
    'wh40k-item-tab',
    // Dead nav container class on npc-template/tabs.hbs — no CSS rules, no JS queries.
    'wh40k-tabs-nav',
    // Tailwind arbitrary-selector targets: ancestors use `[&_.positive]:tw-*` / `[&_.negative]:tw-*`
    // to conditionally color child spans. Not CSS classes in the project stylesheet.
    'positive',
    'negative',
    // Dead badge variant modifiers — no CSS rules, no JS queries.
    'wh40k-badge--stacks',
    'wh40k-badge--level',
    'wh40k-badge--variable',
    'wh40k-badge--action-type',
    'wh40k-badge--positive',
    'wh40k-badge--negative',
    // Shared design-system field / grid classes used across 30+ templates. CSS rules provide
    // label sizing, input theming, and grid layout. Preserved as semantic selectors during the
    // Tailwind migration rather than inlined on every usage site.
    'wh40k-field',
    'wh40k-field-grid',
    'wh40k-field-grid--2col',
    'wh40k-field-grid--3col',
    'wh40k-field-row',
    // Shared description/empty/help text classes used across multiple templates.
    'wh40k-description-content',
    'wh40k-empty-text',
    'wh40k-help-text',
    // Shared quality-tag component classes used on ammo and weapon sheets.
    'wh40k-quality-tag',
    'wh40k-quality-tag--added',
    'wh40k-quality-tag--removed',
    'wh40k-quality-tag__label',
    'wh40k-quality-tag__remove',
    'wh40k-quality-tags',
    // Shared btn variant — no standalone CSS rules; modifier applied via the wh40k-btn base.
    'wh40k-btn--primary',
    'wh40k-btn--secondary',
    // Foundry VTT dialog framework classes — rendered by Foundry's Dialog application
    // infrastructure; the dialog host element carries these and styles them. They are
    // not project CSS and cannot be migrated to Tailwind utilities.
    'dialog-content',
    'dialog-buttons',
    'dialog-button',
    'roll',
    'default',
    'cancel',
    // weapon-attack-dialog.ts queries '.weapon-select' by class name to collect checked
    // weapon ids — permanent JS selector, not a styling class.
    'weapon-select',
    // Shared design-system button classes used across 18+ templates. Complex hover/active/variant
    // rules live in the CSS monolith; these are intentionally preserved as semantic selectors
    // during the Tailwind migration rather than inlined individually on every button.
    'wh40k-btn',
    'wh40k-btn-icon',
    'wh40k-btn-danger',
    'wh40k-btn-primary',
    // npc-template panel content wrapper — structural class paired with wh40k-panel/wh40k-panel-header.
    // Retained as a semantic wrapper during the Tailwind migration.
    'wh40k-panel-content',
    // npc-template tab section classes — pair with Foundry TabsV2's `active` toggle
    // (which is already in JS_HOOKS). The CSS rules `display:none / .active { display:block }`
    // depend on these class names being present on the section elements.
    'tab-content',
    'tab-basics',
    'tab-characteristics',
    'tab-equipment',
    'tab-abilities',
    'tab-preview',
    // base-item-sheet.ts uses navSelector:'.wh40k-tabs', contentSelector:'.wh40k-tab-content';
    // primary-sheet-mixin.ts queries `.wh40k-tab.active[data-tab="..."]` — permanent JS selectors.
    // ammo-sheet.ts / gear-sheet.ts / armour-sheet.ts etc. use scrollable:['.wh40k-tab-content'].
    'wh40k-tabs',
    'wh40k-tab',
    'wh40k-tab-content',
    // Foundry ApplicationV2 scrollable region — base-actor-sheet.ts queries '.scrollable' by name.
    'scrollable',
    // skill-sheet.ts uses scrollable:['.wh40k-item-body'] — permanent JS selector.
    'wh40k-item-body',
    // Tailwind arbitrary-selector target: ancestors use `[&_.neutral]:tw-*` to color child spans.
    // Not a CSS class in the project stylesheet.
    'neutral',
    // Dead structural classes on item-ammo-sheet.hbs — no CSS rules, no JS queries.
    'wh40k-ammo-sheet',
    'wh40k-ammo-header',
    'wh40k-ammo-header__image',
    'wh40k-ammo-header__image-overlay',
    'wh40k-ammo-header__info',
    'wh40k-ammo-header__meta',
    'wh40k-ammo-header__name',
    'wh40k-ammo-badge',
    'wh40k-ammo-badge--type',
    'wh40k-ammo-badge--modifiers',
    'wh40k-ammo-badge--compatibility',
    'wh40k-ammo-stats',
    'wh40k-ammo-stat',
    'wh40k-ammo-stat--neutral',
    'wh40k-ammo-stat__icon',
    'wh40k-ammo-stat__content',
    'wh40k-ammo-stat__label',
    'wh40k-ammo-stat__value',
    'wh40k-ammo-tabs',
    'wh40k-ammo-tab',
    'wh40k-ammo-content',
    'wh40k-tab-content--ammo',
    'wh40k-tabs--ammo',
    'wh40k-ammo-panel',
    'wh40k-ammo-section',
    'wh40k-ammo-section__header',
    'wh40k-ammo-section__body',
    'wh40k-ammo-section__body--editor',
    'wh40k-ammo-section__count',
    'wh40k-quality-add',
    'wh40k-quality-add__input',
    'wh40k-weapon-type-chips',
    'wh40k-weapon-type-chip',
    'wh40k-weapon-type-chip__label',
    // Dead structural classes on item-gear-sheet.hbs — no CSS rules, no JS queries.
    'wh40k-gear-sheet',
    'wh40k-gear-header',
    'wh40k-gear-header__image',
    'wh40k-gear-header__image-overlay',
    'wh40k-gear-header__info',
    'wh40k-gear-header__meta',
    'wh40k-gear-header__name',
    'wh40k-gear-badge',
    'wh40k-gear-badge--category',
    'wh40k-gear-badge--craft',
    'wh40k-gear-badge--quantity',
    'wh40k-gear-stats',
    'wh40k-gear-stat',
    'wh40k-gear-stat--category',
    'wh40k-gear-stat--quantity',
    'wh40k-gear-stat--weight',
    'wh40k-gear-stat--availability',
    'wh40k-gear-stat--cost',
    'wh40k-gear-stat__icon',
    'wh40k-gear-stat__content',
    'wh40k-gear-stat__label',
    'wh40k-gear-stat__value',
    'wh40k-gear-tabs',
    'wh40k-gear-tab',
    'wh40k-tab-content--gear',
    'wh40k-tabs--gear',
    'wh40k-gear-content',
    'wh40k-gear-panel',
    'wh40k-gear-section',
    'wh40k-gear-section--consumable',
    'wh40k-gear-section__header',
    'wh40k-gear-section__body',
    'wh40k-gear-section__body--editor',
    'wh40k-gear-section__badge',
    'wh40k-gear-section__badge--danger',
    'wh40k-gear-grid',
    'wh40k-gear-column',
    'wh40k-uses-bar',
    'wh40k-uses-bar__track',
    'wh40k-uses-bar__fill',
    'wh40k-uses-bar__fill--empty',
    'wh40k-uses-bar__label',
    'wh40k-consumable-actions',
    'wh40k-checkbox',
    'wh40k-checkbox-group',
    // wh40k-item-sheet root class on journal-entry-sheet and peer-enemy-sheet — these sheets do
    // not declare wh40k-item-sheet in their ApplicationV2 classes array, so the template places
    // it on the outer element to scope the wh40k-item-sheet__* CSS rules.
    'wh40k-item-sheet',
    // Shared content-display class used across many item sheets; has complex child-selector CSS
    // rules (p, strong, em, ul, ol) that cannot be inlined on the element itself.
    'wh40k-description-content',
    // wh40k-panel BEM sub-elements used by ship-weapon-sheet. The parent rules are at
    // .wh40k-item-sheet .wh40k-panel__header / .wh40k-panel__content in the monolith.
    'wh40k-panel__header',
    'wh40k-panel__content',
    // ApplicationV2 root modifier classes applied via the classes array — redundant in template
    // bodies but harmless; treated as dead tokens during migration.
    'ship-component',
    'ship-upgrade',
    'ship-weapon',
    // Dead layout class — no CSS rules, no JS queries.
    'form-row',
    // Talent-sheet semantic design-system classes not matched by the TALENT_SHEET_RE prefix.
    // These are used in the talent sheet but have a generic wh40k- prefix.
    'wh40k-action-btn',
    'wh40k-action-btn--edit',
    'wh40k-action-btn--roll',
    'wh40k-action-btn--chat',
    'wh40k-header-btn',
    'wh40k-header-btn--hover',
    'wh40k-header-btn--done',
    'wh40k-badge--cost',
    'wh40k-badge--stackable',
    'wh40k-badge--rollable',
    'wh40k-benefit-text',
    'wh40k-notes-content',
    'wh40k-hint-text',
    'wh40k-hint',
    'wh40k-empty-state',
    'wh40k-empty-state--compact',
    'wh40k-empty-state--clickable',
    'wh40k-editor-container',
    'wh40k-btn-add-data',
    'wh40k-aptitude-tag',
    'wh40k-effects-banner',
    'wh40k-effects-banner__header',
    'wh40k-effects-banner__pills',
    'wh40k-effects-banner__link',
    'wh40k-effect-pill',
    'wh40k-effect-pill--modifiers',
    'wh40k-effect-pill--situational',
    'wh40k-effect-pill--grants',
    'wh40k-effect-pill__label',
    'wh40k-effect-pill__count',
    'wh40k-properties-grid',
    'wh40k-property',
    'wh40k-property--radio',
    'wh40k-property--checkbox',
    'wh40k-property-label',
    'wh40k-property-value',
    'wh40k-property-select',
    'wh40k-property-input',
    'wh40k-property-input--rank',
    'wh40k-property-input--inline',
    'wh40k-property-input--mono',
    'wh40k-property-display',
    'wh40k-property-textarea',
    'wh40k-radio-group',
    'wh40k-radio-label',
    'wh40k-radio-indicator',
    'wh40k-checkbox-label',
    'wh40k-checkbox-inline',
    'wh40k-specialization-edit',
    'wh40k-specialization-field',
    'wh40k-specialization-badge',
    'wh40k-rank-controls',
    'wh40k-rank-btn',
    'wh40k-modifiers-grid',
    'wh40k-modifier-group',
    'wh40k-modifier-group-header',
    'wh40k-modifier-list',
    'wh40k-modifier-item',
    'wh40k-modifier-name',
    'wh40k-modifier-value',
    'wh40k-situational-list',
    'wh40k-situational-item',
    'wh40k-situational-header',
    'wh40k-situational-stat',
    'wh40k-situational-value',
    'wh40k-situational-condition',
    'wh40k-grants-grid',
    'wh40k-grants-category',
    'wh40k-grants-category-header',
    'wh40k-grants-items',
    'wh40k-grant-tag',
    'wh40k-grant-tag--skill',
    'wh40k-grant-tag--talent',
    'wh40k-grant-tag--trait',
    'wh40k-grant-tag--clickable',
    'wh40k-grant-name',
    'wh40k-grant-spec',
    'wh40k-grant-link',
    'wh40k-grant-level',
    'wh40k-prerequisites-display',
    'wh40k-prereq-text',
    'wh40k-prereq-group',
    'wh40k-prereq-group-label',
    'wh40k-prereq-tag',
    'wh40k-roll-config-display',
    'wh40k-config-item',
    'wh40k-config-desc',
    'wh40k-config-mod',
    'wh40k-abilities-list',
    'wh40k-ability-card',
    'wh40k-ability-name',
    'wh40k-ability-description',
    // Talent-sheet footer classes (source reference panel).
    'wh40k-footer-edit',
    'wh40k-footer-display',
    'wh40k-footer-field',
    'wh40k-footer-field--page',
    'wh40k-footer-label',
    'wh40k-footer-input',
    'wh40k-footer-source',
    'wh40k-footer-source--empty',
    // Talent-sheet quickstats bar (prerequisite and aptitude summary chips).
    'wh40k-quickstat',
    'wh40k-quickstat--prereqs',
    'wh40k-quickstat--aptitudes',
    'wh40k-quickstat--spec',
    'wh40k-quickstat-label',
    'wh40k-quickstat-value',
    'wh40k-quickstat-tags',
    // Condition-sheet tab modifier classes not matched by the CONDITION_SHEET_RE prefix.
    'wh40k-tab-content--condition',
    'wh40k-tabs--condition',
    // Tailwind addComponents-generated classes (defined via addComponents() in tailwind.config.js,
    // not prefixed with tw-). The label/input/select/hint layout is handled entirely by Tailwind.
    'form-group',
    'hint',
    // threat-scaler-dialog.ts queries these by class name to wire up the preview tab switcher.
    'wh40k-preview-tab',
    'wh40k-preview-section',
    // origin-path-builder.ts queries '.equip-search', '.equip-type-filter', '.equip-row',
    // '.equip-check' by class name to handle the equipment selection UI — permanent JS selectors.
    'equip-search',
    'equip-type-filter',
    'equip-row',
    'equip-check',
    // characteristic-setup-dialog.ts and origin-path-builder.ts query/toggle all csd-* classes
    // by name for drag-and-drop assignment, base-value editing, and divination input —
    // permanent JS selectors, not project CSS classes.
    'csd-embedded',
    'csd-workspace',
    'csd-section',
    'csd-section-header',
    'csd-section-header-row',
    'csd-rolls-bank',
    'csd-rolls-container',
    'csd-rolls-container--bank',
    'csd-roll-chip',
    'csd-roll-value',
    'csd-roll-label',
    'csd-roll-input',
    'csd-bank-hint',
    'csd-bank-roll-btn',
    'csd-icon-btn',
    'csd-main-column',
    'csd-characteristics',
    'csd-char-grid',
    'csd-char-row',
    'csd-char-slot',
    'csd-char-header',
    'csd-char-short',
    'csd-char-name',
    'csd-char-body',
    'csd-char-base',
    'csd-base-input',
    'csd-base-value',
    'csd-base-label',
    'csd-char-plus',
    'csd-char-roll-slot',
    'csd-assigned-roll',
    'csd-drop-zone',
    'csd-char-origin',
    'csd-char-origin-value',
    'csd-char-origin-label',
    'csd-char-equals',
    'csd-char-total',
    'csd-divination',
    'csd-divination-input',
    'csd-header-actions',
    // compendium-browser.ts queries these by class name to wire up filter change handlers
    // and item click handlers — permanent JS selectors, not project CSS classes.
    'search-input',
    'filter-source',
    'filter-category',
    'filter-group-by',
    'filter-armour-type',
    'filter-min-ap',
    'filter-coverage',
    'filter-mod-type',
    'filter-has-modifiers',
    'filter-has-properties',
    'compendium-item',
    // origin-path-builder.hbs structural/semantic classes — visual styling is provided by inline
    // tw-* utilities; these names are retained as DOM identifiers for the CSS monolith staging area.
    'origin-builder',
    'builder-toolbar',
    'toolbar-group',
    'toolbar-center',
    'toolbar-title',
    'toolbar-controls',
    'toolbar-btn',
    'toolbar-btn--confirm',
    'mode-toggle',
    'mode-option',
    'direction-toggle',
    'direction-option',
    'step-navigation',
    'step-nav-item',
    'step-number',
    'step-label',
    'step-connector',
    'step-icon-img',
    'builder-main',
    'builder-main--full',
    'step-content',
    'step-header',
    'step-icon',
    'step-info',
    'optional-badge',
    'origin-cards-grid',
    'origin-card',
    'card-img',
    'card-name',
    'card-badges',
    'card-badge',
    'card-preview-btn',
    'selection-indicator',
    'selection-panel',
    'selection-header',
    'selection-img',
    'selection-info',
    'selection-description',
    'selection-requirements',
    'selection-actions',
    'selection-section',
    'section-title',
    'grants-list',
    'grants-category',
    'category-label',
    'category-items',
    'grant-item',
    'grant-tag',
    'skill-tag',
    'talent-tag',
    'trait-tag',
    'equipment-tag',
    'aptitude-tag',
    'tag-label',
    'tag-level',
    'tag-link',
    'choices-section',
    'choice-item',
    'choice-type-badge',
    'choice-label',
    'choice-count',
    'choice-selection',
    'choice-btn',
    'choice-complete-icon',
    'choice-incomplete-icon',
    'roll-item',
    'roll-info',
    'roll-label',
    'roll-formula',
    'roll-result',
    'roll-breakdown',
    'roll-actions',
    'roll-btn',
    'manual-btn',
    'rolls-section',
    'selection-confirm',
    'confirm-selection-btn',
    'selection-empty',
    'preview-panel',
    'preview-header',
    'preview-grid',
    'preview-category',
    'preview-item',
    'category-title',
    'builder-footer',
    'footer-status',
    'status-item',
    'footer-actions',
    'commit-btn',
    'no-origins',
    'wh40k-origin-card__valid-border',
    // State/modifier classes on origin-card and related elements — toggled by HBS conditionals
    // and used by CSS rules inside the origin-path-builder block; retained as DOM state markers.
    'selected',
    'disabled',
    'complete',
    'pending',
    'valid-next',
    'has-roll',
    'has-value',
    'has-origin',
    'assigned',
    'empty',
    'from-choice',
    'clickable',
    'advanced',
    'choices',
    'xp',
    'characteristic',
    'warning',
    // origin-path-choice-dialog.hbs structural/semantic classes — visual styling provided by
    // inline tw-* utilities; retained as DOM identifiers for the CSS monolith staging area.
    'origin-choice-dialog-content',
    'choice-header',
    'item-img',
    'item-info',
    'item-name',
    'choice-instruction',
    'choices-list',
    'choice-group',
    'choice-group-header',
    'choice-text',
    'choice-remaining',
    'choice-complete',
    'choice-options-cards',
    'choice-card',
    'choice-card-header',
    'option-checkbox',
    'option-label',
    'chosen-spec',
    'choice-checkmark',
    'option-stat-block',
    'option-description',
    'specialization-select',
    'spec-label',
    'pending-spec',
    'view-item-btn',
    'cancel-button',
    'confirm-button',
    'choice-footer',
    // origin-roll-dialog.hbs structural/semantic classes — visual styling provided by inline
    // tw-* utilities; retained as DOM identifiers for the CSS monolith staging area.
    'origin-roll-dialog-content',
    'roll-header',
    'origin-info',
    'origin-icon',
    'origin-details',
    'character-name',
    'roll-type-badge',
    'roll-description',
    'formula-display',
    'formula-text',
    'formula-expanded',
    'tb-note',
    'roll-result-container',
    'result-value',
    'result-number',
    'result-label',
    'result-breakdown',
    'roll-placeholder',
    'roll-history',
    'history-list',
    'history-item',
    'history-result',
    'history-breakdown',
    'dialog-actions',
    'left-actions',
    'right-actions',
    'primary-button',
    'roll-button',
    'secondary-button',
    'accept-button',
    // compendium-browser.hbs structural/semantic classes — visual styling provided by inline
    // tw-* utilities; retained as DOM identifiers for the CSS monolith staging area.
    'wh40k-compendium-browser',
    'browser-header',
    'browser-body',
    'browser-sidebar',
    'filter-section',
    'filter-group',
    'filter-divider',
    'filter-subheader',
    'browser-results',
    'results-header',
    'results-list',
    'results-group',
    'results-group-header',
    'results-group-title',
    'results-group-count',
    'item-image',
    'item-details',
    'item-stats',
    'item-stats--armour',
    'item-stats--armour-mod',
    'item-stats--quality',
    'item-meta',
    'item-type',
    'item-source',
    'item-pack',
    'stat-badge',
    'stat-badge--type',
    'stat-badge--ap',
    'stat-badge--coverage',
    'stat-badge--agility',
    'stat-badge--restrictions',
    'stat-badge--modifier',
    'stat-badge--negative',
    'stat-badge--properties',
    'stat-badge--level',
    'quality-description',
    'clear-filters',
    'no-results',
    // arrow-up / arrow-down — class tokens from a split FA expression `fa-{{#if positive}}arrow-up{{else}}arrow-down{{/if}}`
    // in compendium-browser.hbs. The HBS cleanup leaves these as bare tokens; the full class names
    // are `fa-arrow-up` / `fa-arrow-down` (Font Awesome) — exempt as icon library classes.
    'arrow-up',
    'arrow-down',
    // origin-roll-dialog.hbs: 'current' is a state modifier on history-item; the CSS rule
    // `.history-item.current` is superseded by inline tw-* utilities on the same element.
    'current',
    // combat-quick-panel.hbs state/semantic classes — CSS rules live inside the
    // .wh40k-wrapper .combat-hud.floating-panel block which is not an ancestor in the
    // current template; tw-* utilities on the same elements provide the visual effect.
    'vital-row',
    'wounds-row',
    'fatigue-row',
    'ammo-row',
    'attack-btn',
    'standard-attack',
    'semi-auto-attack',
    'full-auto-attack',
    'action-btn',
    'critical',
    'low',
    'exhausted',
    // stat-block-parser.hbs parse button — 'secondary' gives background via a rule nested in
    // .encounter-footer which is not an ancestor here; tw-* utilities provide the visual styling.
    'secondary',
    // active-effects-panel.hbs — semantic panel modifier; CSS rules provide effects-specific styling.
    'wh40k-effects-panel',
    // Shared clickable panel header modifier — CSS rules provide cursor/hover/transition.
    'wh40k-panel-header--clickable',
    // Shared effects list container — CSS rules provide flex layout for effect rows.
    'wh40k-effects-list',
    // Dropzone component classes — CSS rules provide layout, hover states, and icon styling.
    'wh40k-dropzone',
    'wh40k-dropzone-icon',
    'wh40k-dropzone-text',
    // combat-actions-panel.hbs — all combat action component classes have CSS rules in the monolith.
    // Retained as semantic design-system classes during the Tailwind migration.
    'wh40k-combat-actions-group',
    'wh40k-combat-actions-group-header',
    'wh40k-group-icon',
    'wh40k-combat-actions-group-label',
    'wh40k-combat-actions-grid',
    'wh40k-combat-action-btn',
    'wh40k-combat-action-attack',
    'wh40k-combat-action-name',
    'wh40k-combat-action-type',
    'wh40k-combat-action-movement',
    'wh40k-combat-action-reaction',
    'wh40k-combat-action-utility',
    'wh40k-combat-actions-info',
    // psychic-powers-panel.hbs — discipline filter component classes with CSS rules.
    // wh40k-filter-btn is also queried by character-sheet.ts via `.wh40k-panel-psychic-powers .wh40k-filter-btn`.
    'wh40k-power-filters',
    'wh40k-filter-btn',
    // backpack-split-panel.hbs — wh40k-panel-backpack-split, wh40k-transfer-check, wh40k-backpack-inventory,
    // and wh40k-ship-storage are permanent JS selectors (character-sheet.ts, base-actor-sheet.ts,
    // drag-drop-visual-mixin.ts). All other backpack/split/encumbrance/inventory classes have CSS rules.
    'wh40k-panel-backpack-split',
    'wh40k-encumbrance-display',
    'wh40k-enc-label',
    'wh40k-encumbrance-bar-container',
    'wh40k-encumbrance-bar-fill',
    'wh40k-enc-caution',
    'wh40k-enc-warning',
    'wh40k-enc-danger',
    'wh40k-enc-value',
    'wh40k-enc-alert',
    'wh40k-split-container',
    'wh40k-split-column',
    'wh40k-backpack-inventory',
    'wh40k-column-header',
    'wh40k-item-badge',
    'wh40k-column-body',
    'wh40k-inventory-table',
    'wh40k-item-table',
    'wh40k-backpack-item-row',
    'wh40k-col-check',
    'wh40k-transfer-check',
    'wh40k-col-icon',
    'wh40k-col-name',
    'wh40k-col-type',
    'wh40k-col-weight',
    'wh40k-col-actions',
    'wh40k-item-icon',
    'wh40k-item-name',
    'wh40k-item-type',
    'wh40k-item-weight',
    'wh40k-weight-none',
    'wh40k-inv-btn',
    'wh40k-inv-danger',
    'wh40k-split-divider',
    'wh40k-divider-line',
    'wh40k-divider-icon',
    'wh40k-divider-give',
    'wh40k-row-ship',
    'wh40k-ship-storage',
    'wh40k-empty-state',
    'wh40k-empty-icon',
    'wh40k-empty-hint',
]);
const SECTION_ID_RE = /^[a-z][a-z0-9_]*_(details|section|panel|body|header)$/;
// Tokens that are artifacts of stripping a `{{someVar}}` expression from the middle of a
// class attr. Three forms:
//   Leading-strip (single):  `{{cssPrefix}}-bar-container` → `-bar-container`  (starts with `-[a-z]`)
//   Leading-strip (double):  `{{pipClass}}--filled`        → `--filled`        (starts with `--[a-z]`)
//   Trailing-strip:          `wh40k-{{key}}-badge`         → `wh40k-`          (ends with hyphen)
// None of these forms are valid CSS class names (CSS identifiers cannot start or end with a
// bare hyphen in this way), so they are safely exempt from the non-tw check.
const HBS_FRAGMENT_RE = /^-{1,2}[a-z][a-z0-9-]*$|^[a-z][a-z0-9-]+-$/;
// Tokens that contain characters that are invalid in a CSS class name are always
// HBS expression fragments — e.g. `(eq`, `tab.active}}active{{/if}}`.
// Valid CSS identifiers only contain [a-zA-Z0-9_-] and cannot start with a digit.
const HBS_EXPR_RE = /[^a-zA-Z0-9_-]|^\d/;

/** Return true when a bare utility string is a Tailwind utility (any polarity). */
function isTwBare(s) {
    return s.startsWith('tw-') || s.startsWith('-tw-') || s.startsWith('!tw-');
}

/**
 * Find the last colon that is at bracket-depth 0 in `token`.
 * This is the variant-separator colon for all Tailwind variant forms:
 *   - `hover:tw-bg-gold`           (plain word variant)
 *   - `[&>label]:tw-block`         (arbitrary selector variant)
 *   - `data-[active=true]:tw-ring` (data-attribute variant)
 * Returns the index, or -1 if none found at depth 0.
 */
function lastTopLevelColon(token) {
    let depth = 0;
    let lastColon = -1;
    for (let i = 0; i < token.length; i++) {
        const ch = token[i];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === ':' && depth === 0) lastColon = i;
    }
    return lastColon;
}

function isTwOrExempt(token) {
    // Fast path: raw token is already a Tailwind utility (also handles
    // `tw-text-[color:var(--foo)]` where the colon is inside brackets).
    if (isTwBare(token)) return true;

    // Strip one Tailwind variant prefix by finding the last colon at bracket-depth 0.
    // This handles all variant forms: `hover:`, `[&>label]:`, `data-[active=true]:`, etc.
    const sep = lastTopLevelColon(token);
    if (sep !== -1) {
        const bare = token.slice(sep + 1);
        if (isTwBare(bare)) return true;
    }

    if (FA_RE.test(token)) return true;
    if (JS_HOOKS.has(token)) return true;
    if (ROLL_CONTROL_RE.test(token)) return true;
    if (TALENT_SHEET_RE.test(token)) return true;
    if (SECTION_CLASS_RE.test(token)) return true;
    if (CONDITION_SHEET_RE.test(token)) return true;
    if (ITEM_SHEET_BEM_RE.test(token)) return true;
    if (SECTION_ID_RE.test(token)) return true;
    if (HBS_FRAGMENT_RE.test(token)) return true;
    if (HBS_EXPR_RE.test(token)) return true;
    return false;
}

function classifyFile(file) {
    const src = readFileSync(file, 'utf8');
    let hasTw = false;
    let hasNonTw = false;
    let hasAnyClass = false;

    let m;
    while ((m = CLASS_ATTR_RE.exec(src)) !== null) {
        const value = m[1] ?? m[2] ?? '';
        // Strip Handlebars expressions inside class attribute; they are dynamic
        // and we do not classify them.
        // Two-pass cleanup:
        //   1. Remove complete {{...}} expressions.
        //   2. Remove any remaining {{... fragments — these are HBS blocks whose closing }}
        //      fell after the quote that ended the class attribute capture (e.g.
        //      `class="tw-foo {{#if (eq tone "gold")}}` gets captured as
        //      `tw-foo {{#if (eq tone ` — the `{{` is never closed in the captured value).
        const cleaned = value.replace(/\{\{[^}]*\}\}/g, ' ').replace(/\{\{.*/g, ' ');
        const tokens = cleaned.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) continue;
        hasAnyClass = true;
        for (const t of tokens) {
            if (isTwOrExempt(t)) hasTw = true;
            else hasNonTw = true;
        }
    }

    if (!hasAnyClass) return 'tailwind-only';
    if (hasTw && !hasNonTw) return 'tailwind-only';
    if (hasTw && hasNonTw) return 'mixed';
    return 'css-only';
}

const byFile = {};
const byDir = {};
const totals = { 'tailwind-only': 0, mixed: 0, 'css-only': 0 };
let total = 0;

for (const file of walk(ROOT)) {
    const cls = classifyFile(file);
    const rel = relative(process.cwd(), file);
    byFile[rel] = cls;
    totals[cls]++;
    total++;

    const dirRel = relative(ROOT, file).split(sep).slice(0, -1).join('/') || '.';
    byDir[dirRel] ??= { 'tailwind-only': 0, mixed: 0, 'css-only': 0, total: 0 };
    byDir[dirRel][cls]++;
    byDir[dirRel].total++;
}

const summary = { total, ...totals };
const payload = { generatedAt: new Date().toISOString(), summary, byDir, byFile };
const serialized = JSON.stringify(payload, null, 2) + '\n';

if (!jsonOnly) writeFileSync(OUT, serialized, 'utf8');

if (jsonOnly) {
    process.stdout.write(serialized);
    process.exit(0);
}

if (quiet) {
    process.exit(0);
}

const dirs = Object.keys(byDir).sort();
const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

console.log(`\n[css-coverage] ${total} templates total under src/templates/`);
console.log(`  tailwind-only: ${totals['tailwind-only']} (${pct(totals['tailwind-only'], total)})`);
console.log(`  mixed:         ${totals.mixed} (${pct(totals.mixed, total)})`);
console.log(`  css-only:      ${totals['css-only']} (${pct(totals['css-only'], total)})`);
console.log('');
console.log('| directory | tailwind-only | mixed | css-only | total |');
console.log('| --- | ---: | ---: | ---: | ---: |');
for (const d of dirs) {
    const r = byDir[d];
    console.log(`| ${d} | ${r['tailwind-only']} | ${r.mixed} | ${r['css-only']} | ${r.total} |`);
}
console.log('');
console.log(`Report written to ${OUT}.`);
