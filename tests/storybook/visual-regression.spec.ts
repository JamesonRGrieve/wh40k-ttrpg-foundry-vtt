/**
 * Visual-regression baseline coverage over a curated 30–60 story set.
 *
 * Baselines under tests/storybook/*-snapshots/ (gitignored by the orchestrator
 * if it chooses; first run requires --update-snapshots).
 *
 * Bootstrap procedure for the first human running this:
 *   pnpm test:storybook -- --update-snapshots
 *
 * That command writes the PNG baselines under
 *   tests/storybook/visual-regression.spec.ts-snapshots/<storyId>.png
 * (Playwright derives the snapshot directory from the spec filename). Subsequent
 * runs (`pnpm test:storybook`) diff against those baselines using
 * toHaveScreenshot with maxDiffPixels: 200, threshold: 0.02, fullPage: true.
 *
 * Story IDs are NOT guessed. Each id below is reused verbatim from
 * tests/storybook/integration.spec.ts (ground truth — these 5 sheet shells +
 * a chat card and inventory panel are explicitly verified there) and
 * tests/storybook/extra-story-render.spec.ts (the file's top comment documents
 * the @storybook/csf storyId derivation algorithm: sanitize(meta.title) + '--'
 * + sanitize(storyNameFromExport(key)), with lodash startCase + sanitize, and
 * notes the verified-against-source cases such as
 *   `Inventory/Item Table` + `WeaponPanelDH2` → `inventory-item-table--weapon-panel-dh-2`
 *   `WeaponSheet` → `weaponsheet` (no boundary inside an all-Upper-then-lower run).
 * The curated set here is a subset of those already-verified ids — never a
 * fresh derivation.
 *
 * Curation rationale: ~50 high-value stories covering canonical sheet shells
 * (DH2 character biography, IM character biography, IM NPC, weapon, armour),
 * a representative card from each chat-card family, item-table panels across
 * DH2 / IM / RT for per-system homologation, the shared/partial layouts that
 * compose into multi-sheet layouts (statbox, piptracker, vitalrow, headerbase,
 * dashboardzone, degree meter, statgrid), and one entry from each
 * dialog/prompt family. Per-system theming surfaces (icons matrix,
 * headerbase IM/RT, degree meter DH2/IM/RT, item-table DH2/IM/RT,
 * stat-grid mobility/IM, effects composed IM/RT) are included so the
 * baseline diff catches per-system theme cascade regressions across all
 * seven game systems.
 *
 * No e2e dimension is recorded — this spec runs under playwright.storybook
 * only, never calls recordCoverage, and is intentionally not part of the
 * Tier B e2e:coverage ratchet.
 */

import { expect, test } from '@playwright/test';

const SETTLE_MS = 400;

/**
 * Curated story IDs. Each id is cross-checked against integration.spec.ts
 * (ground-truth) and extra-story-render.spec.ts (algorithm-verified).
 */
const STORY_IDS: readonly string[] = [
    // ── Canonical sheet shells (ground truth — verified in integration.spec.ts)
    'actor-character-sheets--dark-heresy-2-biography',
    'actor-character-sheets--imperium-maledictum-biography',
    'actor-character-sheets--imperium-maledictum-npc',
    'item-sheets-weapon-sheet--standard',
    'item-sheets-armour-sheet--standard',

    // ── Item sheets — broader coverage of every item-type sheet shell ────────
    'item-sheets-talentsheet--renders-talent-name',
    'item-sheets-skillsheet--renders-select-and-name',
    'item-sheets-psychicpowersheet--renders-power-name',
    'item-sheets-traitsheet--renders-badges',
    'item-sheets-cyberneticsheet--renders-cybernetic-name',
    'item-sheets-gearsheet--renders-name',
    'item-sheets-conditionsheet--renders-tabs',
    'item-sheets-criticalinjurysheet--renders-header',
    'item-sheets-originpathsheet--renders-origin-name',
    'item-sheets-ammosheet--renders-tabs',

    // ── Actor sheets — per-system homologation matrix ────────────────────────
    'actor-charactersheet--dark-heresy-2-e-default',
    'actor-charactersheet--imperium-maledictum',
    'actor-charactersheet--black-crusade-variant',
    'actor-charactersheet--dark-heresy-1-e-variant',
    'actor-charactersheet--deathwatch-variant',
    'actor-charactersheet--rogue-trader-variant',
    'actor-npcsheet--default',
    'actor-npcsheet--dark-heresy-2-npc',
    'actor-npcsheet--rogue-trader-npc',
    'actor-voidcraftactorsheet--default',
    'actor-voidcraftactorsheet--black-cruisade-variant',

    // ── Inventory item-table panels per-system ───────────────────────────────
    'inventory-item-table--weapon-panel-dh-2',
    'inventory-item-table--weapon-panel-im',
    'inventory-item-table--weapon-panel-rt',
    'inventory-item-table--armour-panel-dh-2',
    'inventory-item-table--ship-weapons-panel-dh-2',
    'inventory-item-table--vehicle-weapons-panel-dh-2',

    // ── Actor partials — composed-layout surfaces ────────────────────────────
    'actor-partials-sectioncard--add-button-dispatch',
    'actor-partials-statbox--value-max-names-bind',
    'actor-partials-piptrackerrow--click-dispatch',
    'actor-partials-vitalinlinerow--click-dispatch',
    'actor-partials-headerbase--sidebar-im',
    'actor-partials-headerbase--horizontal-starship',
    'actor-partials-dashboardzone--custom-content-class',
    'actor-partials-degreemeterpanel--corruption-dh-2-debased',
    'actor-partials-degreemeterpanel--corruption-im',
    'actor-partials-degreemeterpanel--corruption-rt',
    'partials-stat-grid-section--mobility',

    // ── Chat cards — one representative per family ───────────────────────────
    'chat-roll-cards--action-success-with-controls',
    'chat-roll-cards--simple-success',
    'chat-roll-cards--damage-with-assignable-hit',
    'chat-skill-card--with-specializations',

    // ── Shared components ────────────────────────────────────────────────────
    'shared-components--active-effects-panel',
    'shared-components--active-modifiers-panel',
    'shared-components--weapon-quick-actions',
    'shared-fieldrow--number-dispatch',

    // ── Effects row & panels ─────────────────────────────────────────────────
    'effects-row-panels--actor-active-effects-panel',
    'effects-row-panels--composed-all-panels-im',
    'effects-row-panels--composed-all-panels-rt',

    // ── Dialogs & prompts ────────────────────────────────────────────────────
    'dialogs-confirmationdialog--confirm-flow',
    'dialogs-acquisitiondialog--roll-flow',
    'prompts-righteousfurydialog--roll-flow',
    'prompts-addxpdialog--apply-disabled-at-zero',

    // ── Foundation — icons per-system ────────────────────────────────────────
    'foundation-icons--per-system-matrix',
    'foundation-icons--catalogue',
];

test.describe('Storybook visual regression', () => {
    for (const storyId of STORY_IDS) {
        test(storyId, async ({ page }) => {
            await page.goto(`/iframe.html?id=${storyId}`);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(SETTLE_MS);
            await expect(page).toHaveScreenshot(`${storyId}.png`, {
                maxDiffPixels: 200,
                threshold: 0.02,
                fullPage: true,
            });
        });
    }
});
