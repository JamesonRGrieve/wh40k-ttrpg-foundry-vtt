/**
 * Game Icons Helper
 * Provides access to game-icons.net icons via jsDelivr CDN
 * Icons are CC BY 3.0 licensed - see ATTRIBUTION.md
 */

// CDN base URL for game-icons.net repository
const GAME_ICONS_CDN = 'https://cdn.jsdelivr.net/gh/game-icons/icons@master';

/**
 * Icon categories mapped to game-icons.net folder paths
 * These are the most commonly used categories for Rogue Trader
 */
export const ICON_CATEGORIES = {
  // Weapons & Combat
  weapons: [
    'lorc/sword', 'lorc/broadsword', 'lorc/crossed-swords', 'lorc/pistol-gun',
    'lorc/ray-gun', 'lorc/laser-blast', 'lorc/daggers', 'lorc/axe', 'lorc/war-axe',
    'lorc/bo', 'lorc/mace-head', 'lorc/flanged-mace', 'lorc/hammer-drop',
    'delapouite/ak47', 'delapouite/winchester-rifle', 'delapouite/machine-gun',
    'delapouite/revolver', 'delapouite/grenade', 'delapouite/missile-launcher'
  ],
  
  // Armour & Protection
  armour: [
    'lorc/shield', 'lorc/checked-shield', 'lorc/round-shield', 'lorc/visored-helm',
    'lorc/heavy-helm', 'lorc/crested-helmet', 'lorc/shoulder-armor', 'lorc/arm-bandage',
    'delapouite/chest-armor', 'delapouite/leather-armor', 'delapouite/scale-mail',
    'delapouite/kevlar-vest', 'delapouite/armor-upgrade'
  ],
  
  // Psychic & Warp
  psychic: [
    'lorc/burning-eye', 'lorc/brain', 'lorc/psychic-waves', 'lorc/fire', 'lorc/lightning-helix',
    'lorc/lightning-storm', 'lorc/abstract-047', 'lorc/abstract-050', 'lorc/sunbeams',
    'delapouite/third-eye', 'delapouite/telekinesis', 'delapouite/telepathy'
  ],
  
  // Skills & Abilities
  skills: [
    'lorc/run', 'lorc/sprint', 'lorc/jump-across', 'lorc/conversation', 'lorc/magnifying-glass',
    'lorc/healing', 'lorc/gears', 'lorc/lockpicks', 'lorc/crossed-pistols', 'lorc/archery-target',
    'delapouite/skills', 'delapouite/backstab', 'delapouite/juggler', 'delapouite/throw'
  ],
  
  // Characters
  characters: [
    'lorc/cowled', 'lorc/cultist', 'lorc/wizard-staff', 'lorc/crowned-skull',
    'delapouite/ninja-heroic-stance', 'delapouite/space-suit', 'delapouite/astronaut-helmet',
    'delapouite/person', 'delapouite/android-mask'
  ],
  
  // Ships & Vehicles
  ships: [
    'delapouite/rocket', 'delapouite/spaceship', 'delapouite/flying-target',
    'lorc/rocket-flight', 'lorc/star-swirl'
  ],
  
  // Gear & Equipment
  gear: [
    'lorc/backpack', 'lorc/bindle', 'lorc/compass', 'lorc/grappling-hook', 'lorc/lantern-flame',
    'delapouite/binoculars', 'delapouite/walkie-talkie', 'delapouite/first-aid-kit',
    'delapouite/toolbox', 'delapouite/medicine-pills'
  ],
  
  // Cybernetics & Bionics
  cybernetics: [
    'delapouite/cyber-eye', 'delapouite/robotic-arm', 'delapouite/artificial-hive',
    'lorc/processor', 'lorc/circuitry'
  ],
  
  // Conditions & Status
  conditions: [
    'lorc/bleeding-wound', 'lorc/broken-skull', 'lorc/death-skull', 'lorc/frozen-body',
    'lorc/burning-dot', 'lorc/poisoned', 'lorc/screaming', 'lorc/unconscious',
    'delapouite/bleeding-eye', 'delapouite/bandaged'
  ]
};

