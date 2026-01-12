/**
 * Migration Script: Convert Legacy Origin Path Items
 * 
 * Transforms 57 origin path items from legacy "trait" type with flags.rt
 * to modern "originPath" type with structured OriginPathData.
 * 
 * Run with: node scripts/migrate-origin-paths.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_SOURCE = path.join(__dirname, '../src/packs/rt-items-origin-path/_source');

// Step mapping from old flags to new schema
const STEP_MAPPING = {
    'Home World': 'homeWorld',
    'Birthright': 'birthright',
    'Lure of the Void': 'lureOfTheVoid',
    'Trials and Travails': 'trialsAndTravails',
    'Motivation': 'motivation',
    'Career': 'career'
};

/**
 * Parse description text to extract grants using regex patterns
 */
function parseDescriptionForGrants(description) {
    const grants = {
        wounds: 0,
        fateThreshold: 0,
        blessedByEmperor: false,
        skills: [],
        talents: [],
        traits: [],
        aptitudes: [],
        equipment: [],
        specialAbilities: [],
        choices: []
    };

    if (!description) return grants;

    // Extract wounds bonus
    const woundsMatch = description.match(/([+-]\d+)\s*Wounds?/i);
    if (woundsMatch) {
        grants.wounds = parseInt(woundsMatch[1]);
    }

    // Extract fate threshold
    const fateMatch = description.match(/Fate(?:\s*Threshold)?:?\s*([+-]?\d+)/i);
    if (fateMatch) {
        grants.fateThreshold = parseInt(fateMatch[1]);
    }

    // Check for "Blessed by the Emperor"
    if (/Blessed by the Emperor/i.test(description)) {
        grants.blessedByEmperor = true;
    }

    // Extract skills - pattern: "Gain X Skill" or "Skills: X, Y, Z"
    const skillPatterns = [
        /(?:Gain|Skills?:)\s*([^.]+?)(?:Skill|Talent|\.|$)/gi,
        /Training\s*\(([^)]+)\)/gi
    ];

    for (const pattern of skillPatterns) {
        let match;
        while ((match = pattern.exec(description)) !== null) {
            const skillText = match[1];
            // Split by commas and "and"
            const skillNames = skillText.split(/[,;]|\s+and\s+/i);
            for (const skillName of skillNames) {
                const cleanName = skillName.trim();
                if (cleanName && cleanName.length > 2 && cleanName.length < 50) {
                    // Check for +10 or +20
                    let level = 'trained';
                    if (/\+20/i.test(cleanName)) level = 'plus20';
                    else if (/\+10/i.test(cleanName)) level = 'plus10';

                    const name = cleanName.replace(/\s*\+\d+/g, '').trim();
                    if (name && !grants.skills.some(s => s.name === name)) {
                        grants.skills.push({ name, specialization: '', level });
                    }
                }
            }
        }
    }

    // Extract talents - pattern: "Talent: X" or mentions of specific talents
    const talentPattern = /(?:Talent|Talents?:)\s*([^.]+?)(?:Skill|Trait|\.|$)/gi;
    let talentMatch;
    while ((talentMatch = talentPattern.exec(description)) !== null) {
        const talentText = talentMatch[1];
        const talentNames = talentText.split(/[,;]|\s+and\s+/i);
        for (const talentName of talentNames) {
            const cleanName = talentName.trim();
            if (cleanName && cleanName.length > 2 && cleanName.length < 50) {
                // Extract specialization if present
                const specMatch = cleanName.match(/(.+?)\s*\(([^)]+)\)/);
                if (specMatch) {
                    grants.talents.push({
                        name: specMatch[1].trim(),
                        specialization: specMatch[2].trim(),
                        uuid: ''
                    });
                } else {
                    grants.talents.push({
                        name: cleanName,
                        specialization: '',
                        uuid: ''
                    });
                }
            }
        }
    }

    // Extract traits
    const traitPattern = /(?:Trait|Traits?:)\s*([^.]+?)(?:Skill|Talent|\.|$)/gi;
    let traitMatch;
    while ((traitMatch = traitPattern.exec(description)) !== null) {
        const traitText = traitMatch[1];
        const traitNames = traitText.split(/[,;]|\s+and\s+/i);
        for (const traitName of traitNames) {
            const cleanName = traitName.trim();
            if (cleanName && cleanName.length > 2 && cleanName.length < 50) {
                // Extract level if present
                const levelMatch = cleanName.match(/(.+?)\s*\((\d+)\)/);
                if (levelMatch) {
                    grants.traits.push({
                        name: levelMatch[1].trim(),
                        level: parseInt(levelMatch[2]),
                        uuid: ''
                    });
                } else {
                    grants.traits.push({
                        name: cleanName,
                        level: null,
                        uuid: ''
                    });
                }
            }
        }
    }

    // Extract choices - pattern: "Choose one:" or "either X or Y"
    const choicePatterns = [
        /(?:Choose|Select)\s+(?:one|1|any)\s*(?:of)?[:\s]*([^.]+)/gi,
        /either\s+([^.]+?)\s+or\s+([^.]+)/gi
    ];

    for (const pattern of choicePatterns) {
        let match;
        while ((match = pattern.exec(description)) !== null) {
            const optionsText = match[1] + (match[2] ? ` or ${match[2]}` : '');
            const options = optionsText.split(/\s+or\s+|,\s+/i).map(o => o.trim()).filter(o => o.length > 0);
            
            if (options.length > 1) {
                // Determine type based on content
                let type = 'talent';  // default
                if (options.some(o => /skill/i.test(o))) type = 'skill';
                else if (options.some(o => /weapon|armour|equipment|gun|pistol/i.test(o))) type = 'equipment';

                grants.choices.push({
                    type,
                    label: `Choose from: ${options.join(', ')}`,
                    options,
                    count: 1
                });
            }
        }
    }

    // Extract special abilities (passive effects noted separately)
    const specialAbilityPattern = /(?:Special Ability|Special|Ability)[:\s]*([^.]+\.[^.]*)/gi;
    let abilityMatch;
    while ((abilityMatch = specialAbilityPattern.exec(description)) !== null) {
        const abilityText = abilityMatch[1].trim();
        if (abilityText.length > 10) {
            grants.specialAbilities.push({
                name: 'Special Ability',
                description: abilityText
            });
        }
    }

    return grants;
}

