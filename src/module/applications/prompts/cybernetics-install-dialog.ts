/**
 * @file CyberneticsInstallDialog — GM/player dialog driving the
 * cybernetic install Medicae surgery test (#125 — core.md
 * §"Attaching Bionics and Implants").
 *
 * The dialog surfaces the four pure inputs the install engine needs:
 *  - base difficulty band (standard d100 ladder),
 *  - device craftsmanship (Poor … Best),
 *  - install site (External / Limb / Organ / Neural — classified from
 *    the cybernetic's `locations` set by the engine),
 *  - the chirurgeon's effective Medicae skill total.
 *
 * Rolling composes the target via `composeInstallTest`, rolls a real
 * Foundry 1d100, resolves with `resolveInstall`, also rolls the 2d10
 * recovery time, and emits a chat card. All mechanics live in
 * `rules/cybernetics.ts`; this file is a thin UI shell.
 *
 * DH2-canonical surgery flow. The math is content-agnostic d100
 * composition (no per-implant content in `src/`), so it does not
 * regress the other six lines.
 */

import { type CyberneticCraftsmanship, type CyberneticInstallSite, composeInstallTest, resolveInstall, rollRecoveryTime } from '../../rules/cybernetics.ts';
import { rollDifficulties } from '../../rules/difficulties.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

const CRAFTSMANSHIP_OPTIONS: ReadonlyArray<{ id: CyberneticCraftsmanship; labelKey: string }> = Object.freeze([
    { id: 'poor', labelKey: 'WH40K.Craftsmanship.Poor' },
    { id: 'common', labelKey: 'WH40K.Craftsmanship.Common' },
    { id: 'good', labelKey: 'WH40K.Craftsmanship.Good' },
    { id: 'best', labelKey: 'WH40K.Craftsmanship.Best' },
]);

const SITE_OPTIONS: ReadonlyArray<{ id: CyberneticInstallSite; labelKey: string }> = Object.freeze([
    { id: 'external', labelKey: 'WH40K.Cybernetics.SiteExternal' },
    { id: 'limb', labelKey: 'WH40K.Cybernetics.SiteLimb' },
    { id: 'organ', labelKey: 'WH40K.Cybernetics.SiteOrgan' },
    { id: 'neural', labelKey: 'WH40K.Cybernetics.SiteNeural' },
]);

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface CyberneticsInstallContext extends Record<string, unknown> {
    deviceName: string;
    difficulties: Array<{ value: number; label: string }>;
    craftsmanships: ReadonlyArray<{ id: CyberneticCraftsmanship; labelKey: string }>;
    sites: ReadonlyArray<{ id: CyberneticInstallSite; labelKey: string }>;
    baseDifficulty: number;
    craftsmanship: CyberneticCraftsmanship;
    site: CyberneticInstallSite;
    surgeonSkillTotal: number;
    surgeonModifier: number;
}

interface AnyGame {
    user?: { id?: string };
    i18n?: { localize?: (k: string) => string };
}

function isCraftsmanship(v: string): v is CyberneticCraftsmanship {
    return v === 'poor' || v === 'common' || v === 'good' || v === 'best';
}

function isSite(v: string): v is CyberneticInstallSite {
    return v === 'external' || v === 'limb' || v === 'organ' || v === 'neural';
}

interface InstallDialogOptions {
    deviceName?: string;
    baseDifficulty?: number;
    craftsmanship?: CyberneticCraftsmanship;
    site?: CyberneticInstallSite;
    surgeonSkillTotal?: number;
    surgeonModifier?: number;
    /** Recipient Toughness Bonus — drives the 2d10−TB recovery roll. */
    toughnessBonus?: number;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class CyberneticsInstallDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare deviceName: string;
    declare baseDifficulty: number;
    declare craftsmanship: CyberneticCraftsmanship;
    declare site: CyberneticInstallSite;
    declare surgeonSkillTotal: number;
    declare surgeonModifier: number;
    declare toughnessBonus: number;

