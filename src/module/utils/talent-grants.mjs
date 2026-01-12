/**
 * Talent Grants System
 * 
 * Handles automatic granting of abilities (talents, skills, traits) when a talent is acquired.
 * Talents can define `grants` structure that specifies what they automatically provide.
 */

/**
 * Process grants from a newly added talent.
 * Automatically creates granted items and applies skill training.
 * 
 * @param {RogueTraderItem} talent - The talent item that was added
 * @param {RogueTraderActor} actor - The actor receiving the talent
 * @returns {Promise<void>}
 */
export async function processTalentGrants(talent, actor) {
    if (!talent || talent.type !== 'talent') return;
    if (!actor) return;
    
    const grants = talent.system?.grants;
    if (!grants) return;
    
    // Check if this talent grants anything
    if (!talent.system.hasGrants) return;
    
    game.rt.log(`Processing grants from talent: ${talent.name}`, grants);
    
    const grantedItems = [];
    const skillUpdates = {};
    const notifications = [];
    
    // Process talent grants
    for (const talentGrant of grants.talents || []) {
        const granted = await grantTalent(actor, talentGrant, talent);
        if (granted) {
            grantedItems.push(granted);
            notifications.push(`Talent: ${granted.name}`);
        }
    }
    
    // Process skill grants
    for (const skillGrant of grants.skills || []) {
        const updated = await grantSkill(actor, skillGrant, skillUpdates);
        if (updated) {
            notifications.push(`Skill: ${skillGrant.name} (${skillGrant.level})`);
        }
    }
    
    // Process trait grants
    for (const traitGrant of grants.traits || []) {
        const granted = await grantTrait(actor, traitGrant, talent);
        if (granted) {
            grantedItems.push(granted);
            notifications.push(`Trait: ${granted.name}`);
        }
    }
    
    // Apply skill updates
    if (Object.keys(skillUpdates).length > 0) {
        await actor.update(skillUpdates);
    }
    
    // Show notification if anything was granted
    if (notifications.length > 0) {
        const message = `<strong>${talent.name}</strong> granted:<br/>• ${notifications.join('<br/>• ')}`;
        ui.notifications.info(message, { permanent: false });
    }
}

/**
 * Grant a talent to an actor.
 * Checks for duplicates and loads from compendium.
 * 
 * @param {RogueTraderActor} actor - The actor receiving the talent
 * @param {object} talentGrant - The grant definition { name, specialization?, uuid? }
 * @param {RogueTraderItem} sourceTalent - The talent that is granting this
 * @returns {Promise<RogueTraderItem|null>} The granted item or null if already exists
 */
async function grantTalent(actor, talentGrant, sourceTalent) {
    // Check if actor already has this talent
    const existing = actor.items.find(i => 
        i.type === 'talent' && 
        i.name === talentGrant.name &&
        (!talentGrant.specialization || i.system.specialization === talentGrant.specialization)
    );
    
    if (existing) {
        game.rt.log(`Talent ${talentGrant.name} already exists, skipping grant`);
        return null;
    }
    
    // Load talent from compendium
    let talentItem;
    if (talentGrant.uuid) {
        try {
            talentItem = await fromUuid(talentGrant.uuid);
        } catch (err) {
            console.warn(`Could not load talent from UUID: ${talentGrant.uuid}`, err);
        }
    }
    
    // Fallback: search compendium by name
    if (!talentItem) {
        const pack = game.packs.get('rogue-trader.rt-items-talents');
        if (pack) {
            const index = await pack.getIndex({ fields: ['name'] });
            const entry = index.find(i => i.name === talentGrant.name);
            if (entry) {
                talentItem = await pack.getDocument(entry._id);
            }
        }
    }
    
    if (!talentItem) {
        ui.notifications.warn(`Could not find talent: ${talentGrant.name}`);
        return null;
    }
    
    // Clone and apply specialization if needed
    const itemData = talentItem.toObject();
    if (talentGrant.specialization) {
        itemData.system.specialization = talentGrant.specialization;
        itemData.name = `${itemData.name} (${talentGrant.specialization})`;
    }
    
    // Mark as granted with flags
    itemData.flags = itemData.flags || {};
    itemData.flags['rogue-trader'] = itemData.flags['rogue-trader'] || {};
    itemData.flags['rogue-trader'].grantedBy = sourceTalent.name;
    itemData.flags['rogue-trader'].grantedById = sourceTalent.id;
    itemData.flags['rogue-trader'].autoGranted = true;
    
    // Add to actor
    const [created] = await actor.createEmbeddedDocuments('Item', [itemData]);
    
    game.rt.log(`Granted talent: ${created.name}`);
    return created;
}

