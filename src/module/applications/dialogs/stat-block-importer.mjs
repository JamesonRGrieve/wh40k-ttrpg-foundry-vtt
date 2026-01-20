/**
 * Dialog for importing NPC data from a pasted stat block.
 * Parses common Rogue Trader / Dark Heresy stat block formats.
 */
export class StatBlockImporter extends foundry.applications.api.DialogV2 {
  /* -------------------------------------------- */
  /*  Static Factory Method                       */
  /* -------------------------------------------- */

  /**
   * Show the stat block importer dialog for an actor.
   * @param {RogueTraderNPC} actor - The NPC actor to update.
   */
  static async show(actor) {
    const { default: StatBlockParser } = await import("../npc/stat-block-parser.mjs");
    return StatBlockParser.open({ actor });
  }

  /* -------------------------------------------- */
  /*  Parser Methods                              */
  /* -------------------------------------------- */

  /**
   * Parse a stat block text into structured data.
   * @param {string} text - The raw stat block text.
   * @returns {object} - Parsed data object.
   */
  static parseStatBlock(text) {
    const result = {
      name: null,
      characteristics: {},
      wounds: null,
      movement: {},
      skills: [],
      traits: [],
      talents: [],
      weapons: [],
      armour: null,
      threatLevel: null,
      description: null
    };

    const lines = text.split("\n").map(l => l.trim()).filter(l => l);
    
    // Try to extract name from first non-empty line
    if (lines.length > 0) {
      const firstLine = lines[0];
      // If first line doesn't look like stats, use as name
      if (!firstLine.match(/^(WS|BS|S|T|Ag|Int|Per|WP|Fel|Inf)/i)) {
        result.name = firstLine;
      }
    }

    // Join all text for pattern matching
    const fullText = text.replace(/\n/g, " ");

    // Parse characteristics - look for patterns like "WS 35" or "WS: 35" or in tables
    const charPatterns = [
      { key: "weaponSkill", patterns: [/\bWS[:\s]+(\d+)/i, /Weapon\s*Skill[:\s]+(\d+)/i] },
      { key: "ballisticSkill", patterns: [/\bBS[:\s]+(\d+)/i, /Ballistic\s*Skill[:\s]+(\d+)/i] },
      { key: "strength", patterns: [/\bS[:\s]+(\d+)(?!\d)/i, /Strength[:\s]+(\d+)/i] },
      { key: "toughness", patterns: [/\bT[:\s]+(\d+)(?!\d)/i, /Toughness[:\s]+(\d+)/i] },
      { key: "agility", patterns: [/\bAg[:\s]+(\d+)/i, /Agility[:\s]+(\d+)/i] },
      { key: "intelligence", patterns: [/\bInt[:\s]+(\d+)/i, /Intelligence[:\s]+(\d+)/i] },
      { key: "perception", patterns: [/\bPer[:\s]+(\d+)/i, /Perception[:\s]+(\d+)/i] },
      { key: "willpower", patterns: [/\bWP[:\s]+(\d+)/i, /Willpower[:\s]+(\d+)/i] },
      { key: "fellowship", patterns: [/\bFel[:\s]+(\d+)/i, /Fellowship[:\s]+(\d+)/i] },
      { key: "influence", patterns: [/\bInf[:\s]+(\d+)/i, /Influence[:\s]+(\d+)/i] }
    ];

    for (const { key, patterns } of charPatterns) {
      for (const pattern of patterns) {
        const match = fullText.match(pattern);
        if (match) {
          result.characteristics[key] = parseInt(match[1], 10);
          break;
        }
      }
    }

    // Try to parse characteristic line format: "WS BS S T Ag Int Per WP Fel" followed by numbers
    const charLineMatch = fullText.match(/WS\s+BS\s+S\s+T\s+Ag\s+Int\s+Per\s+WP\s+Fel[^\d]*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i);
    if (charLineMatch) {
      result.characteristics.weaponSkill = parseInt(charLineMatch[1], 10);
      result.characteristics.ballisticSkill = parseInt(charLineMatch[2], 10);
      result.characteristics.strength = parseInt(charLineMatch[3], 10);
      result.characteristics.toughness = parseInt(charLineMatch[4], 10);
      result.characteristics.agility = parseInt(charLineMatch[5], 10);
      result.characteristics.intelligence = parseInt(charLineMatch[6], 10);
      result.characteristics.perception = parseInt(charLineMatch[7], 10);
      result.characteristics.willpower = parseInt(charLineMatch[8], 10);
      result.characteristics.fellowship = parseInt(charLineMatch[9], 10);
    }

    // Parse wounds
    const woundsMatch = fullText.match(/Wounds[:\s]+(\d+)/i);
    if (woundsMatch) {
      result.wounds = parseInt(woundsMatch[1], 10);
    }

    // Parse movement - look for "Movement: X/Y/Z/W" or "Half X, Full Y" patterns
    const movementMatch = fullText.match(/Movement[:\s]+(\d+)\/(\d+)\/(\d+)\/(\d+)/i);
    if (movementMatch) {
      result.movement.half = parseInt(movementMatch[1], 10);
      result.movement.full = parseInt(movementMatch[2], 10);
      result.movement.charge = parseInt(movementMatch[3], 10);
      result.movement.run = parseInt(movementMatch[4], 10);
    }

    // Parse armour - look for "Armour: X" or "AP: X" or location-based
    const armourMatch = fullText.match(/(?:Armour|Armor|AP)[:\s]+(\d+)/i);
    if (armourMatch) {
      result.armour = parseInt(armourMatch[1], 10);
    }

    // Parse skills - look for "Skills:" section
    const skillsMatch = fullText.match(/Skills?[:\s]+([^.]+)/i);
    if (skillsMatch) {
      const skillsText = skillsMatch[1];
      // Parse individual skills: "Awareness +10, Dodge +20, Stealth"
      const skillEntries = skillsText.split(/[,;]/).map(s => s.trim()).filter(s => s);
      for (const entry of skillEntries) {
        const skillMatch = entry.match(/^([A-Za-z\s-]+?)(?:\s*\+(\d+))?$/);
        if (skillMatch) {
          result.skills.push({
            name: skillMatch[1].trim(),
            bonus: skillMatch[2] ? parseInt(skillMatch[2], 10) : 0
          });
        }
      }
    }

    // Parse talents - look for "Talents:" section
    const talentsMatch = fullText.match(/Talents?[:\s]+([^.]+)/i);
    if (talentsMatch) {
      const talentsText = talentsMatch[1];
      const talentEntries = talentsText.split(/[,;]/).map(t => t.trim()).filter(t => t);
      result.talents = talentEntries;
    }

    // Parse traits - look for "Traits:" section
    const traitsMatch = fullText.match(/Traits?[:\s]+([^.]+)/i);
    if (traitsMatch) {
      const traitsText = traitsMatch[1];
      const traitEntries = traitsText.split(/[,;]/).map(t => t.trim()).filter(t => t);
      result.traits = traitEntries;
    }

    // Parse weapons - look for weapon entries with damage
    const weaponPattern = /([A-Za-z\s]+)\s+\(([^)]+)\)\s+(\d+d\d+[+\-]?\d*)/gi;
    let weaponMatch;
    while ((weaponMatch = weaponPattern.exec(fullText)) !== null) {
      result.weapons.push({
        name: weaponMatch[1].trim(),
        class: weaponMatch[2].trim(),
        damage: weaponMatch[3]
      });
    }