    constructor(options: ApplicationV2Config.DefaultOptions & InstallDialogOptions = {}) {
        super(options);
        const o = options as InstallDialogOptions;
        this.deviceName = o.deviceName ?? '';
        this.baseDifficulty = Number.isFinite(o.baseDifficulty) ? Number(o.baseDifficulty) : 0;
        this.craftsmanship = o.craftsmanship !== undefined && isCraftsmanship(o.craftsmanship) ? o.craftsmanship : 'common';
        this.site = o.site !== undefined && isSite(o.site) ? o.site : 'limb';
        this.surgeonSkillTotal = Number.isFinite(o.surgeonSkillTotal) ? Number(o.surgeonSkillTotal) : 30;
        this.surgeonModifier = Number.isFinite(o.surgeonModifier) ? Number(o.surgeonModifier) : 0;
        this.toughnessBonus = Number.isFinite(o.toughnessBonus) ? Number(o.toughnessBonus) : 3;
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'cybernetics-install-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectCraftsmanship: CyberneticsInstallDialog.#onSelectCraftsmanship,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectSite: CyberneticsInstallDialog.#onSelectSite,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            rollInstall: CyberneticsInstallDialog.#onRollInstall,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: CyberneticsInstallDialog.#onCancel,
        },
        position: { width: 540 },
        window: {
            title: 'WH40K.Cybernetics.InstallDialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/cybernetics-install-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /**
     * Read the live numeric form fields back onto the instance before an
     * action. `origin` is the action's event target — its enclosing
     * form (or owner document) is the typed-safe DOM root to query,
     * mirroring the sibling fear-test dialog (avoids the untyped
     * `this.element`).
     */
    #syncFormState(origin: HTMLElement): void {
        const root: ParentNode = origin.closest('form, .application') ?? origin.ownerDocument;
        const num = (name: string, fallback: number): number => {
            const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
            if (input === null) return fallback;
            const parsed = Number(input.value);
            return Number.isFinite(parsed) ? parsed : fallback;
        };
        this.baseDifficulty = num('baseDifficulty', this.baseDifficulty);
        this.surgeonSkillTotal = num('surgeonSkillTotal', this.surgeonSkillTotal);
        this.surgeonModifier = num('surgeonModifier', this.surgeonModifier);
        this.toughnessBonus = num('toughnessBonus', this.toughnessBonus);
    }

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<CyberneticsInstallContext> {
        const context = (await super._prepareContext(options)) as CyberneticsInstallContext;
        const difficulties = Object.entries(rollDifficulties()).map(([value, label]) => ({
            value: Number(value),
            label,
        }));
        return {
            ...context,
            deviceName: this.deviceName,
            difficulties,
            craftsmanships: CRAFTSMANSHIP_OPTIONS,
            sites: SITE_OPTIONS,
            baseDifficulty: this.baseDifficulty,
            craftsmanship: this.craftsmanship,
            site: this.site,
            surgeonSkillTotal: this.surgeonSkillTotal,
            surgeonModifier: this.surgeonModifier,
        };
    }

    static async #onSelectCraftsmanship(this: CyberneticsInstallDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const value = target.dataset['craftsmanship'] ?? '';
        if (isCraftsmanship(value)) {
            this.#syncFormState(target);
            this.craftsmanship = value;
            await this.render();
        }
    }

    static async #onSelectSite(this: CyberneticsInstallDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const value = target.dataset['site'] ?? '';
        if (isSite(value)) {
            this.#syncFormState(target);
            this.site = value;
            await this.render();
        }
    }

    static async #onRollInstall(this: CyberneticsInstallDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        this.#syncFormState(target);

        const composition = composeInstallTest({
            baseDifficulty: this.baseDifficulty,
            craftsmanship: this.craftsmanship,
            site: this.site,
            surgeonSkillTotal: this.surgeonSkillTotal,
            surgeonModifier: this.surgeonModifier,
        });

        const rollResult = await new Roll('1d100').evaluate();
        const roll = Number(rollResult.total);
        const resolution = resolveInstall(composition, roll);
        const recovery = rollRecoveryTime(this.toughnessBonus);

        const g = globalThis as unknown as { game?: AnyGame };
        const localize = g.game?.i18n?.localize?.bind(g.game.i18n);
        const craftLabel = localize?.(`WH40K.Craftsmanship.${this.craftsmanship.charAt(0).toUpperCase()}${this.craftsmanship.slice(1)}`) ?? this.craftsmanship;
        const siteLabel = localize?.(`WH40K.Cybernetics.Site${this.site.charAt(0).toUpperCase()}${this.site.slice(1)}`) ?? this.site;

        const templateData = {
            deviceName: this.deviceName,
            craftsmanshipLabel: craftLabel,
            siteLabel,
            target: resolution.target,
            roll: resolution.roll,
            success: resolution.success,
            dos: resolution.dos,
            dof: resolution.dof,
            bloodLoss: resolution.bloodLoss,
            faulty: resolution.faulty,
            recoveryDays: recovery.days,
            breakdown: resolution.breakdown,
            gameSystem: 'dh2e',
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/cybernetics-install-chat.hbs', templateData);

        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: g.game?.user?.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
        await this.close();
    }

    static async #onCancel(this: CyberneticsInstallDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Convenience opener — cybernetic-item / character-sheet buttons hook into this. */
export function openCyberneticsInstallDialog(opts: InstallDialogOptions = {}): void {
    const dialog = new CyberneticsInstallDialog(opts);
    void dialog.render({ force: true });
}
