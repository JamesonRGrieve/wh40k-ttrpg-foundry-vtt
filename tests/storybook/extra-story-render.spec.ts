import { expect, test } from '@playwright/test';

/**
 * Broad story-render integration coverage. Each test navigates to a single
 * Storybook story iframe and makes 1–3 robust assertions grounded in the
 * story's actual args / play-function content (verified by reading the
 * source story files). Selectors and text mirror what each story's own
 * `play` function asserts (canvas.getByText/getByDisplayValue/querySelector
 * → Playwright getByText/locator), or — for stories without a play
 * function — conservative structural locators backed by the story args.
 *
 * Story id = sanitize(meta.title) + '--' + sanitize(storyNameFromExport(key)),
 * the exact `@storybook/csf` algorithm (lodash startCase + sanitize). The
 * ids below were computed with a faithful reimplementation validated
 * against the documented ground-truth examples (e.g.
 * `Inventory/Item Table` + `WeaponPanelDH2` →
 * `inventory-item-table--weapon-panel-dh-2`; note `WeaponSheet` →
 * `weaponsheet`, `NPCSheet` → `npcsheet` — startCase only splits at a
 * lower→Upper or Upper-run→Upper+lower boundary).
 *
 * Companion to tests/storybook/integration.spec.ts; covers a much wider
 * surface (item sheets, actor sheets, partials, chat cards, effects,
 * inventory panels, foundation/icons) across multiple of the 7 game
 * systems for homologation coverage.
 */
