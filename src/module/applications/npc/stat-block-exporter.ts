import type { WH40KBaseActor } from '../../documents/base-actor.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Shape of an NPC actor's system data used for export. All fields are optional because NPC subtypes vary. */
interface NpcSystemExport {
    faction?: string;
    subfaction?: string;
    type?: { titleCase?: () => string };
    role?: { titleCase?: () => string };
    threatLevel?: number;
    characteristics?: Record<string, { short?: string; total?: number } | undefined>;
    wounds?: { value?: number; max?: number };
    horde?: { enabled?: boolean; magnitude?: { current?: number; max?: number } };
    movement?: { half?: number; full?: number; charge?: number; run?: number };
    armour?: {
        mode?: string;
        total?: number;
        locations?: { head?: number; body?: number; leftArm?: number; rightArm?: number; leftLeg?: number; rightLeg?: number };
    };
    trainedSkills?: Record<string, { name?: string; plus20?: boolean; plus10?: boolean; bonus?: number }>;
    weapons?: { simple?: Array<{ name?: string; damage?: string; pen?: string; range?: string; rof?: string; special?: string }> };
    specialAbilities?: string;
    quickNotes?: string;
}

/**
 * Dialog for exporting NPC stat blocks in various formats.
 * @extends {ApplicationV2}
 */