/**
 * Grant a skill training level to an actor.
 * Updates actor's skill data directly.
 * 
 * @param {RogueTraderActor} actor - The actor receiving the skill
 * @param {object} skillGrant - The grant definition { name, specialization?, level }
 * @param {object} updateData - Accumulator object for batch updates
 * @returns {Promise<boolean>} True if skill was updated
 */
async function grantSkill(actor, skillGrant, updateData) {
    // Convert skill name to key (lowercase, remove spaces)
    const skillKey = skillGrant.name.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
    const skill = actor.system.skills?.[skillKey];
    
    if (!skill) {
        // Check if this is a specialist skill
        const specialistSkills = ['commonLore', 'forbiddenLore', 'scholasticLore', 'speakLanguage', 
                                  'secretTongue', 'trade', 'pilot', 'drive', 'performer'];
        
        const isSpecialist = specialistSkills.includes(skillKey);
        
        if (isSpecialist && skillGrant.specialization) {
            // For specialist skills, add an entry
            const entries = actor.system.skills[skillKey]?.entries || [];
            const existingEntry = entries.find(e => e.name === skillGrant.specialization);
            
            if (existingEntry) {
                game.rt.log(`Specialist skill ${skillGrant.name} (${skillGrant.specialization}) already exists`);
                return false;
            }
            
            // Create new entry
            const newEntry = {
                name: skillGrant.specialization,
                trained: true,
                plus10: skillGrant.level === 'plus10' || skillGrant.level === 'plus20',
                plus20: skillGrant.level === 'plus20'
            };
            
            const entriesPath = `system.skills.${skillKey}.entries`;
            updateData[entriesPath] = [...entries, newEntry];
            
            game.rt.log(`Granted specialist skill: ${skillGrant.name} (${skillGrant.specialization})`);
            return true;
        } else {
            ui.notifications.warn(`Unknown skill: ${skillGrant.name}`);
            return false;
        }
    }
    
    // Check if skill is already at or above the grant level
    const currentLevel = skill.plus20 ? 'plus20' : (skill.plus10 ? 'plus10' : (skill.trained ? 'trained' : 'untrained'));
    const levels = ['untrained', 'trained', 'plus10', 'plus20'];
    const currentLevelIndex = levels.indexOf(currentLevel);
    const grantLevelIndex = levels.indexOf(skillGrant.level);
    
    if (currentLevelIndex >= grantLevelIndex) {
        game.rt.log(`Skill ${skillGrant.name} already at or above ${skillGrant.level}, skipping`);
        return false;
    }
    
    // Apply the skill training level
    if (skillGrant.level === 'trained' || skillGrant.level === 'plus10' || skillGrant.level === 'plus20') {
        updateData[`system.skills.${skillKey}.trained`] = true;
    }
    if (skillGrant.level === 'plus10' || skillGrant.level === 'plus20') {
        updateData[`system.skills.${skillKey}.plus10`] = true;
    }
    if (skillGrant.level === 'plus20') {
        updateData[`system.skills.${skillKey}.plus20`] = true;
    }
    
    game.rt.log(`Granted skill: ${skillGrant.name} (${skillGrant.level})`);
    return true;
}