test.describe('Storybook extra story render', () => {
    // ── Item Sheets — WeaponSheet (src/module variant) ───────────────────────
    test('weapon sheet renders weapon name', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-weaponsheet--renders-weapon-name');
        await expect(page.locator('input[value="Godwyn-Deaz Boltgun"]').first()).toBeVisible();
    });

    test('weapon sheet exposes toggleBody action', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-weaponsheet--renders-toggle-body-action');
        await expect(page.locator('[data-action="toggleBody"]').first()).toBeAttached();
    });

    test('weapon sheet default renders', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-weaponsheet--default');
        await expect(page.locator('input[value="Godwyn-Deaz Boltgun"]').first()).toBeVisible();
    });

    // ── Item Sheets — WeaponSheet (top-level stories/) ───────────────────────
    test('top-level weapon sheet standard renders damage roll', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-weapon-sheet--standard');
        await expect(page.locator('[data-action="rollDamage"]').first()).toBeVisible();
    });

    // ── Item Sheets — ArmourSheet ────────────────────────────────────────────
    test('armour sheet renders armour name', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-armoursheet--renders-armour-name');
        await expect(page.locator('input[value="Carapace Armour"]').first()).toBeVisible();
    });

    test('armour sheet renders edit-mode toggle', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-armoursheet--renders-edit-mode-toggle');
        await expect(page.locator('[data-action="toggleEditMode"]').first()).toBeAttached();
    });

    test('top-level armour sheet standard renders', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-armour-sheet--standard');
        await expect(page.locator('.wh40k-rpg').first()).toBeAttached();
    });

    // ── Item Sheets — TalentSheet ────────────────────────────────────────────
    test('talent sheet renders talent name', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-talentsheet--renders-talent-name');
        await expect(page.locator('input[value="Mighty Shot"]').first()).toBeVisible();
    });

    test('talent sheet exposes editImage action', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-talentsheet--renders-edit-image-action');
        await expect(page.locator('[data-action="editImage"]').first()).toBeAttached();
    });

    // ── Item Sheets — SkillSheet ─────────────────────────────────────────────
    test('skill sheet renders select and name', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-skillsheet--renders-select-and-name');
        await expect(page.locator('input[value="Common Lore"]').first()).toBeVisible();
        await expect(page.locator('select[name="system.skillType"]')).toBeVisible();
    });

    // ── Item Sheets — PsychicPowerSheet ──────────────────────────────────────
    test('psychic power sheet renders power name', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-psychicpowersheet--renders-power-name');
        await expect(page.locator('input[value="Smite"]').first()).toBeVisible();
    });

    test('psychic power sheet renders discipline badge', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-psychicpowersheet--renders-discipline-badge');
        await expect(page.getByText('Biomancy Power')).toBeVisible();
    });

    // ── Item Sheets — TraitSheet ─────────────────────────────────────────────
    test('trait sheet renders badges', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-traitsheet--renders-badges');
        await expect(page.locator('input[value="Sturdy"]').first()).toBeVisible();
        await expect(page.getByText('Physical').first()).toBeVisible();
    });

    // ── Item Sheets — CyberneticSheet ────────────────────────────────────────
    test('cybernetic sheet renders cybernetic name', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-cyberneticsheet--renders-cybernetic-name');
        await expect(page.locator('input[value="Mechadendrite (Basic)"]').first()).toBeVisible();
    });

    test('cybernetic sheet renders type label', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-cyberneticsheet--renders-type-label');
        await expect(page.getByText('Mechadendrite').first()).toBeVisible();
    });

    // ── Item Sheets — GearSheet ──────────────────────────────────────────────
    test('gear sheet renders name', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-gearsheet--renders-name');
        await expect(page.locator('input[value="Medi-Kit"]').first()).toBeVisible();
    });

    // ── Item Sheets — ConditionSheet ─────────────────────────────────────────
    test('condition sheet renders tabs', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-conditionsheet--renders-tabs');
        await expect(page.getByText('Details').first()).toBeVisible();
        await expect(page.getByText('Effects').first()).toBeVisible();
        await expect(page.locator('[data-tab="description"]').first()).toBeAttached();
    });

    // ── Item Sheets — CriticalInjurySheet ────────────────────────────────────
    test('critical injury sheet renders header', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-criticalinjurysheet--renders-header');
        await expect(page.locator('input[value="Cauterised Arm"]').first()).toBeVisible();
        await expect(page.getByText(/Severity 4/)).toBeVisible();
    });

    // ── Item Sheets — OriginPathSheet ────────────────────────────────────────
    test('origin path sheet renders origin name', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-originpathsheet--renders-origin-name');
        await expect(page.locator('input[value="Hive World"]').first()).toBeVisible();
    });

    test('origin path sheet renders step badge', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-originpathsheet--renders-step-badge');
        await expect(page.getByText('Home World')).toBeVisible();
    });

    // ── Item Sheets — AmmoSheet ──────────────────────────────────────────────
    test('ammo sheet renders modifier/quality tabs', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-ammosheet--renders-tabs');
        await expect(page.locator('input[value="Bolt Rounds (Standard)"]').first()).toBeVisible();
        await expect(page.locator('[data-tab="modifiers"]').first()).toBeAttached();
        await expect(page.locator('[data-tab="qualities"]').first()).toBeAttached();
    });

    // ── Item Sheets — WeaponQualitySheet ─────────────────────────────────────
    test('weapon quality sheet renders identifier', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-weaponqualitysheet--renders-identifier');
        await expect(page.locator('input[value="Tearing"]').first()).toBeVisible();
        await expect(page.getByText('tearing').first()).toBeVisible();
    });

    // ── Actor — CharacterSheet (src/module variant), per-system homologation ──
    test('character sheet DH2e default renders Acolyte Vex', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-charactersheet--dark-heresy-2-e-default');
        await expect(page.locator('input[value="Acolyte Vex"]').first()).toBeVisible();
        await expect(page.getByText('Biography').first()).toBeVisible();
    });

    test('character sheet IM variant renders Interrogator Hale', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-charactersheet--imperium-maledictum');
        await expect(page.locator('input[value="Interrogator Hale"]').first()).toBeVisible();
        await expect(page.getByText('House Varonius')).toBeVisible();
    });

    test('character sheet edit-mode bio fields render', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-charactersheet--edit-mode-bio');
        await expect(page.locator('input[value="29"]').first()).toBeVisible();
        await expect(page.locator('input[value="Female"]').first()).toBeVisible();
    });

    test('character sheet enemy itemCreate row renders', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-charactersheet--enemy-create-click');
        await expect(page.locator('[data-action="itemCreate"]').first()).toBeAttached();
    });

    test('character sheet Black Crusade variant renders', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-charactersheet--black-crusade-variant');
        await expect(page.locator('input[value="Acolyte Vex"]').first()).toBeVisible();
        await expect(page.getByText('Biography').first()).toBeVisible();
    });

    test('character sheet Dark Heresy 1e variant renders', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-charactersheet--dark-heresy-1-e-variant');
        await expect(page.locator('input[value="Acolyte Vex"]').first()).toBeVisible();
        await expect(page.getByText('Biography').first()).toBeVisible();
    });

    test('character sheet Deathwatch variant renders', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-charactersheet--deathwatch-variant');
        await expect(page.locator('input[value="Acolyte Vex"]').first()).toBeVisible();
        await expect(page.getByText('Biography').first()).toBeVisible();
    });

    test('character sheet Only War variant renders', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-charactersheet--only-war-variant');
        await expect(page.locator('input[value="Acolyte Vex"]').first()).toBeVisible();
        await expect(page.getByText('Biography').first()).toBeVisible();
    });

    test('character sheet Rogue Trader variant renders', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-charactersheet--rogue-trader-variant');
        await expect(page.locator('input[value="Acolyte Vex"]').first()).toBeVisible();
        await expect(page.getByText('Biography').first()).toBeVisible();
    });

    // ── Actor — CharacterSheets (top-level) ──────────────────────────────────
    test('character sheets IM biography renders origin step', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-character-sheets--imperium-maledictum-biography');
        await expect(page.locator('input[value="House Varonius"]').first()).toBeVisible();
        await expect(page.locator('input[value="Recover a lost ledger"]').first()).toBeVisible();
    });

    // ── Actor — NPCSheet, per-system homologation ────────────────────────────
    test('NPC sheet default IM renders GM Tools', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-npcsheet--default');
        await expect(page.getByText('GM Tools')).toBeVisible();
        await expect(page.getByText('Scale to Threat')).toBeVisible();
    });

    test('NPC sheet horde mode renders', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-npcsheet--horde-enabled');
        await expect(page.locator('[data-action="toggleHordeMode"]').first()).toBeAttached();
    });

    test('NPC sheet Dark Heresy 2e variant renders GM Tools', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-npcsheet--dark-heresy-2-npc');
        await expect(page.getByText('GM Tools')).toBeVisible();
    });

    test('NPC sheet Deathwatch variant renders GM Tools', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-npcsheet--deathwatch-npc');
        await expect(page.getByText('GM Tools')).toBeVisible();
    });

    test('NPC sheet Rogue Trader variant renders GM Tools', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-npcsheet--rogue-trader-npc');
        await expect(page.getByText('GM Tools')).toBeVisible();
    });

    // ── Actor — StarshipSheet (Rogue Trader) ─────────────────────────────────
    test('starship sheet renders ship name', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-starshipsheet--default');
        await expect(page.locator('input[value="Sword of Terra"]').first()).toBeVisible();
    });

    test('starship sheet exposes rollInitiative action', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-starshipsheet--roll-initiative');
        await expect(page.locator('[data-action="rollInitiative"]').first()).toBeAttached();
    });

    test('starship sheet Black Crusade variant renders', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-starshipsheet--black-cruisade-variant');
        await expect(page.locator('input[value="Despoiler-class Battleship"]').first()).toBeVisible();
    });

    // ── Inventory — Item Table panels, per-system homologation ───────────────
    test('weapon panel DH2e renders lasgun and roll actions', async ({ page }) => {
        await page.goto('/iframe.html?id=inventory-item-table--weapon-panel-dh-2');
        await expect(page.getByText(/Lasgun/).first()).toBeVisible();
        await expect(page.locator('[data-action="itemRoll"]')).toHaveCount(2);
    });

    test('weapon panel IM variant renders', async ({ page }) => {
        await page.goto('/iframe.html?id=inventory-item-table--weapon-panel-im');
        await expect(page.getByText(/Lasgun/).first()).toBeVisible();
    });

    test('weapon panel RT variant renders', async ({ page }) => {
        await page.goto('/iframe.html?id=inventory-item-table--weapon-panel-rt');
        await expect(page.getByText(/Lasgun/).first()).toBeVisible();
    });

    test('armour panel DH2e renders carapace chest', async ({ page }) => {
        await page.goto('/iframe.html?id=inventory-item-table--armour-panel-dh-2');
        await expect(page.getByText('Carapace Chest').first()).toBeVisible();
    });

    test('ship weapons panel DH2e renders fire/delete actions', async ({ page }) => {
        await page.goto('/iframe.html?id=inventory-item-table--ship-weapons-panel-dh-2');
        await expect(page.locator('[data-action="itemFire"]')).toHaveCount(2);
        await expect(page.locator('[data-action="itemDelete"]')).toHaveCount(2);
    });

    test('ship components panel DH2e renders itemEdit actions', async ({ page }) => {
        await page.goto('/iframe.html?id=inventory-item-table--ship-components-panel-dh-2');
        await expect(page.locator('[data-action="itemEdit"]').first()).toBeAttached();
    });

    test('vehicle weapons panel DH2e renders weapon create button', async ({ page }) => {
        await page.goto('/iframe.html?id=inventory-item-table--vehicle-weapons-panel-dh-2');
        await expect(page.locator('[data-action="itemCreate"][data-type="weapon"]').first()).toBeAttached();
    });

    test('item table chrome-only renders add action', async ({ page }) => {
        await page.goto('/iframe.html?id=inventory-item-table--table-chrome-only');
        await expect(page.locator('[data-action="itemCreate"]').first()).toBeAttached();
    });

    // ── Effects — Row + Panels ───────────────────────────────────────────────
    test('actor active effects panel toolbar dispatches effectToggle', async ({ page }) => {
        await page.goto('/iframe.html?id=effects-row-panels--actor-active-effects-panel');
        await expect(page.locator('[data-action="effectToggle"]').first()).toBeAttached();
        await expect(page.getByText('Blessed Ammunition').first()).toBeVisible();
    });

    test('actor effects panel legacy uses toggleEffect action', async ({ page }) => {
        await page.goto('/iframe.html?id=effects-row-panels--actor-effects-panel-legacy');
        await expect(page.locator('[data-action="toggleEffect"]').first()).toBeAttached();
    });

    test('effect row full expanded renders effect label', async ({ page }) => {
        await page.goto('/iframe.html?id=effects-row-panels--row-full-expanded');
        await expect(page.getByText('Blessed Ammunition').first()).toBeVisible();
    });

    test('composed all panels IM renders', async ({ page }) => {
        await page.goto('/iframe.html?id=effects-row-panels--composed-all-panels-im');
        await expect(page.locator('[data-wh40k-system="im"]').first()).toBeAttached();
    });

    test('composed all panels RT renders', async ({ page }) => {
        await page.goto('/iframe.html?id=effects-row-panels--composed-all-panels-rt');
        await expect(page.locator('[data-wh40k-system="rt"]').first()).toBeAttached();
    });

    // ── Chat — Roll Cards ────────────────────────────────────────────────────
    test('chat roll cards action success renders', async ({ page }) => {
        await page.goto('/iframe.html?id=chat-roll-cards--action-success-with-controls');
        await expect(page.getByText('Active Qualities')).toBeVisible();
    });

    test('chat roll cards simple success renders', async ({ page }) => {
        await page.goto('/iframe.html?id=chat-roll-cards--simple-success');
        await expect(page.locator('.wh40k-rpg').first()).toBeAttached();
    });

    test('chat roll cards damage assignable renders', async ({ page }) => {
        await page.goto('/iframe.html?id=chat-roll-cards--damage-with-assignable-hit');
        await expect(page.locator('.wh40k-rpg').first()).toBeAttached();
    });

    // ── Chat — Skill Card ────────────────────────────────────────────────────
    test('chat skill card with specializations renders', async ({ page }) => {
        await page.goto('/iframe.html?id=chat-skill-card--with-specializations');
        await expect(page.getByText('Common Lore').first()).toBeVisible();
    });

    // ── Shared — Components ──────────────────────────────────────────────────
    test('shared components active modifiers panel renders', async ({ page }) => {
        await page.goto('/iframe.html?id=shared-components--active-modifiers-panel');
        await expect(page.locator('.wh40k-rpg').first()).toBeAttached();
    });

    test('shared components weapon quick actions renders', async ({ page }) => {
        await page.goto('/iframe.html?id=shared-components--weapon-quick-actions');
        await expect(page.locator('.wh40k-rpg').first()).toBeAttached();
    });

    // ── Shared — FieldRow ────────────────────────────────────────────────────
    test('field row number dispatch renders typed input', async ({ page }) => {
        await page.goto('/iframe.html?id=shared-fieldrow--number-dispatch');
        const input = page.locator('input[name="system.combat.movement"]');
        await expect(input).toBeVisible();
        await expect(input).toHaveAttribute('data-dtype', 'Number');
        await expect(input).toHaveValue('4');
    });

    test('field row select renders options', async ({ page }) => {
        await page.goto('/iframe.html?id=shared-fieldrow--select');
        await expect(page.locator('select[name="system.bio.homeworld"]')).toBeVisible();
    });

    // ── Actor Partials — SectionCard ─────────────────────────────────────────
    test('section card add-button dispatch carries data-type', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-partials-sectioncard--add-button-dispatch');
        const btn = page.locator('[data-action="itemCreate"]').first();
        await expect(btn).toBeAttached();
        await expect(btn).toHaveAttribute('data-type', 'criticalInjury');
    });

    // ── Actor Partials — StatBox ─────────────────────────────────────────────
    test('stat box value/max names bind', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-partials-statbox--value-max-names-bind');
        await expect(page.locator('input[name="system.hullIntegrity.value"]')).toHaveValue('35');
        await expect(page.locator('input[name="system.hullIntegrity.max"]')).toHaveValue('50');
    });

    // ── Actor Partials — PipTrackerRow ───────────────────────────────────────
    test('pip tracker row click dispatch renders pips', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-partials-piptrackerrow--click-dispatch');
        await expect(page.locator('[data-action="setFateStar"]')).toHaveCount(3);
        await expect(page.locator('[data-fate-index="2"]').first()).toBeAttached();
    });

    // ── Actor Partials — VitalInlineRow ──────────────────────────────────────
    test('vital inline row click dispatch wires increment field', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-partials-vitalinlinerow--click-dispatch');
        const inc = page.locator('[data-action="increment"]').first();
        await expect(inc).toBeAttached();
        await expect(inc).toHaveAttribute('data-field', 'system.wounds.value');
    });

    // ── Actor Partials — HeaderBase, per-system ──────────────────────────────
    test('header base sidebar IM carries system data attribute', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-partials-headerbase--sidebar-im');
        await expect(page.locator('[data-wh40k-system="im"]').first()).toBeAttached();
    });

    test('header base horizontal starship RT carries system data attribute', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-partials-headerbase--horizontal-starship');
        await expect(page.locator('[data-wh40k-system="rt"]').first()).toBeAttached();
    });

    // ── Actor Partials — DashboardZone ───────────────────────────────────────
    test('dashboard zone custom content class renders title and grid', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-partials-dashboardzone--custom-content-class');
        await expect(page.getByText('Skills').first()).toBeVisible();
        await expect(page.locator('.tw-grid').first()).toBeAttached();
    });

    // ── Actor Partials — DegreeMeterPanel, per-system ────────────────────────
    test('degree meter panel DH2 debased renders warning icon', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-partials-degreemeterpanel--corruption-dh-2-debased');
        await expect(page.locator('.fa-skull-crossbones').first()).toBeAttached();
    });

    test('degree meter panel IM corruption renders', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-partials-degreemeterpanel--corruption-im');
        await expect(page.locator('.wh40k-rpg').first()).toBeAttached();
    });

    test('degree meter panel RT profane renders', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-partials-degreemeterpanel--corruption-rt');
        await expect(page.locator('.wh40k-rpg').first()).toBeAttached();
    });

    // ── Actor Partials — StatGridSection, per-system ─────────────────────────
    test('stat grid section mobility renders movement actions', async ({ page }) => {
        await page.goto('/iframe.html?id=partials-stat-grid-section--mobility');
        await expect(page.locator('[data-action="setMovementMode"]').first()).toBeAttached();
    });

    test('stat grid section IM variant renders movement actions', async ({ page }) => {
        await page.goto('/iframe.html?id=partials-stat-grid-section--per-system-im');
        await expect(page.locator('[data-action="setMovementMode"]').first()).toBeAttached();
    });

    // ── Dialogs — ConfirmationDialog ─────────────────────────────────────────
    test('confirmation dialog confirm flow renders both buttons', async ({ page }) => {
        await page.goto('/iframe.html?id=dialogs-confirmationdialog--confirm-flow');
        await expect(page.getByText('Delete')).toBeVisible();
        await expect(page.getByText('Cancel')).toBeVisible();
        await expect(page.locator('[data-action="confirm"]').first()).toBeAttached();
    });

    // ── Dialogs — AcquisitionDialog ──────────────────────────────────────────
    test('acquisition dialog roll flow renders item and roll action', async ({ page }) => {
        await page.goto('/iframe.html?id=dialogs-acquisitiondialog--roll-flow');
        await expect(page.getByText('Bolt Pistol').first()).toBeVisible();
        await expect(page.locator('[data-action="roll"]').first()).toBeAttached();
    });

    // ── Prompts — RighteousFuryDialog ────────────────────────────────────────
    test('righteous fury dialog roll flow renders weapon and roll action', async ({ page }) => {
        await page.goto('/iframe.html?id=prompts-righteousfurydialog--roll-flow');
        await expect(page.getByText('Bolter').first()).toBeVisible();
        await expect(page.locator('[data-action="roll"]').first()).toBeAttached();
    });

    // ── Prompts — AddXPDialog ────────────────────────────────────────────────
    test('add xp dialog apply disabled at zero', async ({ page }) => {
        await page.goto('/iframe.html?id=prompts-addxpdialog--apply-disabled-at-zero');
        const apply = page.locator('[data-action="apply"]').first();
        await expect(apply).toBeAttached();
        await expect(apply).toBeDisabled();
        await expect(page.locator('[data-action="cancel"]').first()).toBeAttached();
    });

    // ── Foundation — Icons, per-system ───────────────────────────────────────
    test('icons helper sample renders themed glyph', async ({ page }) => {
        await page.goto('/iframe.html?id=foundation-icons--default');
        await expect(page.locator('[data-wh40k-system="dh2e"]').first()).toBeAttached();
        await expect(page.locator('svg').first()).toBeAttached();
    });

    test('icons per-system matrix renders all systems', async ({ page }) => {
        await page.goto('/iframe.html?id=foundation-icons--per-system-matrix');
        await expect(page.locator('[data-wh40k-system="im"]').first()).toBeAttached();
        await expect(page.locator('[data-wh40k-system="rt"]').first()).toBeAttached();
    });

    test('icons bundled catalogue renders tiles', async ({ page }) => {
        await page.goto('/iframe.html?id=foundation-icons--catalogue');
        await expect(page.locator('svg').first()).toBeAttached();
    });
});
