/**
 * @gulpfile.js EncounterBuilder - Plan and manage combat encounters
 * Phase 6: Advanced GM Tools
 *
 * Provides:
 * - Drag NPCs from compendium/world
 * - Calculate total threat rating
 * - Encounter difficulty assessment
 * - Save/load encounter templates
 * - Deploy NPCs to combat tracker
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface NPC {
    uuid: string;
    name: string;
    img: string;
    threat: number;
    count: number;
}

interface PartyConfig {
    count: number;
    averageLevel: number;
}

interface Template {
    name: string;
    npcs: NPC[];
    party: PartyConfig;
    savedAt: number;
}

/**
 * Application for building and managing combat encounters.
 * @extends {ApplicationV2}
 */
export default class EncounterBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static DEFAULT_OPTIONS = {
        id: 'encounter-builder',
        classes: ['wh40k-rpg', 'encounter-builder'],
        tag: 'div',
        window: {
            title: 'WH40K.NPC.Encounter.Title',
            icon: 'fa-solid fa-swords',
            minimizable: true,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 800,
            height: 650,
        },
        actions: {
            addNPC: EncounterBuilder.#addNPC,
            removeNPC: EncounterBuilder.#removeNPC,
            adjustCount: EncounterBuilder.#adjustCount,
            clearAll: EncounterBuilder.#clearAll,
            saveTemplate: EncounterBuilder.#saveTemplate,
            loadTemplate: EncounterBuilder.#loadTemplate,
            deployToCombat: EncounterBuilder.#deployToCombat,
            openNPC: EncounterBuilder.#openNPC,
        },
    };

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/apps/encounter-builder.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Difficulty Thresholds                       */
    /* -------------------------------------------- */

    /**
     * Difficulty ratings based on threat ratio.
     * Ratio = total enemy threat / party threat
     * @scripts/gen-i18n-types.mjs {Object}
     */
    static DIFFICULTY_RATINGS = {
        trivial: { maxRatio: 0.5, label: 'WH40K.Threat.Trivial', color: '#4ade80' },
        easy: { maxRatio: 0.8, label: 'WH40K.Threat.Low', color: '#84cc16' },
        moderate: { maxRatio: 1.2, label: 'WH40K.Threat.Moderate', color: '#facc15' },
        dangerous: { maxRatio: 1.6, label: 'WH40K.Threat.Dangerous', color: '#fb923c' },
        deadly: { maxRatio: 2.0, label: 'WH40K.Threat.Deadly', color: '#ef4444' },
        apocalyptic: { maxRatio: Infinity, label: 'WH40K.Threat.Apocalyptic', color: '#991b1b' },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * NPCs in the current encounter.
     * @scripts/gen-i18n-types.mjs {NPC[]}
     */
    #npcs: NPC[] = [];

    /**
     * Party configuration.
     * @scripts/gen-i18n-types.mjs {PartyConfig}
     */
    #party: PartyConfig = {
        count: 4,
        averageLevel: 5,
    };

    /**
     * Saved templates.
     * @scripts/gen-i18n-types.mjs {Template[]}
     */
    #templates: Template[] = [];

    /* -------------------------------------------- */
    /*  Singleton Pattern                           */
    /* -------------------------------------------- */

    /**
     * Singleton instance.
     * @scripts/gen-i18n-types.mjs {EncounterBuilder|null}
     */
    static #instance: EncounterBuilder | null = null;

    /**
     * Get or create the singleton instance.
     * @returns {EncounterBuilder}
     */
    static get instance(): EncounterBuilder {
        if (!this.#instance) {
            this.#instance = new this();
        }
        return this.#instance;
    }

    /**
     * Show the encounter builder.
     * @returns {EncounterBuilder}
     */
    static show(): EncounterBuilder {
        const instance = this.instance;
        void instance.render(true);
        return instance;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Calculate encounter metrics
        const totalThreat = this.#npcs.reduce((sum, npc) => sum + npc.threat * npc.count, 0);
        const totalNPCs = this.#npcs.reduce((sum, npc) => sum + npc.count, 0);

        // Calculate party threat (simplified: party count * average level * 2)
        const partyThreat = this.#party.count * this.#party.averageLevel * 2;

        // Determine difficulty
        const ratio = partyThreat > 0 ? totalThreat / partyThreat : 0;
        const difficulty = this._getDifficulty(ratio);

        // Prepare NPC list with expanded details
        const npcList = await Promise.all(
            this.#npcs.map((npc, index) => {
                return {
                    ...npc,
                    index,
                    totalThreat: npc.threat * npc.count,
                    threatPercent: totalThreat > 0 ? Math.round(((npc.threat * npc.count) / totalThreat) * 100) : 0,
                };
            }),
        );

        return {
            ...context,

            // NPC list
            npcs: npcList,
            hasNPCs: npcList.length > 0,

            // Party settings
            party: this.#party,

            // Encounter metrics
            totalThreat,
            totalNPCs,
            partyThreat,

            // Difficulty
            difficulty,
            difficultyLabel: game.i18n.localize(difficulty.label as string),
            difficultyColor: difficulty.color,
            threatRatio: ratio.toFixed(1),

            // Action economy
            actionEconomy: {
                partyActions: this.#party.count,
                enemyActions: totalNPCs,
                advantage: this._getActionAdvantage(this.#party.count, totalNPCs),
            },

            // Saved templates
            templates: this.#templates,
            hasTemplates: this.#templates.length > 0,

            // Combat availability
            hasCombat: game.combat !== null,
        };
    }

    /** @foundry-v14-overrides.d.ts */
    override _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        void super._onRender(context, options);

        // Party configuration inputs
        const partyCount = this.element.querySelector('[name="partyCount"]') as HTMLInputElement;
        const partyLevel = this.element.querySelector('[name="partyLevel"]') as HTMLInputElement;

        if (partyCount) {
            partyCount.addEventListener('change', (e: Event) => {
                this.#party.count = parseInt((e.target as HTMLInputElement).value, 10) || 4;
                void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
            });
        }

        if (partyLevel) {
            partyLevel.addEventListener('change', (e: Event) => {
                this.#party.averageLevel = parseInt((e.target as HTMLInputElement).value, 10) || 5;
                void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
            });
        }

        // Set up drop zone for NPCs
        this._setupDropZone();
    }

    /**
     * Set up drop zone for dragging NPCs.
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _setupDropZone(): void {
        const dropZone = this.element.querySelector('.encounter-drop-zone');
        if (!dropZone) return;

        dropZone.addEventListener('dragover', (e: DragEvent) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (_e: DragEvent) => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e: DragEvent) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            if (!e.dataTransfer) return;
            const dataTransfer = e.dataTransfer;

            void (async () => {
                try {
                    const data = JSON.parse(dataTransfer.getData('text/plain'));

                    if (data.type === 'Actor') {
                        await this._handleActorDrop(data as Record<string, unknown>);
                    }
                } catch (err) {
                    console.error('Failed to handle drop:', err);
                }
            })();
        });
    }

    /**
     * Handle actor drop.
     * @param {Object} data - Drop data.
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    async _handleActorDrop(data: Record<string, unknown>): Promise<void> {
        let actor: Record<string, unknown> | null = null;

        if (data.uuid) {
            actor = await (fromUuid as any)(data.uuid as string) as Record<string, unknown> | null;
        } else if (data.id) {
            actor = (game as any).actors.get(data.id as string) as Record<string, unknown> | null;
        }

        if (!actor) {
            ui.notifications.warn('Could not find the dropped actor.');
            return;
        }

        // Only allow NPC types
        if (actor.type !== 'npc' && actor.type !== 'npcV2') {
            ui.notifications.warn('Only NPC actors can be added to encounters.');
            return;
        }

        // Check if already in list
        const existing = this.#npcs.find((n) => n.uuid === (actor as Record<string, unknown>).uuid as string);
        if (existing) {
            existing.count++;
        } else {
            this.#npcs.push({
                uuid: actor.uuid as string,
                name: actor.name as string,
                img: (actor.img as string) || 'icons/svg/mystery-man.svg',
                threat: (actor.system as Record<string, unknown>)?.threatLevel as number || 5,
                count: 1,
            });
        }

        void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
    }

    /* -------------------------------------------- */
    /*  Difficulty Calculation                      */
    /* -------------------------------------------- */

    /**
     * Get difficulty rating for a threat ratio.
     * @param {number} ratio - Threat ratio.
     * @returns {Object} Difficulty rating.
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _getDifficulty(ratio: number): Record<string, unknown> {
        for (const [key, rating] of Object.entries(EncounterBuilder.DIFFICULTY_RATINGS)) {
            if (ratio <= rating.maxRatio) {
                return { key, ...rating };
            }
        }
        return { key: 'apocalyptic', ...EncounterBuilder.DIFFICULTY_RATINGS.apocalyptic };
    }

    /**
     * Get action economy advantage text.
     * @param {number} partyActions - Party action count.
     * @param {number} enemyActions - Enemy action count.
     * @returns {Object} Advantage info.
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _getActionAdvantage(partyActions: number, enemyActions: number): Record<string, unknown> {
        const diff = enemyActions - partyActions;

        if (diff <= -2) return { text: game.i18n.localize('WH40K.NPC.Encounter.PartyAdvantage'), color: '#4ade80' };
        if (diff <= 0) return { text: game.i18n.localize('WH40K.NPC.Encounter.Balanced'), color: '#facc15' };
        if (diff <= 2) return { text: game.i18n.localize('WH40K.NPC.Encounter.EnemyAdvantage'), color: '#fb923c' };
        return { text: game.i18n.localize('WH40K.NPC.Encounter.EnemyOverwhelming'), color: '#ef4444' };
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Add an NPC via selector.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #addNPC(this: EncounterBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        // Show a simple actor picker
        const actors = (game as any).actors.filter((a: { type: string }) => a.type === 'npc' || a.type === 'npcV2');

        if (actors.length === 0) {
            ui.notifications.warn('No NPC actors found in the world.');
            return;
        }

        const options = actors.map((a: { uuid: string; name: string }) => `<option value="${a.uuid}">${a.name}</option>`).join('');

        const content = `
      <form>
        <div class="form-group">
          <label>Select NPC</label>
          <select name="uuid">${options}</select>
        </div>
        <div class="form-group">
          <label>Count</label>
          <input type="number" name="count" value="1" min="1" max="20"/>
        </div>
      </form>
    `;

        const result = await (Dialog as any).prompt({
            title: 'Add NPC',
            content,
            label: 'Add',
            callback: (html: HTMLElement) => {
                const form = (html as unknown as HTMLElement[])[0].querySelector('form');
                if (!form) return null;
                return {
                    uuid: (form.querySelector('[name="uuid"]') as HTMLSelectElement).value,
                    count: parseInt((form.querySelector('[name="count"]') as HTMLInputElement).value, 10) || 1,
                };
            },
            rejectClose: false,
        }) as { uuid: string, count: number } | null;

        if (!result) return;

        const actor = await (fromUuid as any)(result.uuid) as Record<string, unknown> | null;
        if (!actor) return;

        const existing = this.#npcs.find((n: { uuid: string }) => n.uuid === result.uuid);
        if (existing) {
            existing.count += result.count;
        } else {
            this.#npcs.push({
                uuid: result.uuid,
                name: actor.name as string,
                img: (actor.img as string) || 'icons/svg/mystery-man.svg',
                threat: (actor.system as Record<string, unknown>)?.threatLevel as number || 5,
                count: result.count,
            });
        }

        void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
    }

    /**
     * Remove an NPC from the encounter.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #removeNPC(this: EncounterBuilder, _event: Event, target: HTMLElement): void {
        const index = parseInt(target.dataset.index as string, 10);
        if (isNaN(index) || index < 0 || index >= this.#npcs.length) return;

        this.#npcs.splice(index, 1);
        void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
    }

    /**
     * Adjust NPC count.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #adjustCount(this: EncounterBuilder, _event: Event, target: HTMLElement): void {
        const index = parseInt(target.dataset.index as string, 10);
        const delta = parseInt(target.dataset.delta as string, 10);

        if (isNaN(index) || isNaN(delta)) return;

        const npc = this.#npcs[index];
        if (!npc) return;

        npc.count = Math.max(1, Math.min(20, npc.count + delta));
        void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
    }

    /**
     * Clear all NPCs.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #clearAll(this: EncounterBuilder, _event: Event, _target: HTMLElement): void {
        this.#npcs = [];
        void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
    }

    /**
     * Save current encounter as template.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #saveTemplate(this: EncounterBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        if (this.#npcs.length === 0) {
            ui.notifications.warn('No NPCs to save.');
            return;
        }

        const name = await (Dialog as any).prompt({
            title: 'Save Encounter Template',
            content: '<form><div class="form-group"><label>Template Name</label><input type="text" name="name" placeholder="My Encounter"/></div></form>',
            label: 'Save',
            callback: (html: HTMLElement) => {
                const input = (html as unknown as HTMLElement[])[0].querySelector('[name="name"]') as HTMLInputElement;
                return input?.value;
            },
            rejectClose: false,
        }) as string | null;

        if (!name) return;

        this.#templates.push({
            name,
            npcs: foundry.utils.deepClone(this.#npcs),
            party: foundry.utils.deepClone(this.#party),
            savedAt: Date.now(),
        });

        ui.notifications.info(`Saved encounter template: ${name}`);
        void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
    }

    /**
     * Load a saved template.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #loadTemplate(this: EncounterBuilder, _event: Event, target: HTMLElement): void {
        const index = parseInt(target.dataset.index as string, 10);
        if (isNaN(index) || index < 0 || index >= this.#templates.length) return;

        const template = this.#templates[index];
        this.#npcs = foundry.utils.deepClone(template.npcs);
        if (template.party) {
            this.#party = foundry.utils.deepClone(template.party);
        }

        ui.notifications.info(`Loaded encounter: ${template.name}`);
        void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
    }

    /**
     * Deploy NPCs to combat tracker.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #deployToCombat(this: EncounterBuilder, _event: Event, _target: HTMLElement): Promise<void> {
        if (this.#npcs.length === 0) {
            ui.notifications.warn('No NPCs to deploy.');
            return;
        }

        // Ensure combat exists
        let combat = game.combat;
        if (!combat) {
            combat = await (Combat as any).create({ scene: (game as any).scenes.active?.id } as Record<string, unknown>);
        }

        if (!combat) {
            ui.notifications.error('Could not create or find active combat.');
            return;
        }

        const combatants: Record<string, unknown>[] = [];

        for (const npcEntry of this.#npcs) {
            const actor = await (fromUuid as any)(npcEntry.uuid) as Record<string, unknown> | null;
            if (!actor) continue;

            for (let i = 0; i < npcEntry.count; i++) {
                // Create token data (side-effect: validates token document)
                if (typeof (actor as any).getTokenDocument === 'function') {
                    await (actor as any).getTokenDocument({
                        name: npcEntry.count > 1 ? `${actor.name as string} ${i + 1}` : actor.name as string,
                    });
                }

                combatants.push({
                    actorId: actor.id as string,
                    tokenId: null, // No token placed
                    name: npcEntry.count > 1 ? `${actor.name as string} ${i + 1}` : actor.name as string,
                    img: actor.img as string,
                });
            }
        }

        await (combat as any).createEmbeddedDocuments('Combatant', combatants);

        ui.notifications.info(game.i18n.format('WH40K.NPC.Encounter.Deployed', { count: String(combatants.length) }));
    }

    /**
     * Open NPC sheet.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #openNPC(this: EncounterBuilder, _event: Event, target: HTMLElement): Promise<void> {
        const uuid = target.dataset.uuid;
        if (!uuid) return;

        const actor = await (fromUuid as any)(uuid) as Record<string, unknown> | null;
        if (actor && (actor.sheet as Record<string, unknown>)) {
            (actor.sheet as any).render(true);
        }
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Add an NPC to the encounter programmatically.
     * @param {Actor|string} actorOrUuid - Actor or UUID.
     * @param {number} [count=1] - Number to add.
     */
    async addNPC(actorOrUuid: unknown, count: number = 1): Promise<void> {
        let actor: Record<string, unknown> | null = null;
        let uuid: string | null = null;

        if (typeof actorOrUuid === 'string') {
            uuid = actorOrUuid;
            actor = await (fromUuid as any)(uuid) as Record<string, unknown> | null;
        } else {
            actor = actorOrUuid as Record<string, unknown>;
            uuid = actor.uuid as string;
        }

        if (!actor || !uuid) return;

        const existing = this.#npcs.find((n: { uuid: string }) => n.uuid === uuid);
        if (existing) {
            existing.count += count;
        } else {
            this.#npcs.push({
                uuid,
                name: actor.name as string,
                img: (actor.img as string) || 'icons/svg/mystery-man.svg',
                threat: (actor.system as Record<string, unknown>)?.threatLevel as number || 5,
                count,
            });
        }

        if (this.isRendered) {
            void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
        }
    }

    /**
     * Set party configuration.
     * @param {number} count - Number of party members.
     * @param {number} averageLevel - Average party level/threat.
     */
    setParty(count: number, averageLevel: number): void {
        this.#party.count = count;
        this.#party.averageLevel = averageLevel;

        if (this.isRendered) {
            void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
        }
    }

    /**
     * Get current encounter data.
     * @returns {Object} Encounter data.
     */
    getData(): Record<string, unknown> {
        return {
            npcs: foundry.utils.deepClone(this.#npcs),
            party: foundry.utils.deepClone(this.#party),
            templates: foundry.utils.deepClone(this.#templates),
        };
    }

    /**
     * Clear the encounter.
     */
    clear(): void {
        this.#npcs = [];
        if (this.isRendered) {
            void this.render({ parts: ['content'] } as ApplicationV2Config.RenderOptions);
        }
    }
}