/**
 * Grant a trait to an actor.
 * Checks for duplicates and loads from compendium.
 * 
 * @param {RogueTraderActor} actor - The actor receiving the trait
 * @param {object} traitGrant - The grant definition { name, level?, uuid? }
 * @param {RogueTraderItem} sourceTalent - The talent that is granting this
 * @returns {Promise<RogueTraderItem|null>} The granted item or null if already exists
 */
async function grantTrait(actor, traitGrant, sourceTalent) {
    // Check if actor already has this trait
    const existing = actor.items.find(i => 
        i.type === 'trait' && 
        i.name === traitGrant.name
    );
    
    if (existing) {
        // If trait is stackable and has a level, we might increase it
        if (existing.system.stackable && traitGrant.level != null) {
            const newLevel = (existing.system.level || 1) + (traitGrant.level || 1);
            await existing.update({ 'system.level': newLevel });
            game.rt.log(`Increased trait ${traitGrant.name} level to ${newLevel}`);
            return existing;
        }
        
        game.rt.log(`Trait ${traitGrant.name} already exists, skipping grant`);
        return null;
    }
    
    // Load trait from compendium
    let traitItem;
    if (traitGrant.uuid) {
        try {
            traitItem = await fromUuid(traitGrant.uuid);
        } catch (err) {
            console.warn(`Could not load trait from UUID: ${traitGrant.uuid}`, err);
        }
    }
    
    // Fallback: search compendium by name
    if (!traitItem) {
        const pack = game.packs.get('rogue-trader.rt-items-traits');
        if (pack) {
            const index = await pack.getIndex({ fields: ['name'] });
            const entry = index.find(i => i.name === traitGrant.name);
            if (entry) {
                traitItem = await pack.getDocument(entry._id);
            }
        }
    }
    
    if (!traitItem) {
        ui.notifications.warn(`Could not find trait: ${traitGrant.name}`);
        return null;
    }
    
    // Clone and apply level if specified
    const itemData = traitItem.toObject();
    if (traitGrant.level != null) {
        itemData.system.level = traitGrant.level;
    }
    
    // Mark as granted with flags
    itemData.flags = itemData.flags || {};
    itemData.flags['rogue-trader'] = itemData.flags['rogue-trader'] || {};
    itemData.flags['rogue-trader'].grantedBy = sourceTalent.name;
    itemData.flags['rogue-trader'].grantedById = sourceTalent.id;
    itemData.flags['rogue-trader'].autoGranted = true;
    
    // Add to actor
    const [created] = await actor.createEmbeddedDocuments('Item', [itemData]);
    
    game.rt.log(`Granted trait: ${created.name}`);
    return created;
}

/**
 * Handle removal of a talent that granted other items.
 * Optionally removes granted items if user confirms.
 * 
 * @param {RogueTraderItem} talent - The talent being removed
 * @param {RogueTraderActor} actor - The actor losing the talent
 * @returns {Promise<void>}
 */
export async function handleTalentRemoval(talent, actor) {
    if (!talent || talent.type !== 'talent') return;
    if (!actor) return;
    if (!talent.system.hasGrants) return;
    
    // Find all items granted by this talent
    const grantedItems = actor.items.filter(i => 
        i.flags['rogue-trader']?.grantedById === talent.id
    );
    
    if (grantedItems.length === 0) return;
    
    // Ask user if they want to remove granted items
    const itemNames = grantedItems.map(i => i.name).join(', ');
    const content = `
        <p><strong>${talent.name}</strong> granted the following abilities:</p>
        <p style="margin-left: 1em; color: #c9a227;">${itemNames}</p>
        <p>Do you want to remove these granted abilities as well?</p>
    `;
    
    const remove = await Dialog.confirm({
        title: 'Remove Granted Abilities?',
        content: content,
        yes: () => true,
        no: () => false,
        defaultYes: false
    });
    
    if (remove) {
        const ids = grantedItems.map(i => i.id);
        await actor.deleteEmbeddedDocuments('Item', ids);
        
        ui.notifications.info(`Removed ${grantedItems.length} granted abilities from ${talent.name}`);
    }
}
