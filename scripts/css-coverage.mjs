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
// advancement-dialog.hbs BEM component — wh40k-adv__content is queried by advancement-dialog.ts
// (scrollable container). All other wh40k-adv* BEM elements have CSS rules in the monolith;
// inline tw-* utilities supersede them during the migration.
const ADVANCEMENT_RE = /^wh40k-adv/;
// chat-card-shell.hbs BEM component — wh40k-card__* (canonical) and wh40k-card-* (legacy back-
// compat names emitted via legacyClasses flag). No JS queries; CSS rules in monolith.
const CHAT_CARD_RE = /^wh40k-chat-card|^wh40k-card(?:__|-[a-z])/;
// effect-row.hbs BEM component — wh40k-effect-* classes have CSS rules in the monolith under
// .wh40k-effect-card and related selectors. No JS queries.
const EFFECT_ROW_RE = /^wh40k-effect-|^wh40k-change-/;
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
    // enhanced-skill-roll.hbs — all component classes have CSS rules in the monolith under
    // .enhanced-skill-roll. Inline tw-* utilities on the same elements supersede the CSS rules;
    // retained as DOM identifiers during the Tailwind migration.
    'enhanced-skill-roll',
    'roll-header',
    'skill-name',
    'base-target',
    'difficulty-section',
    'section-title',
    'difficulty-grid',
    'difficulty-btn',
    'diff-label',
    'diff-mod',
    'modifiers-section',
    'common-modifiers',
    'modifier-checkbox',
    'modifier-label',
    'modifier-value',
    'modifier-description',
    'custom-section',
    'custom-modifier',
    'custom-hint',
    'calculation-section',
    'calculation-breakdown',
    'calc-line',
    'calc-label',
    'calc-value',
    'final-target',
    'final-label',
    'final-value',
    // State modifier on .final-value — CSS rules add text-shadow; tw-* provides color.
    'increased',
    'decreased',
    'recent-section',
    'recent-rolls',
    'recent-btn',
    'recent-name',
    'recent-mod',
    'roll-footer',
    'roll-btn',
    'cancel-btn',
    'keyboard-hint',
    // Generic semantic child classes inside enhanced-skill-roll's .base-target and
    // .action-comparison/.party-actions/.enemy-actions — CSS rules are nested under those
    // parents, tw-* utilities on the same elements provide equivalent styling.
    'label',
    'value',
    // State class on .calc-line — CSS rule is `.calc-line.modifier { color: … }`.
    'modifier',
    // psychic-power-roll-prompt.hbs — wh40k-prompt* BEM component classes have CSS rules in
    // the monolith. .wh40k-prompt is also referenced by an :has() selector that sizes the
    // dialog window. Retained as semantic design-system classes during the Tailwind migration.
    'wh40k-prompt',
    'wh40k-prompt--psychic',
    'wh40k-prompt__panel',
    'wh40k-prompt__header',
    'wh40k-prompt__icon',
    'wh40k-prompt__title-group',
    'wh40k-prompt__title',
    'wh40k-prompt__subtitle',
    'wh40k-prompt__target',
    'wh40k-prompt__target-label',
    'wh40k-prompt__target-value',
    'wh40k-prompt__target-percent',
    'wh40k-prompt__section-title',
    'wh40k-prompt__field',
    'wh40k-prompt__label',
    'wh40k-prompt__value',
    'wh40k-prompt__input',
    'wh40k-prompt__select',
    'wh40k-prompt__checkbox-field',
    'wh40k-prompt__divider',
    'wh40k-prompt__range-info',
    'wh40k-prompt__range-label',
    'wh40k-prompt__range-value',
    'wh40k-prompt__weapon-list',
    'wh40k-prompt__weapon-item',
    'wh40k-prompt__weapon-item--selected',
    'wh40k-prompt__weapon-check',
    'wh40k-prompt__weapon-img',
    'wh40k-prompt__weapon-info',
    'wh40k-prompt__weapon-name',
    'wh40k-prompt__weapon-details',
    // weapon-panel.hbs — Tailwind arbitrary-selector targets: ancestors use
    // `[&_.urd-card__icon]:tw-text-gold-raw` / `[&_.urd-weapon-name]:tw-text-gold-raw`
    // to style child elements. These class names exist only so those selectors can match;
    // there are no CSS rules or JS queries for them.
    'urd-card__icon',
    'urd-weapon-name',
    // target-display.hbs — urd-difficulty-picker and urd-target__number are queried by
    // unified-roll-dialog.ts via querySelector. urd-difficulty-picker__item-label is an
    // arbitrary-selector target (`[&_.urd-difficulty-picker__item-label]:tw-text-gold-raw`).
    'urd-difficulty-picker',
    'urd-difficulty-picker__item-label',
    'urd-target__number',
    // encounter-builder.hbs — all component classes have CSS rules in the monolith under
    // .encounter-builder-content. encounter-drop-zone is also queried by encounter-builder.ts
    // via querySelector for drag-over state toggling. Inline tw-* utilities supersede the CSS;
    // retained as DOM identifiers during the Tailwind migration.
    'encounter-builder-content',
    'encounter-header',
    'party-config',
    'party-fields',
    'encounter-main',
    'npc-list-section',
    'section-header',
    'encounter-drop-zone',
    'npc-table',
    'encounter-metrics',
    'metric-card',
    'difficulty',
    'difficulty-badge',
    'ratio',
    'threat-summary',
    'action-economy',
    'action-comparison',
    'party-actions',
    'enemy-actions',
    'vs',
    'advantage',
    'templates',
    'template-list',
    'empty-message',
    'encounter-footer',
    // icon-button — CSS rules provide compact button padding; modifier 'danger' on same element.
    'icon-button',
    'danger',
    // 'primary' on encounter-footer deploy button — CSS rule `.encounter-footer .primary` provides
    // accent background; tw-* utilities on the same element supersede with inline styling.
    'primary',
    // Table column semantic class names (img, name, threat, count, total, actions) — used as
    // both `<th>` column headers and `<td>` cell class names for CSS column-width rules.
    'img',
    'name',
    'threat',
    'count',
    'total',
    'actions',
    // header-base.hbs outer wrapper — wh40k-header has CSS rules in the monolith (journal-entry
    // context and nested sheet contexts) but no JS queries. Inline tw-* on the wrapper
    // supersedes the CSS during the migration.
    'wh40k-header',
    // chat-card-shell.hbs legacy flat class names (emitted alongside wh40k-card__* BEM names
    // via the legacyClasses flag for back-compat with already-rendered chat messages). No JS
    // queries. CHAT_CARD_RE handles the BEM sub-elements.
    'wh40k-source-ref',
    // active-modifiers-panel.hbs — wh40k-modifier-* BEM classes have CSS rules; no JS queries.
    'wh40k-modifier-item',
    'wh40k-modifier-item--condition',
    'wh40k-modifier-item--effect',
    'wh40k-modifier-item--equipment',
    'wh40k-modifier-item--inactive',
    'wh40k-modifier-item--talent',
    'wh40k-modifier-item--trait',
    'wh40k-panel--modifiers',
    'wh40k-panel-toggle',
    // advancement-dialog.hbs root class and panel collapse state
    'wh40k-panel--collapsed',
    // notes — plain semantic class in advancement-dialog (no CSS rules, no JS queries)
    'notes',
    // player/body.hbs — wh40k-body is the scrollable tab-body PARTS container. base-actor-sheet.ts
    // references '.wh40k-body' in its scrollable config and querySelectorAll calls. CSS rules in the
    // monolith provide sizing and overflow for the section container.
    'wh40k-body',
    // player/tab-biography.hbs — design-system structural classes for the biography tab.
    // CSS rules in the monolith provide layout for the biography columns, identity grid,
    // connections list, journal sections, and form fields.
    'wh40k-bio-col',
    'wh40k-identity-grid',
    'wh40k-connections-section',
    'wh40k-affliction-header',
    'wh40k-add-btn',
    'wh40k-affliction-list',
    'wh40k-affliction-row',
    'wh40k-affliction-name',
    'wh40k-connection-bonus',
    'wh40k-affliction-del',
    'wh40k-connection-penalty',
    'wh40k-panel-journal',
    'wh40k-journal-body',
    'wh40k-journal-section',
    'wh40k-field-label',
    'wh40k-textarea',
    'wh40k-journal-notes',
    'wh40k-prose-editor',
    'wh40k-prose-content',
    // player/tab-dynasty.hbs — Rogue Trader dynasty/profit-factor panel component classes.
    // CSS rules in the monolith provide layout for the profit factor gauge, breakdown, and
    // acquisition reference. wh40k-xp-display, wh40k-xp-item, wh40k-xp-available,
    // wh40k-xp-label, wh40k-xp-value also used by this tab's experience panel.
    'wh40k-dynasty-col',
    'wh40k-panel-profit-v2',
    'wh40k-acquisition-btn',
    'wh40k-pf-hero',
    'wh40k-pf-value-display',
    'wh40k-pf-value-input',
    'wh40k-pf-tier',
    'wh40k-pf-tier-label',
    'wh40k-pf-gauge',
    'wh40k-pf-gauge-track',
    'wh40k-pf-gauge-fill',
    'wh40k-pf-gauge-marker',
    'wh40k-pf-gauge-labels',
    'wh40k-pf-tier--poor',
    'wh40k-pf-tier--modest',
    'wh40k-pf-tier--notable',
    'wh40k-pf-tier--mighty',
    'wh40k-pf-tier--legendary',
    'wh40k-pf-breakdown',
    'wh40k-pf-breakdown-row',
    'wh40k-pf-breakdown-label',
    'wh40k-pf-breakdown-input',
    'wh40k-pf-breakdown-row--total',
    'wh40k-pf-breakdown-value',
    'wh40k-pf-misfortunes',
    'wh40k-pf-acquisition-ref',
    'wh40k-pf-ref-header',
    'wh40k-pf-ref-grid',
    'wh40k-pf-ref-item',
    'wh40k-pf-ref--positive',
    'wh40k-pf-ref--negative',
    'wh40k-xp-display',
    'wh40k-xp-item',
    'wh40k-xp-label',
    'wh40k-vital-input',
    'wh40k-xp-available',
    'wh40k-xp-value',
    'wh40k-endeavour-fields',
    'wh40k-field-input',
    'wh40k-field-row-split',
    'wh40k-field-half',
    'wh40k-ap-tracker',
    // player/tab-overview.hbs — dashboard zone component classes. CSS rules in the monolith
    // provide layout for the overview dashboard zones, vitals rows, skill/talent compact lists,
    // equipped-weapons display, movement/encumbrance/armour compact widgets, and XP progression.
    'wh40k-dashboard',
    'wh40k-dashboard-zone',
    'wh40k-zone-vitals',
    'wh40k-zone-header',
    'wh40k-zone-content',
    'wh40k-vital-penalty',
    'wh40k-vital-row',
    'wh40k-vital-icon',
    'wh40k-vital-label',
    'wh40k-vital-value',
    'wh40k-vital-btn-small',
    'wh40k-vital-btn',
    'wh40k-zone-subsection',
    'wh40k-effects-preview',
    'wh40k-effect-chip',
    'wh40k-effect-chip--disabled',
    'wh40k-effect-icon-mini',
    'wh40k-effect-name-mini',
    'wh40k-effect-chip-controls',
    'wh40k-effect-chip-btn',
    'wh40k-effect-chip-btn--danger',
    'wh40k-effects-empty',
    'wh40k-skill-list-compact',
    'wh40k-skill-row-compact',
    'wh40k-skill-name-compact',
    'wh40k-skill-value-compact',
    'wh40k-skill-roll-btn',
    'wh40k-no-favorites',
    'wh40k-zone-progression',
    'wh40k-xp-ring-header',
    'wh40k-xp-ring-header-svg',
    'wh40k-zone-header-actions',
    'wh40k-xp-action-btn',
    'wh40k-xp-row',
    'wh40k-aptitude-row',
    'wh40k-aptitude-pills',
    'wh40k-aptitude-pill',
    'wh40k-ew-list',
    'wh40k-ew-row',
    'wh40k-ew-icon',
    'wh40k-ew-info',
    'wh40k-ew-name',
    'wh40k-ew-meta',
    'wh40k-ew-class',
    'wh40k-ew-range',
    'wh40k-ew-damage',
    'wh40k-ew-empty',
    'wh40k-speed-item',
    'wh40k-speed-value',
    'wh40k-speed-label',
    'wh40k-speed-icon',
    'wh40k-speed-item--highlight',
    'wh40k-encumbrance-compact',
    'wh40k-enc-info',
    'wh40k-enc-current-compact',
    'wh40k-enc-separator',
    'wh40k-enc-max-compact',
    'wh40k-enc-bar-compact',
    'wh40k-enc-over',
    'wh40k-enc-fill-compact',
    'wh40k-ov-armour-silhouette',
    'wh40k-ov-armour-box',
    'wh40k-ov-box-head',
    'wh40k-ov-box-label',
    'wh40k-ov-box-ap',
    'wh40k-ov-box-right-arm',
    'wh40k-ov-box-body',
    'wh40k-ov-box-left-arm',
    'wh40k-ov-box-right-leg',
    'wh40k-ov-box-left-leg',
    // player/tab-powers.hbs — powers tab layout classes. CSS rules in the monolith provide
    // tab-specific scoping for the power panels. wh40k-powers-col-left/-right are dead
    // structural identifiers with no CSS rules.
    'wh40k-tab-powers',
    'wh40k-powers-col',
    'wh40k-powers-col-left',
    'wh40k-powers-col-right',
    // player/tab-skills.hbs — characteristics HUD component classes. base-actor-sheet.ts and
    // enhanced-animations-mixin.ts query '.wh40k-char-hud-item', '.wh40k-char-hud-circle',
    // '.wh40k-char-hud-mod', '.wh40k-char-direct-input' etc. by name. CSS rules in the monolith
    // provide the radial display, advance-progress styling, and responsive sizing.
    'wh40k-char-hud-item',
    'wh40k-char-buffed',
    'wh40k-char-debuffed',
    'wh40k-char-hud-name',
    'wh40k-char-hud-circle',
    'wh40k-char-hud-mod',
    'wh40k-char-hud-mod-label',
    'wh40k-char-hud-base',
    'wh40k-char-hud-base--edit',
    // base-actor-sheet.ts queries '.wh40k-char-direct-input' for bulk input collection —
    // permanent JS selector. wh40k-char-inline-input has CSS rules in the monolith.
    'wh40k-char-direct-input',
    'wh40k-char-inline-input',
    // player/tab-skills.hbs and player/tab-talents.hbs — layout column wrapper classes.
    // No CSS rules; dead structural identifiers retained as DOM markers during migration.
    'wh40k-talents-col',
    'wh40k-talents-col-left',
    'wh40k-talents-col-right',
    // armour-display-panel.hbs — armour silhouette + hit-location box classes. CSS rules provide
    // grid/position layout for each body-part zone. No JS queries.
    'wh40k-armour-silhouette',
    'wh40k-armour-box',
    'wh40k-armour-box-icons',
    'wh40k-armour-box-icon',
    'wh40k-box-head',
    'wh40k-box-right-arm',
    'wh40k-box-left-arm',
    'wh40k-box-body',
    'wh40k-box-right-leg',
    'wh40k-box-left-leg',
    'wh40k-box-label',
    'wh40k-box-ap',
    'wh40k-box-range',
    // combat-station-panel.hbs — combat tab layout, vital-stat component, critical/wounds/fatigue
    // UI, speed controls, force-field, and weapon grid classes. All have CSS rules; no JS queries.
    'wh40k-combat-tab',
    'wh40k-combat-layout',
    'wh40k-combat-top-grid',
    'wh40k-combat-col',
    'wh40k-combat-armour-wide',
    'wh40k-panel-vitals',
    'wh40k-panel-arsenal',
    'wh40k-panel-forcefield',
    'wh40k-panel-details',
    'wh40k-panel-details--collapsed',
    'wh40k-vitals-hud',
    'wh40k-vital-stat',
    'wh40k-vital-wounds',
    'wh40k-vital-fatigue',
    'wh40k-vital-fate',
    'wh40k-vital-injuries',
    'wh40k-vital-mobility',
    'wh40k-vital-critical',
    'wh40k-vital-warning',
    'wh40k-vital-stat-header',
    'wh40k-vital-header-clickable',
    'wh40k-vital-ctrl-btn',
    'wh40k-vital-stat-body',
    'wh40k-vital-readout',
    'wh40k-vital-bar-wrapper',
    'wh40k-vital-bar-track',
    'wh40k-vital-bar-progress',
    'wh40k-vital-alert',
    'wh40k-vital-critical-inline',
    'wh40k-vital-edit-section',
    'wh40k-vital-edit-field',
    'wh40k-vital-edit-label',
    'wh40k-vital-edit-input',
    'wh40k-combat-vital-value',
    'wh40k-combat-vital-max-label',
    'wh40k-wounds-progress',
    'wh40k-wounds-progress__shimmer',
    'wh40k-alert-fatigue',
    'wh40k-fatigue-bolts-combat',
    'wh40k-fatigue-pip',
    'wh40k-fatigue-pip--filled',
    'wh40k-crit-label',
    'wh40k-critical-pips-compact',
    'wh40k-crit-pip-mini',
    'wh40k-crit-pip-mini--filled',
    'wh40k-fate-stars',
    'wh40k-fate-pip',
    'wh40k-fate-pip--active',
    'wh40k-mobility-speeds-inline',
    'wh40k-speed-inline',
    'wh40k-speed-half',
    'wh40k-speed-full',
    'wh40k-speed-charge',
    'wh40k-speed-run',
    'wh40k-forcefield-bar',
    'wh40k-ff-active',
    'wh40k-ff-overloaded',
    'wh40k-ff-name',
    'wh40k-ff-rating',
    'wh40k-ff-status',
    'wh40k-ff-on',
    'wh40k-ff-off',
    'wh40k-ff-down',
    'wh40k-injuries-list',
    'wh40k-injury-row',
    'wh40k-injury-name',
    'wh40k-injury-delete',
    'wh40k-weapon-grid-header',
    'wh40k-weapon-grid-row',
    'wh40k-row-equipped',
    'wh40k-equipped-icon',
    'wh40k-combat-actions',
    // movement-panel-full.hbs — size select and mobility section classes. CSS rules; no JS queries.
    'wh40k-mobility-section',
    'wh40k-size-section',
    'wh40k-stat-grid-header',
    'wh40k-size-select',
    // ship-role-panel.hbs — collapsible panel component classes. CSS rules provide transition
    // and visibility; data-panel attribute drives behavior, not the class names themselves.
    'collapsible-header',
    'collapsible-body',
    'collapse-icon',
    // skills-panel.hbs and skill-row.hbs — skill list layout + row component classes.
    // wh40k-skills-columns IS queried by JS (base-actor-sheet.ts filterSkills) as a scrollable
    // container selector, so it must be preserved; listed here so the classifier exempts it.
    // wh40k-vital-controls is the dec/value/inc flex container used in vital rows across panels.
    'wh40k-skills-columns',
    'wh40k-vital-controls',
    // wh40k-item-img is a shared icon class used in item-table-row and ship-role-panel;
    // CSS rules size the thumbnail; no JS queries.
    'wh40k-item-img',
    // individual skill row / training indicator classes are CSS-only.
    'wh40k-skills-panel',
    'wh40k-skills-column',
    'wh40k-advanced-untrained-section',
    'wh40k-section-divider',
    'wh40k-skill-row',
    'wh40k-skill-row--advanced',
    'wh40k-skill-row--compact',
    'wh40k-skill-row--locked',
    'wh40k-skill-info',
    'wh40k-skill-icon',
    'wh40k-skill-name-wrapper',
    'wh40k-skill-name',
    'wh40k-skill-label',
    'wh40k-skill-char',
    'wh40k-skill-roll',
    'wh40k-skill-favorite',
    'wh40k-skill-total',
    'wh40k-spec-training',
    'wh40k-training-display',
    'wh40k-train-indicator',
    // skills-specialist-panel.hbs — specialist skill group and entry component classes.
    // CSS rules in the monolith; no direct JS queries by class name.
    'wh40k-specialist-panel',
    'wh40k-specialist-add-btn',
    'wh40k-specialist-group',
    'wh40k-specialist-group--advanced',
    'wh40k-specialist-header',
    'wh40k-specialist-name',
    'wh40k-specialist-char',
    'wh40k-specialist-entries',
    'wh40k-specialist-entry',
    'wh40k-spec-info',
    'wh40k-spec-name',
    'wh40k-spec-roll',
    'wh40k-spec-favorite',
    'wh40k-spec-delete',
    'wh40k-spec-total',
    'wh40k-specialist-empty',
    // vehicle-crew-panel.hbs / vehicle-integrity-panel.hbs / weapon-panel.hbs — wh40k-field__*
    // and wh40k-control-button BEM classes. CSS rules provide the shared field/button design;
    // no JS queries by class name.
    'wh40k-field__wrapper',
    'wh40k-field__header',
    'wh40k-field__input',
    'wh40k-field__textarea',
    'wh40k-field__span',
    'wh40k-control-button',
    'wh40k-control-button__span',
    'wh40k-settings',
    // dropzone.hbs — compact variant modifier; CSS rule makes the compact form shorter.
    'wh40k-dropzone--compact',
    // degree-meter-panel.hbs — empty-state modifier on the dropzone.
    'wh40k-dropzone-empty',
    // item-table.hbs / item-table-row.hbs — shared table chrome classes. CSS rules drive column
    // layout (grid-template-columns), borders, padding, and hover states. wh40k-table--border is
    // also referenced in CSS specificity chains. wh40k-item-button is the clickable name cell.
    // `display` is the static-text <span> inside name/cell slots.
    'wh40k-table--border',
    'wh40k-weapontable--border',
    'table-row--head',
    'table-row',
    'table-cell',
    'table-cell--last',
    'table-cell--left',
    'table-cell--settingstoggle',
    'table-cell--description',
    'wh40k-item-button',
    'display',
    // vital-inline-row.hbs — mental-degree state span class; CSS rules apply color per degree.
    'wh40k-mental-degree',
    // tab-npc.hbs — NPC tab layout, horde, barter, tracker, tags, faction, notes, gm-tools.
    // wh40k-gm-tools IS queried by npc-sheet.ts via querySelector but must be preserved.
    // All other npc-tab classes have CSS rules and no JS queries.
    'wh40k-npc-tab',
    'wh40k-panel--horde',
    'wh40k-panel--barter',
    'wh40k-panel--combat-tracker',
    'wh40k-panel--tags',
    'wh40k-panel--meta',
    'wh40k-panel--notes',
    'wh40k-panel--gm-tools',
    'wh40k-magnitude-compact',
    'wh40k-magnitude-header',
    'wh40k-magnitude-bar-container',
    'wh40k-magnitude-bar',
    'wh40k-magnitude-btns',
    'wh40k-mag-btn',
    'wh40k-horde-destroyed',
    'wh40k-horde-stats',
    'wh40k-empty-state-inline',
    'wh40k-count-badge',
    'wh40k-tracker-status',
    'wh40k-tracker-status--active',
    'wh40k-tracker-nav-actions',
    'wh40k-tool-btn',
    'wh40k-tool-btn--danger',
    'wh40k-combat-add-btn',
    'wh40k-tags-row',
    'wh40k-tag',
    'wh40k-tag-remove',
    'wh40k-tags-empty',
    'wh40k-tag-add',
    'wh40k-meta-fields',
    'wh40k-meta-field',
    'wh40k-gm-badge',
    'wh40k-notes-grid',
    'wh40k-note-field',
    'wh40k-note-field--editable',
    'wh40k-editor-mini',
    'wh40k-note-display',
    'wh40k-gm-tools',
    'wh40k-gm-tools--inline',
    // starship/header.hbs — ship header identity, info row, and quick-stats cluster classes.
    // CSS rules; no JS queries.
    'wh40k-header__info',
    'wh40k-header__identity',
    'wh40k-ship-info',
    'wh40k-header-row',
    'wh40k-header-label',
    'wh40k-header-input',
    'wh40k-ship-quick-stats',
    // starship/tab-stats.hbs — grid layout and initiative button classes.
    'wh40k-grid-col-3',
    'wh40k-grid-row-1',
    'wh40k-initiative-btn',
    'spacer',
    // vehicle/header.hbs — vehicle header identity, meta, and quick-stats cluster classes.
    'wh40k-vehicle-identity',
    'wh40k-vehicle-meta',
    'wh40k-vehicle-meta-row',
    'wh40k-vehicle-field',
    'wh40k-vehicle-field--wide',
    'wh40k-vehicle-select',
    'wh40k-vehicle-quick-stats',
    // ── item-armour-sheet.hbs ──────────────────────────────────────────────────
    // Structural/semantic classes — inline tw-* provides visual styling; DOM identifiers only.
    'wh40k-armour-sheet',
    'wh40k-armour-header',
    'wh40k-armour-header__image',
    'wh40k-armour-header__image-overlay',
    'wh40k-armour-header__info',
    'wh40k-armour-header__meta',
    'wh40k-armour-header__name',
    'wh40k-armour-header__actions',
    'wh40k-armour-badge',
    'wh40k-armour-badge--type',
    'wh40k-armour-badge--protection',
    'wh40k-armour-badge--craft',
    'wh40k-armour-badge--agility',
    'wh40k-armour-stats',
    'wh40k-armour-stat',
    'wh40k-armour-stat--weight',
    'wh40k-armour-stat--agility',
    'wh40k-armour-stat--location',
    'wh40k-armour-stat__icon',
    'wh40k-armour-stat__content',
    'wh40k-armour-stat__label',
    'wh40k-armour-stat__value',
    'wh40k-armour-tabs',
    'wh40k-armour-tab',
    'wh40k-armour-content',
    'wh40k-tab-content--armour',
    'wh40k-tabs--armour',
    'wh40k-armour-panel',
    'wh40k-armour-section',
    'wh40k-armour-section__header',
    'wh40k-armour-section__body',
    'wh40k-armour-section__body--editor',
    'wh40k-armour-section__count',
    'wh40k-armour-ap-grid',
    'wh40k-armour-ap-field',
    'wh40k-mod-list',
    'wh40k-mod-item',
    'wh40k-mod-item__info',
    'wh40k-mod-item__name',
    'wh40k-mod-item__actions',
    'wh40k-mod-slots',
    'wh40k-mod-slots__available',
    'wh40k-property-tags',
    'wh40k-property-tag',
    'wh40k-property-tag__label',
    'wh40k-property-tag__remove',
    'wh40k-property-descriptions',
    'wh40k-property-detail',
    'wh40k-property-detail__name',
    'wh40k-property-detail__desc',
    'wh40k-property-add',
    'wh40k-property-add__select',
    // base-item-sheet.ts queries '.wh40k-toggle-equipped' and '.wh40k-toggle-equipped__indicator i'
    'wh40k-toggle-equipped',
    'wh40k-toggle-equipped__indicator',
    'wh40k-toggle-equipped__label',
    // wh40k-btn variant modifiers used on armour, weapon, and other item sheets.
    'wh40k-btn--icon',
    'wh40k-btn--danger',
    // wh40k-input--readonly — applied via {{#unless inEditMode}}; CSS greys out the input.
    'wh40k-input--readonly',
    // wh40k-empty-state--mods — modifier variant for the mods panel empty state.
    'wh40k-empty-state--mods',
    // ── item-critical-injury-sheet.hbs ─────────────────────────────────────────
    'wh40k-critical-injury-sheet',
    'wh40k-injury-header',
    'wh40k-injury-header__image',
    'wh40k-injury-header__image-overlay',
    'wh40k-injury-header__info',
    'wh40k-injury-header__meta',
    'wh40k-injury-header__name',
    'wh40k-injury-badge',
    'wh40k-injury-badge--damage',
    'wh40k-injury-badge--location',
    'wh40k-injury-badge--severity',
    'wh40k-injury-badge--permanent',
    'wh40k-injury-severity',
    'wh40k-injury-severity__header',
    'wh40k-injury-severity__slider',
    'wh40k-injury-severity__input',
    'wh40k-injury-severity__labels',
    'wh40k-injury-severity__label',
    'wh40k-injury-severity__label--min',
    'wh40k-injury-severity__label--current',
    'wh40k-injury-severity__label--max',
    'wh40k-injury-severity__zones',
    'wh40k-injury-severity__zone',
    'wh40k-injury-severity__zone--minor',
    'wh40k-injury-severity__zone--moderate',
    'wh40k-injury-severity__zone--severe',
    'wh40k-injury-severity__zone--fatal',
    'wh40k-injury-severity-preview',
    'wh40k-injury-tabs',
    'wh40k-injury-tab',
    'wh40k-injury-content',
    'wh40k-tab-content--injury',
    'wh40k-tabs--injury',
    'wh40k-injury-panel',
    'wh40k-injury-section',
    'wh40k-injury-section__header',
    'wh40k-injury-section__body',
    'wh40k-injury-section__body--editor',
    'wh40k-severity-effect-editor',
    // ── item-cybernetic-sheet.hbs ───────────────────────────────────────────────
    'wh40k-cybernetic-sheet',
    'wh40k-cybernetic-header',
    'wh40k-cybernetic-header__image',
    'wh40k-cybernetic-header__image-overlay',
    'wh40k-cybernetic-header__info',
    'wh40k-cybernetic-header__meta',
    'wh40k-cybernetic-header__name',
    'wh40k-cybernetic-header__equipped',
    'wh40k-cybernetic-badge',
    'wh40k-cybernetic-badge--type',
    'wh40k-cybernetic-badge--location',
    'wh40k-cybernetic-badge--craft',
    'wh40k-cybernetic-badge--armour',
    'wh40k-cybernetic-stats',
    'wh40k-cybernetic-stat',
    'wh40k-cybernetic-stat__icon',
    'wh40k-cybernetic-stat__content',
    'wh40k-cybernetic-stat__label',
    'wh40k-cybernetic-stat__value',
    'wh40k-cybernetic-tabs',
    'wh40k-cybernetic-tab',
    'wh40k-cybernetic-content',
    'wh40k-tab-content--cybernetic',
    'wh40k-tabs--cybernetic',
    'wh40k-cybernetic-panel',
    'wh40k-cybernetic-section',
    'wh40k-cybernetic-section__header',
    'wh40k-cybernetic-section__body',
    'wh40k-cybernetic-locations',
    'wh40k-location-toggle',
    'wh40k-location-toggle__label',
    'wh40k-modifiers-display',
    'wh40k-modifier-group-title',
    'wh40k-property--full',
    'wh40k-property-label-inline',
    'wh40k-field-hint',
    // ── item-force-field-sheet.hbs ──────────────────────────────────────────────
    'wh40k-forcefield-sheet',
    'wh40k-forcefield-header',
    'wh40k-forcefield-header__image',
    'wh40k-forcefield-header__image-overlay',
    'wh40k-forcefield-header__info',
    'wh40k-forcefield-header__meta',
    'wh40k-forcefield-header__name',
    'wh40k-forcefield-header__equipped',
    'wh40k-forcefield-badge',
    'wh40k-forcefield-badge--status',
    'wh40k-forcefield-badge--active',
    'wh40k-forcefield-badge--inactive',
    'wh40k-forcefield-badge--overloaded',
    'wh40k-forcefield-badge--protection',
    'wh40k-forcefield-badge--craft',
    'wh40k-forcefield-stats',
    'wh40k-forcefield-stat',
    'wh40k-forcefield-stat--rating',
    'wh40k-forcefield-stat--weight',
    'wh40k-forcefield-stat--overload',
    'wh40k-forcefield-stat__icon',
    'wh40k-forcefield-stat__content',
    'wh40k-forcefield-stat__label',
    'wh40k-forcefield-stat__value',
    'wh40k-forcefield-tabs',
    'wh40k-forcefield-tab',
    'wh40k-forcefield-content',
    'wh40k-tab-content--force-field',
    'wh40k-tabs--force-field',
    'wh40k-forcefield-panel',
    'wh40k-forcefield-section',
    'wh40k-forcefield-section__header',
    'wh40k-forcefield-section__body',
    'wh40k-forcefield-section__body--editor',
    'wh40k-forcefield-toggles',
    // wh40k-checkbox BEM modifier/child classes — theming CSS in the monolith; no JS queries.
    'wh40k-checkbox__indicator',
    'wh40k-checkbox__label',
    'wh40k-checkbox--large',
    'wh40k-checkbox--danger',
    // ── item-origin-path-sheet.hbs ──────────────────────────────────────────────
    'wh40k-origin-sheet',
    'wh40k-origin-header',
    'wh40k-origin-header__image',
    'wh40k-origin-header__image-overlay',
    'wh40k-origin-header__info',
    'wh40k-origin-header__meta',
    'wh40k-origin-header__name',
    'wh40k-origin-header__config',
    'wh40k-origin-badge',
    'wh40k-origin-badge--step',
    'wh40k-origin-badge--index',
    'wh40k-origin-tabs',
    'wh40k-origin-tab',
    'wh40k-origin-content',
    'wh40k-origin-panel',
    'wh40k-origin-section',
    'wh40k-aptitudes-display',
    'wh40k-characteristics-grid',
    'wh40k-char-field',
    'wh40k-char-label',
    'wh40k-char-input',
    'wh40k-bonuses-grid',
    'wh40k-bonus-field',
    'wh40k-bonus-field--checkbox',
    'wh40k-bonus-label',
    'wh40k-bonus-label-inline',
    'wh40k-bonus-input',
    'wh40k-config-field',
    'wh40k-config-select',
    'wh40k-config-input',
    'wh40k-grants-list',
    'wh40k-grant-card',
    'wh40k-grant-card--skill',
    'wh40k-grant-card--talent',
    'wh40k-grant-card--trait',
    'wh40k-grant-card--equipment',
    'wh40k-grant-card__content',
    'wh40k-grant-icon',
    'wh40k-grant-badge',
    'wh40k-grant-name',
    'wh40k-grant-spec',
    'wh40k-grant-qty',
    'wh40k-choice-options',
    'wh40k-choice-option',
    'wh40k-choice-badge',
    'wh40k-choice-info',
    'wh40k-choice-count',
    'wh40k-requirement-display',
    'wh40k-requirement-list',
    'wh40k-requirement-tag',
    'wh40k-requirement-tag--required',
    'wh40k-requirement-tag--excluded',
    'wh40k-requirement-note',
    // ── item-psychic-power-sheet.hbs ────────────────────────────────────────────
    // Legacy flat-style psychic power sheet classes — CSS rules in the monolith; no JS queries.
    'wh40k-item-header',
    'wh40k-item-image',
    'wh40k-item-meta',
    'wh40k-item-title',
    'wh40k-item-title__name',
    'wh40k-item-title__type',
    'wh40k-meta-badge',
    'wh40k-meta-badge--psychic',
    'wh40k-meta-badge--source',
    'wh40k-description',
    'wh40k-field__label',
    'wh40k-field__input',
    'wh40k-field__select',
    'wh40k-quick-stats',
    'wh40k-stat-badge',
    'wh40k-stat-badge--psychic',
    'wh40k-stat-badge__icon',
    'wh40k-stat-badge__label',
    'wh40k-stat-badge__value',
    'wh40k-tags',
    'wh40k-tag',
    'wh40k-tag--psychic',
    'wh40k-panel__actions',
    // add-quality — JS data-action target for psychic power sheet quality add button.
    'add-quality',
    // ── item-skill-sheet.hbs ────────────────────────────────────────────────────
    // Legacy flat-style skill sheet classes — CSS rules in the monolith; no JS queries.
    'wh40k-skill-sheet',
    'wh40k-skill-badges',
    'wh40k-skill-type-badge',
    'wh40k-skill-type-badge--basic',
    'wh40k-skill-type-badge--advanced',
    'wh40k-skill-type-badge--specialist',
    'wh40k-skill-descriptor',
    'wh40k-descriptor-badge',
    'wh40k-descriptor-text',
    'wh40k-char-badge',
    'wh40k-meta-badge--skill',
    'wh40k-meta-select',
    'wh40k-skill-specializations',
    'wh40k-specializations-list',
    'wh40k-specialization-tag',
    'wh40k-specializations-input',
    'wh40k-aptitudes-list',
    'wh40k-skill-properties',
    'wh40k-config-grid',
    'wh40k-skill-roll-config',
    'wh40k-property-value',
    'wh40k-skill-uses',
    'wh40k-uses-content',
    'wh40k-skill-special-rules',
    'wh40k-special-rules-content',
    'wh40k-skill-difficulties',
    'wh40k-difficulties-table',
    'wh40k-difficulty-name',
    'wh40k-difficulty-modifier',
    'wh40k-difficulties-empty',
    'wh40k-item-footer',
    'wh40k-source-input',
    'wh40k-section-title',
    // editor — Foundry ProseMirror editor root class used in skill-sheet and others.
    'editor',
    // ── item-trait-sheet.hbs ────────────────────────────────────────────────────
    'wh40k-trait-sheet',
    'wh40k-trait-header',
    'wh40k-trait-header__image',
    'wh40k-trait-header__image-overlay',
    'wh40k-trait-header__info',
    'wh40k-trait-header__meta',
    'wh40k-trait-header__name',
    'wh40k-trait-badge',
    'wh40k-trait-badge--category',
    'wh40k-trait-badge--level',
    'wh40k-trait-badge--variable',
    'wh40k-trait-stats',
    'wh40k-trait-stat',
    'wh40k-trait-stat--category',
    'wh40k-trait-stat--level',
    'wh40k-trait-stat__icon',
    'wh40k-trait-stat__content',
    'wh40k-trait-stat__label',
    'wh40k-trait-stat__value',
    'wh40k-trait-tabs',
    'wh40k-trait-tab',
    'wh40k-trait-content',
    'wh40k-tab-content--trait',
    'wh40k-tabs--trait',
    'wh40k-trait-panel',
    'wh40k-trait-section',
    'wh40k-requirements-display',
    'wh40k-modifier-group',
    'wh40k-modifier-list',
    'wh40k-modifier-name',
    'wh40k-modifier-value',
    // ── item-weapon-sheet.hbs ───────────────────────────────────────────────────
    // Weapon sheet v3 component classes — CSS rules in the monolith; weapon-sheet.ts queries
    // '.wh40k-iconic-stat' and '.wh40k-iconic-stat__shape'; rest are DOM identifiers.
    'wh40k-weapon-sheet-v3',
    'wh40k-weapon-sticky-header',
    'wh40k-weapon-header',
    'wh40k-weapon-header-actions',
    'wh40k-weapon-meta',
    'wh40k-weapon-mosaic',
    'wh40k-weapon-body',
    'wh40k-meta-badge--weapon-type',
    'wh40k-meta-badge--weapon-class',
    'wh40k-meta-badge--craft',
    'wh40k-item-image--sm',
    'wh40k-iconic-stat',
    'wh40k-iconic-stat--large',
    'wh40k-iconic-stat--medium',
    'wh40k-iconic-stat--small',
    'wh40k-iconic-stat--attack',
    'wh40k-iconic-stat--range',
    'wh40k-iconic-stat--damage',
    'wh40k-iconic-stat--pen',
    'wh40k-iconic-stat--rof',
    'wh40k-iconic-stat--clip',
    'wh40k-iconic-stat--reload',
    'wh40k-iconic-stat--tohit',
    'wh40k-iconic-stat--action',
    'wh40k-iconic-stat--weight',
    'wh40k-iconic-stat--quality',
    'wh40k-iconic-stat--clickable',
    'wh40k-iconic-stat--modified',
    'wh40k-iconic-stat--disabled',
    'wh40k-iconic-stat__shape',
    'wh40k-iconic-stat__content',
    'wh40k-iconic-stat__label',
    'wh40k-iconic-stat__value',
    'wh40k-iconic-stat__value--quality',
    'wh40k-iconic-stat__value--positive',
    'wh40k-iconic-stat__value--negative',
    'wh40k-iconic-stat__progress',
    'wh40k-iconic-stat__glow',
    'wh40k-iconic-stat__mod-star',
    'wh40k-rof-grid',
    'wh40k-edit-toggle',
    'wh40k-body-toggle',
    'wh40k-body-toggle__icon',
    'wh40k-body-toggle__label',
    'wh40k-prose',
    'wh40k-prose--clickable',
    'wh40k-prose--editable',
    'wh40k-prose__placeholder',
    'wh40k-description-editor',
    'wh40k-form-grid',
    'wh40k-form-grid--2col',
    'wh40k-form-grid--3col',
    'wh40k-float-field',
    'wh40k-float-field--narrow',
    'wh40k-float-field--select',
    'wh40k-float-field__bar',
    'wh40k-float-field__arrow',
    'wh40k-toggle-row',
    'wh40k-toggle-switch',
    'wh40k-toggle-switch__slider',
    'wh40k-toggle-switch__label',
    'wh40k-toggle-switch--readonly',
    'wh40k-checkbox--readonly',
    'wh40k-mod-dropzone',
    'wh40k-ammo-dropzone',
    'wh40k-ammo-mod',
    'wh40k-ammo-mod--quality',
    'wh40k-ammo-mod--positive',
    'wh40k-ammo-mod--negative',
    'wh40k-loaded-ammo-card',
    'wh40k-loaded-ammo-card__header',
    'wh40k-loaded-ammo-card__name',
    'wh40k-loaded-ammo-card__effects',
    'wh40k-mod-effect',
    'wh40k-mods-list',
    'wh40k-mods-inline',
    'wh40k-mod-card',
    'wh40k-mod-card--inactive',
    'wh40k-mod-card__info',
    'wh40k-mod-card__name',
    'wh40k-mod-card__effects',
    'wh40k-mod-card__actions',
    'wh40k-mod-chip',
    'wh40k-mod-chip--inactive',
    'wh40k-mod-chip__toggle',
    // collapsed — toggled by collapsible-panel-mixin.ts and base-item-sheet.ts; CSS hides body.
    'collapsed',
    // gun / sword — dynamic weapon mosaic type classes toggled via HBS conditional;
    // CSS rules in the monolith apply mosaic-specific background images.
    'gun',
    'sword',
    // ── npc-template/header.hbs ─────────────────────────────────────────────────
    // Structural layout wrapper classes — picked up because 'cardClass="..."' matches the
    // CLASS_ATTR_RE (ends with 'class'). No CSS rules, no JS queries.
    'portrait-section',
    'header-details',
    'name-row',
    'info-row',
    'faction-row',
    'field-group',
    // ── item/panel/item-header.hbs ──────────────────────────────────────────────
    // item-header partial BEM classes not already covered by ITEM_SHEET_BEM_RE.
    'wh40k-item-header',
    'wh40k-item-header__meta',
    'wh40k-item-header__equipped',
    'wh40k-badge--class',
    'wh40k-badge--craftsmanship',
    'wh40k-badge--two-handed',
    // ── item/base/item-base.hbs ─────────────────────────────────────────────────
    // wh40k-physical-sheet — root class for physical item sheets; placed on template root
    // by item-base.hbs; ApplicationV2 classes array carries it too.
    'wh40k-physical-sheet',
    // ── item-weapon-sheet.hbs — remaining component classes ─────────────────────
    // wh40k-section / wh40k-section__* — collapsible content section chrome; CSS rules;
    // no JS queries. effectiveToHit is a data binding key rendered as a static class token
    // via {{#if effectiveToHit}} — a JS-computed value, not a CSS selector.
    'effectiveToHit',
    'wh40k-btn--ghost',
    'wh40k-section',
    'wh40k-section__header',
    'wh40k-section__toggle',
    'wh40k-section__body',
    'wh40k-section__body--prose',
    'wh40k-section--effects',
]);
const SECTION_ID_RE = /^[a-z][a-z0-9_]*_(details|section|panel|body|header)$/;
// Tokens that are artifacts of stripping a `{{someVar}}` expression from the middle of a
// class attr. Five forms:
//   Leading-strip (single):  `{{cssPrefix}}-bar-container` → `-bar-container`  (starts with `-[a-z]`)
//   Leading-strip (double):  `{{pipClass}}--filled`        → `--filled`        (starts with `--[a-z]`)
//   Trailing-strip:          `wh40k-{{key}}-badge`         → `wh40k-`          (ends with hyphen)
//   Leading-strip (underscore): `{{key}}_details`          → `_details`        (starts with `_[a-z]`)
//   Trailing-strip (underscore): `description_{{item.id}}` → `description_`   (ends with underscore)
// None of these forms are valid CSS class names (CSS identifiers cannot start or end with a
// bare hyphen or underscore in this way), so they are safely exempt from the non-tw check.
const HBS_FRAGMENT_RE = /^-{1,2}[a-z][a-z0-9-]*$|^[a-z][a-z0-9-]+-$|^_[a-z][a-z0-9_-]*$|^[a-z][a-z0-9_-]+_$/;
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
    if (ADVANCEMENT_RE.test(token)) return true;
    if (CHAT_CARD_RE.test(token)) return true;
    if (EFFECT_ROW_RE.test(token)) return true;
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