export default class StatBlockExporter extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'stat-block-exporter-{id}',
        classes: ['wh40k-rpg', 'stat-block-exporter'],
        tag: 'div',
        window: {
            title: 'WH40K.NPC.Export.Title',
            icon: 'fa-solid fa-file-export',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 700,
            height: 600,
        },
        actions: {
            copyToClipboard: StatBlockExporter.#onCopyToClipboard,
            exportJson: StatBlockExporter.#onExportJson,
            exportText: StatBlockExporter.#onExportText,
            close: StatBlockExporter.#onClose,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/stat-block-exporter.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The actor being exported.
     * @type {WH40KBaseActor | null}
     */
    #actor: WH40KBaseActor | null = null;

    /**
     * Current export format.
     * @type {'text' | 'json'}
     */
    #format: 'text' | 'json' = 'text';

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * @param {WH40KBaseActor} actor - The NPC actor to export.
     * @param {Record<string, unknown>} [options] - Application options.
     */
    constructor(actor: WH40KBaseActor, options: Record<string, unknown> = {}) {
        super(options);
        this.#actor = actor;
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        return game.i18n.format('WH40K.NPC.Export.Title', { name: this.#actor?.name ?? 'NPC' });
    }

    /* -------------------------------------------- */
    /*  Static Export Methods                       */
    /* -------------------------------------------- */

    /**
     * Export an NPC to formatted text.
     * @param {WH40KBaseActor} actor - The actor to export.
     * @returns {string} Formatted text stat block.
     */
    static toText(actor: WH40KBaseActor): string {
        const sys = actor.system as NpcSystemExport;
        const lines: string[] = [];

        // Header
        lines.push('═'.repeat(50));
        lines.push(actor.name.toUpperCase());
        lines.push('═'.repeat(50));
        lines.push('');

        // Identity
        if (sys.faction !== undefined) lines.push(`Faction: ${sys.faction}`);
        if (sys.subfaction !== undefined) lines.push(`Subfaction: ${sys.subfaction}`);
        lines.push(`Type: ${sys.type?.titleCase?.() ?? 'Unknown'} | Role: ${sys.role?.titleCase?.() ?? 'Unknown'}`);
        lines.push(`Threat Level: ${sys.threatLevel ?? 5}`);
        lines.push('');

        // Characteristics
        lines.push('─'.repeat(50));
        lines.push('CHARACTERISTICS');
        lines.push('─'.repeat(50));

        const chars = sys.characteristics;
        if (chars !== undefined) {
            const charLine1: string[] = [];
            const charLine2: string[] = [];

            const order = ['weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility'];
            for (const key of order) {
                const c = chars[key];
                if (c !== undefined) {
                    charLine1.push(`${c.short}: ${c.total}`);
                }
            }

            const order2 = ['intelligence', 'perception', 'willpower', 'fellowship', 'influence'];
            for (const key of order2) {
                const c = chars[key];
                if (c !== undefined) {
                    charLine2.push(`${c.short}: ${c.total}`);
                }
            }

            lines.push(charLine1.join(' | '));
            lines.push(charLine2.join(' | '));
        }
        lines.push('');

        // Vitals
        lines.push('─'.repeat(50));
        lines.push('VITALS');
        lines.push('─'.repeat(50));
        lines.push(`Wounds: ${sys.wounds?.value ?? 0}/${sys.wounds?.max ?? 0}`);

        if (sys.horde?.enabled === true) {
            lines.push(`Magnitude: ${sys.horde.magnitude?.current ?? 0}/${sys.horde.magnitude?.max ?? 100}`);
        }

        const mv = sys.movement;
        if (mv !== undefined) {
            lines.push(`Movement: H${mv.half} / F${mv.full} / C${mv.charge} / R${mv.run}`);
        }
        lines.push('');

        // Armour
        lines.push('─'.repeat(50));
        lines.push('ARMOUR');
        lines.push('─'.repeat(50));
        if (sys.armour?.mode === 'simple') {
            lines.push(`Total AP: ${sys.armour.total ?? 0}`);
        } else if (sys.armour?.locations !== undefined) {
            const locs = sys.armour.locations;
            lines.push(`Head: ${locs.head ?? 0} | Body: ${locs.body ?? 0}`);
            lines.push(`Arms: ${locs.leftArm ?? 0}/${locs.rightArm ?? 0} | Legs: ${locs.leftLeg ?? 0}/${locs.rightLeg ?? 0}`);
        }
        lines.push('');

        // Trained Skills
        if (sys.trainedSkills !== undefined && Object.keys(sys.trainedSkills).length > 0) {
            lines.push('─'.repeat(50));
            lines.push('SKILLS');
            lines.push('─'.repeat(50));

            const skillLines: string[] = [];
            for (const [key, skill] of Object.entries(sys.trainedSkills)) {
                let level = '';
                if (skill.plus20 === true) level = '+20';
                else if (skill.plus10 === true) level = '+10';

                const bonus = skill.bonus !== undefined ? ` (+${skill.bonus})` : '';
                skillLines.push(`${skill.name ?? key}${level}${bonus}`);
            }
            lines.push(skillLines.join(', '));
            lines.push('');
        }

        // Weapons
        const weaponsSimple = sys.weapons?.simple ?? [];
        if (weaponsSimple.length > 0) {
            lines.push('─'.repeat(50));
            lines.push('WEAPONS');
            lines.push('─'.repeat(50));

            for (const w of weaponsSimple) {
                const special = w.special !== undefined ? ` [${w.special}]` : '';
                lines.push(`${w.name}: ${w.damage} Pen ${w.pen} | ${w.range} | RoF: ${w.rof}${special}`);
            }
            lines.push('');
        }

        // Talents (from items)
        const talents = actor.items.filter((i) => i.type === 'talent');
        if (talents.length > 0) {
            lines.push('─'.repeat(50));
            lines.push('TALENTS');
            lines.push('─'.repeat(50));
            lines.push(talents.map((t) => t.name).join(', '));
            lines.push('');
        }

        // Traits (from items)
        const traits = actor.items.filter((i) => i.type === 'trait');
        if (traits.length > 0) {
            lines.push('─'.repeat(50));
            lines.push('TRAITS');
            lines.push('─'.repeat(50));
            lines.push(traits.map((t) => t.name).join(', '));
            lines.push('');
        }

        // Special Abilities
        if (sys.specialAbilities !== undefined) {
            const plainText = this._stripHtml(sys.specialAbilities);
            if (plainText.trim()) {
                lines.push('─'.repeat(50));
                lines.push('SPECIAL ABILITIES');
                lines.push('─'.repeat(50));
                lines.push(plainText);
                lines.push('');
            }
        }

        // Notes
        if (sys.quickNotes !== undefined) {
            const plainText = this._stripHtml(sys.quickNotes);
            if (plainText.trim()) {
                lines.push('─'.repeat(50));
                lines.push('GM NOTES');
                lines.push('─'.repeat(50));
                lines.push(plainText);
                lines.push('');
            }
        }

        lines.push('═'.repeat(50));

        return lines.join('\n');
    }

    /**
     * Export an NPC to JSON format.
     * @param {WH40KBaseActor} actor - The actor to export.
     * @param {Object} [options] - Export options.
     * @param {boolean} [options.includeItems=true] - Include embedded items.
     * @param {boolean} [options.prettyPrint=true] - Pretty print JSON.
     * @returns {string} JSON string.
     */
    static toJSON(actor: WH40KBaseActor, options: { includeItems?: boolean; prettyPrint?: boolean } = {}): string {
        const { includeItems = true, prettyPrint = true } = options;

        const exportData = {
            name: actor.name,
            img: actor.img,
            type: actor.type,
            system: foundry.utils.deepClone(actor.system),
            items: includeItems
                ? actor.items.map((i) => ({
                      name: i.name,
                      type: i.type,
                      img: i.img,
                      system: foundry.utils.deepClone(i.system),
                  }))
                : [],
            exportedAt: new Date().toISOString(),
            exportedBy: game.user.name || 'Unknown',
            systemVersion: game.system.version,
        };

        return prettyPrint ? JSON.stringify(exportData, null, 2) : JSON.stringify(exportData);
    }

    /**
     * Strip HTML tags from a string.
     * @param {string} html - HTML string.
     * @returns {string} Plain text.
     * @private
     */
    static _stripHtml(html: string): string {
        if (html === '') return '';
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        if (!this.#actor) return context;

        // Generate export content based on format
        const textContent = StatBlockExporter.toText(this.#actor);
        const jsonContent = StatBlockExporter.toJSON(this.#actor);

        return {
            ...context,
            actor: this.#actor,
            format: this.#format,
            textContent,
            jsonContent,
            buttons: [
                {
                    action: 'copyToClipboard',
                    icon: 'fa-solid fa-clipboard',
                    label: 'WH40K.NPC.Export.CopyToClipboard',
                    cssClass: 'tw-bg-[var(--wh40k-color-gold)] tw-text-white hover:tw-bg-[#9e801f]',
                },
                { action: 'exportText', icon: 'fa-solid fa-file-lines', label: 'WH40K.NPC.Export.DownloadText' },
                { action: 'exportJson', icon: 'fa-solid fa-file-code', label: 'WH40K.NPC.Export.DownloadJSON' },
                { action: 'close', icon: 'fa-solid fa-times', label: 'Close' },
            ],
        };
    }

    /** @override */
    _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        void super._onRender(context, options);

        // Handle format toggle
        const formatTabs = this.element.querySelectorAll('[data-format]');
        for (const tab of formatTabs) {
            tab.addEventListener('click', (e) => {
                this.#format = (e.currentTarget as HTMLElement).dataset.format as 'text' | 'json';
                void this.render({ parts: ['content'] });
            });
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Copy current content to clipboard.
     * @param {StatBlockExporter} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onCopyToClipboard(this: StatBlockExporter, event: PointerEvent, target: HTMLElement): Promise<void> {
        if (this.#actor === null) return;
        const content = this.#format === 'json' ? StatBlockExporter.toJSON(this.#actor) : StatBlockExporter.toText(this.#actor);

        try {
            await navigator.clipboard.writeText(content);
            ui.notifications.info(game.i18n.localize('WH40K.NPC.Export.CopiedToClipboard'));
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            ui.notifications.error(game.i18n.localize('WH40K.NPC.Export.CopyFailed'));
        }
    }

    /**
     * Download as JSON file.
     * @param {StatBlockExporter} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onExportJson(this: StatBlockExporter, event: PointerEvent, target: HTMLElement): void {
        if (this.#actor === null) return;
        const content = StatBlockExporter.toJSON(this.#actor);
        const filename = `${this.#actor.name.slugify()}.json`;

        StatBlockExporter._downloadFile(content, filename, 'application/json');
        ui.notifications.info(game.i18n.format('WH40K.NPC.Export.Downloaded', { filename }));
    }

    /**
     * Download as text file.
     * @param {StatBlockExporter} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onExportText(this: StatBlockExporter, event: PointerEvent, target: HTMLElement): void {
        if (this.#actor === null) return;
        const content = StatBlockExporter.toText(this.#actor);
        const filename = `${this.#actor.name.slugify()}.txt`;

        StatBlockExporter._downloadFile(content, filename, 'text/plain');
        ui.notifications.info(game.i18n.format('WH40K.NPC.Export.Downloaded', { filename }));
    }

    /**
     * Close the dialog.
     * @param {StatBlockExporter} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onClose(this: StatBlockExporter, event: PointerEvent, target: HTMLElement): Promise<void> {
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Download a file.
     * @param {string} content - File content.
     * @param {string} filename - File name.
     * @param {string} mimeType - MIME type.
     * @private
     */
    static _downloadFile(content: string, filename: string, mimeType: string): void {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Open the exporter for an actor.
     * @param {WH40KBaseActor} actor - The actor to export.
     * @returns {StatBlockExporter} The exporter instance.
     */
    static show(actor: WH40KBaseActor): StatBlockExporter {
        const exporter = new this(actor);
        void exporter.render(true);
        return exporter;
    }

    /**
     * Quick export to clipboard without dialog.
     * @param {WH40KBaseActor} actor - The actor to export.
     * @param {'text' | 'json'} [format="text"] - Export format ("text" or "json").
     * @returns {Promise<void>}
     */
    static async quickExport(actor: WH40KBaseActor, format: 'text' | 'json' = 'text'): Promise<void> {
        const content = format === 'json' ? this.toJSON(actor) : this.toText(actor);

        try {
            await navigator.clipboard.writeText(content);
            ui.notifications.info(game.i18n.localize('WH40K.NPC.Export.CopiedToClipboard'));
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            ui.notifications.error(game.i18n.localize('WH40K.NPC.Export.CopyFailed'));
        }
    }
}
