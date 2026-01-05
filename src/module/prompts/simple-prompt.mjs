import { sendActionDataToChat } from '../rolls/roll-helpers.mjs';

/**
 *
 * @param simpleSkillData {SimpleSkillData}
 * @returns {Promise<void>}
 */
export async function prepareSimpleRoll(simpleSkillData) {
    const html = await renderTemplate('systems/rogue-trader/templates/prompt/simple-roll-prompt.hbs', simpleSkillData);
    let dialog = new Dialog(
        {
            title: 'Roll Modifier',
            content: html,
            buttons: {
                roll: {
                    icon: "<i class='dh-material'>casino</i>",
                    label: 'Roll',
                    callback: async (dialogHtml) => {
                        const rollData = simpleSkillData.rollData;
                        rollData.modifiers['difficulty'] = parseInt(dialogHtml.find('[id=difficulty] :selected').val());
                        rollData.modifiers['modifier'] = dialogHtml.find('#modifier')[0].value;
                        await rollData.calculateTotalModifiers();
                        await simpleSkillData.calculateSuccessOrFailure();
                        await sendActionDataToChat(simpleSkillData);
                    },
                },
                cancel: {
                    icon: "<i class='dh-material'>close</i>",
                    label: 'Cancel',
                    callback: () => {},
                },
            },
            default: 'roll',
            close: () => {},
        },
        {
            width: 300,
        },
    );
    dialog.render(true);
}

export async function prepareCreateSpecialistSkillPrompt(simpleSkillData) {
    // Try to get the skill from the compendium to get suggested specializations
    const skillsCompendium = game.packs.get('rogue-trader.rt-items-skills');
    let specializations = [];
    
    if (skillsCompendium) {
        // Find the skill in the compendium by matching the label more precisely
        const index = await skillsCompendium.getIndex();
        // Look for skills with (X) in the name, which indicates specialist skills
        const skillEntries = index.filter(entry => entry.name.includes('(X)'));
        
        // Try to find exact match first by comparing the base skill name
        const skillLabel = simpleSkillData.skill.label;
        const skillEntry = skillEntries.find(entry => {
            // Extract the base name without (X)
            const baseName = entry.name.replace(/\s*\(X\)\s*$/i, '').trim();
            return baseName.toLowerCase() === skillLabel.toLowerCase();
        });
        
        if (skillEntry) {
            const skillDoc = await skillsCompendium.getDocument(skillEntry._id);
            if (skillDoc && skillDoc.system.specializations) {
                specializations = skillDoc.system.specializations;
            }
        }
    }
    
    // Add specializations to the data
    simpleSkillData.specializations = specializations;
    
    const html = await renderTemplate('systems/rogue-trader/templates/prompt/add-speciality-prompt.hbs', simpleSkillData);
    let dialog = new Dialog(
        {
            title: 'Create Specialist Skill',
            content: html,
            buttons: {
                add: {
                    icon: "<i class='dh-material'>add</i>",
                    label: 'Add',
                    callback: async (dialogHtml) => {
                        // Try to get from dropdown first (if specializations exist), otherwise from text input
                        let speciality = '';
                        const dropdownElement = dialogHtml.find('#speciality-name');
                        const customElement = dialogHtml.find('#custom-speciality-name');
                        
                        if (dropdownElement.length > 0 && dropdownElement[0].tagName === 'SELECT') {
                            // We have a dropdown with specializations
                            const selectedValue = dropdownElement[0].value.trim();
                            const customValue = customElement.length > 0 ? customElement[0].value.trim() : '';
                            
                            // Prioritize custom input if provided, otherwise use selected value (if not empty)
                            if (customValue !== '') {
                                speciality = customValue;
                            } else if (selectedValue !== '') {
                                speciality = selectedValue;
                            }
                        } else {
                            // Just a text input
                            speciality = dropdownElement[0].value.trim();
                        }
                        
                        if (!speciality || speciality === '') {
                            ui.notifications.warn('Please enter or select a specialization name');
                            return;
                        }
                        await simpleSkillData.actor.addSpecialitySkill(simpleSkillData.skillName, speciality);
                    },
                },
                cancel: {
                    icon: "<i class='dh-material'>close</i>",
                    label: 'Cancel',
                    callback: () => {},
                },
            },
            default: 'add',
            close: () => {},
        },
        {
            width: 400,
        },
    );
    dialog.render(true);
}