    // Parse threat level
    const threatMatch = fullText.match(/(?:Threat|Danger)[:\s]+(Minor|Moderate|Major|Extreme|Legendary)/i);
    if (threatMatch) {
      result.threatLevel = threatMatch[1].toLowerCase();
    }

    return result;
  }

  /* -------------------------------------------- */

  /**
   * Apply parsed data to an actor.
   * @param {RogueTraderNPC} actor - The actor to update.
   * @param {object} parsed - The parsed stat block data.
   */
  static async applyToActor(actor, parsed) {
    const updateData = {};
    let fieldsUpdated = 0;

    // Update name if found and different
    if (parsed.name && parsed.name !== actor.name) {
      updateData.name = parsed.name;
      fieldsUpdated++;
    }

    // Update characteristics
    for (const [key, value] of Object.entries(parsed.characteristics)) {
      if (value && !isNaN(value)) {
        updateData[`system.characteristics.${key}.base`] = value;
        fieldsUpdated++;
      }
    }

    // Update wounds
    if (parsed.wounds) {
      updateData["system.wounds.max"] = parsed.wounds;
      updateData["system.wounds.value"] = parsed.wounds;
      fieldsUpdated++;
    }

    // Update movement
    if (parsed.movement.half) updateData["system.movement.half"] = parsed.movement.half;
    if (parsed.movement.full) updateData["system.movement.full"] = parsed.movement.full;
    if (parsed.movement.charge) updateData["system.movement.charge"] = parsed.movement.charge;
    if (parsed.movement.run) updateData["system.movement.run"] = parsed.movement.run;
    if (Object.keys(parsed.movement).length > 0) fieldsUpdated++;

    // Update armour (simple mode)
    if (parsed.armour !== null) {
      updateData["system.armour.total"] = parsed.armour;
      fieldsUpdated++;
    }

    // Update threat level
    if (parsed.threatLevel) {
      updateData["system.threatLevel"] = parsed.threatLevel;
      fieldsUpdated++;
    }

    // Apply the update
    if (Object.keys(updateData).length > 0) {
      await actor.update(updateData);
    }

    // Handle skills - add to trained skills
    if (parsed.skills.length > 0) {
      const skillKeyMap = {
        "acrobatics": "acrobatics",
        "athletics": "athletics",
        "awareness": "awareness",
        "charm": "charm",
        "command": "command",
        "commerce": "commerce",
        "deceive": "deceive",
        "dodge": "dodge",
        "inquiry": "inquiry",
        "interrogation": "interrogation",
        "intimidate": "intimidate",
        "logic": "logic",
        "medicae": "medicae",
        "parry": "parry",
        "psyniscience": "psyniscience",
        "scrutiny": "scrutiny",
        "security": "security",
        "sleight of hand": "sleightOfHand",
        "stealth": "stealth",
        "survival": "survival",
        "tech-use": "techUse"
      };

      const trainedSkills = foundry.utils.deepClone(actor.system.trainedSkills) || {};
      
      for (const skill of parsed.skills) {
        const key = skillKeyMap[skill.name.toLowerCase()] || skill.name.toLowerCase().replace(/\s+/g, "");
        trainedSkills[key] = {
          trained: true,
          plus10: skill.bonus >= 10,
          plus20: skill.bonus >= 20,
          bonus: 0
        };
      }
      
      await actor.update({ "system.trainedSkills": trainedSkills });
      fieldsUpdated += parsed.skills.length;
    }

    // Show results
    ui.notifications.info(`Imported ${fieldsUpdated} fields from stat block.`);
    
    // Log what wasn't imported for manual review
    const notImported = [];
    if (parsed.talents.length > 0) notImported.push(`${parsed.talents.length} talents`);
    if (parsed.traits.length > 0) notImported.push(`${parsed.traits.length} traits`);
    if (parsed.weapons.length > 0) notImported.push(`${parsed.weapons.length} weapons`);
    
    if (notImported.length > 0) {
      console.log("Stat Block Import - Items requiring manual addition:", {
        talents: parsed.talents,
        traits: parsed.traits,
        weapons: parsed.weapons
      });
      ui.notifications.info(`Some items need manual addition: ${notImported.join(", ")}. See console for details.`);
    }
  }
}