/**
 * Convert a single legacy item to new format
 */
function convertItem(item) {
    const flags = item.flags?.rt || {};
    const oldStep = flags.step || 'Home World';
    const stepKey = STEP_MAPPING[oldStep] || 'homeWorld';
    const stepIndex = parseInt(flags.stepIndex || 0);

    // Parse description for grants
    const description = item.system?.description?.value || item.system?.descriptionText || '';
    const grants = parseDescriptionForGrants(description);

    // Get modifiers from existing system
    const modifiers = item.system?.modifiers || {
        characteristics: {},
        skills: {},
        combat: {},
        wounds: 0,
        fate: 0,
        movement: 0
    };

    // Create new item structure
    const newItem = {
        name: item.name,
        type: 'originPath',
        img: item.img || 'icons/svg/mystery-man.svg',
        system: {
            identifier: item.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            step: stepKey,
            stepIndex: stepIndex,
            description: {
                value: description
            },
            requirements: {
                text: item.system?.requirements || '',
                previousSteps: [],
                excludedSteps: []
            },
            modifiers: modifiers,
            grants: grants,
            effectText: item.system?.effects || '',
            notes: '',
            selectedChoices: {},
            activeModifiers: []
        },
        effects: item.effects || [],
        flags: {},
        _id: item._id
    };

    return newItem;
}

/**
 * Main migration function
 */
async function migrateOriginPaths() {
    console.log('🚀 Starting Origin Path Migration...\n');

    const files = fs.readdirSync(PACK_SOURCE).filter(f => f.endsWith('.json'));
    console.log(`Found ${files.length} items to migrate\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
        try {
            const filePath = path.join(PACK_SOURCE, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const item = JSON.parse(content);

            // Skip if already originPath type
            if (item.type === 'originPath') {
                console.log(`⏭️  Skipping ${item.name} (already migrated)`);
                continue;
            }

            // Skip if not an origin path trait
            if (item.type !== 'trait' || !item.flags?.rt?.kind === 'origin') {
                console.log(`⏭️  Skipping ${item.name} (not an origin path)`);
                continue;
            }

            console.log(`✏️  Migrating: ${item.name} (${item.flags.rt.step})`);

            const newItem = convertItem(item);

            // Write back to file
            fs.writeFileSync(filePath, JSON.stringify(newItem, null, 2), 'utf8');

            console.log(`✅ Migrated: ${item.name}`);
            console.log(`   Step: ${newItem.system.step} (index ${newItem.system.stepIndex})`);
            console.log(`   Skills: ${newItem.system.grants.skills.length}`);
            console.log(`   Talents: ${newItem.system.grants.talents.length}`);
            console.log(`   Choices: ${newItem.system.grants.choices.length}`);
            console.log('');

            successCount++;

        } catch (error) {
            console.error(`❌ Error migrating ${file}:`, error.message);
            errorCount++;
        }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📁 Total: ${files.length}`);
    console.log('\n✨ Migration complete!\n');
}

// Run migration
migrateOriginPaths().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