/**
 * Get the CDN URL for a game-icon
 * @param {string} iconPath - Path like "lorc/sword" or full path "svg/lorc/originals/sword.svg"
 * @param {string} color - SVG color (default: white for dark backgrounds)
 * @returns {string} Full CDN URL
 */
export function getIconUrl(iconPath, color = 'ffffff') {
  // If already a full path, use as-is
  if (iconPath.startsWith('svg/') || iconPath.startsWith('http')) {
    return iconPath.startsWith('http') ? iconPath : `${GAME_ICONS_CDN}/${iconPath}`;
  }
  
  // Parse short format: "lorc/sword" -> "svg/lorc/originals/sword.svg"
  const parts = iconPath.split('/');
  if (parts.length === 2) {
    const [author, name] = parts;
    return `${GAME_ICONS_CDN}/svg/${author}/originals/${name}.svg`;
  }
  
  // Fallback
  return `${GAME_ICONS_CDN}/svg/${iconPath}.svg`;
}

/**
 * Get a colored version of an icon (uses game-icons.net's color service if needed)
 * For SVGs, color is applied via CSS filter or inline style
 * @param {string} iconPath - Icon path
 * @param {string} fgColor - Foreground color hex (without #)
 * @param {string} bgColor - Background color hex (without #), optional
 * @returns {string} URL to colored icon
 */
export function getColoredIconUrl(iconPath, fgColor = 'ffffff', bgColor = null) {
  // Use game-icons.net's own colored icon service
  const parts = iconPath.split('/');
  if (parts.length === 2) {
    const [author, name] = parts;
    const bg = bgColor || '000000';
    return `https://game-icons.net/icons/${bg}/${fgColor}/${author}/${name}.svg`;
  }
  return getIconUrl(iconPath);
}

/**
 * Default icons for each item type
 */
export const DEFAULT_ITEM_ICONS = {
  weapon: 'lorc/crossed-swords',
  armour: 'lorc/shield',
  ammunition: 'delapouite/bullets',
  gear: 'lorc/backpack',
  talent: 'lorc/light-bulb',
  trait: 'lorc/person',
  psychicPower: 'lorc/psychic-waves',
  skill: 'lorc/skills',
  cybernetic: 'delapouite/cyber-eye',
  forceField: 'lorc/shield-reflect',
  attackSpecial: 'lorc/spiked-tentacle',
  weaponMod: 'lorc/gears',
  criticalInjury: 'lorc/broken-bone',
  origin: 'delapouite/world',
  
  // Actors
  character: 'lorc/cowled',
  npc: 'delapouite/person',
  vehicle: 'delapouite/jeep',
  starship: 'delapouite/spaceship'
};

/**
 * Get the default icon URL for an item type
 * @param {string} type - Item or actor type
 * @returns {string} CDN URL for the default icon
 */
export function getDefaultIcon(type) {
  const iconPath = DEFAULT_ITEM_ICONS[type] || 'lorc/perspective-dice-six';
  return getIconUrl(iconPath);
}

/**
 * Preload common icons to browser cache
 * Call this during system initialization
 */
export async function preloadCommonIcons() {
  const commonIcons = [
    ...ICON_CATEGORIES.weapons.slice(0, 5),
    ...ICON_CATEGORIES.armour.slice(0, 3),
    ...ICON_CATEGORIES.skills.slice(0, 5),
    ...Object.values(DEFAULT_ITEM_ICONS)
  ];
  
  const uniqueIcons = [...new Set(commonIcons)];
  
  // Preload by creating Image objects
  return Promise.all(uniqueIcons.map(iconPath => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve; // Don't fail on missing icons
      img.src = getIconUrl(iconPath);
    });
  }));
}

// Export CDN base for advanced usage
export { GAME_ICONS_CDN };
