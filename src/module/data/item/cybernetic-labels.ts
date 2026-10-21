import type { I18nKey } from '../../types/i18n-keys';

/**
 * The cybernetic type and body-location vocabularies and their langpack labels
 * (#696). The schema's choices and the sheet's labels both read these, so a value
 * cannot exist without a label: the key maps are typed against the generated
 * langpack key union, and the header badge once showed the raw
 * `WH40K.CyberneticType.Replacement` because its label was built from a key path
 * that had no entries.
 */

export const CYBERNETIC_TYPES = ['replacement', 'implant', 'augmetic', 'bionic', 'mechadendrite', 'integrated-weapon'] as const;
export type CyberneticType = (typeof CYBERNETIC_TYPES)[number];

export const CYBERNETIC_LOCATIONS = [
    'head',
    'eyes',
    'ears',
    'mouth',
    'brain',
    'leftArm',
    'rightArm',
    'body',
    'organs',
    'leftLeg',
    'rightLeg',
    'spine',
    'internal',
] as const;
export type CyberneticLocation = (typeof CYBERNETIC_LOCATIONS)[number];

export const CYBERNETIC_TYPE_LABEL_KEYS: Readonly<Record<CyberneticType, I18nKey>> = {
    'replacement': 'WH40K.ItemSheet.Cybernetic.TypeReplacement',
    'implant': 'WH40K.ItemSheet.Cybernetic.TypeImplant',
    'augmetic': 'WH40K.ItemSheet.Cybernetic.TypeAugmetic',
    'bionic': 'WH40K.ItemSheet.Cybernetic.TypeBionic',
    'mechadendrite': 'WH40K.ItemSheet.Cybernetic.TypeMechadendrite',
    'integrated-weapon': 'WH40K.ItemSheet.Cybernetic.TypeIntegratedWeapon',
};

export const CYBERNETIC_LOCATION_LABEL_KEYS: Readonly<Record<CyberneticLocation, I18nKey>> = {
    head: 'WH40K.BodyLocation.Head',
    eyes: 'WH40K.ItemSheet.Cybernetic.LocationEyes',
    ears: 'WH40K.ItemSheet.Cybernetic.LocationEars',
    mouth: 'WH40K.ItemSheet.Cybernetic.LocationMouth',
    brain: 'WH40K.ItemSheet.Cybernetic.LocationBrain',
    leftArm: 'WH40K.BodyLocation.LeftArm',
    rightArm: 'WH40K.BodyLocation.RightArm',
    body: 'WH40K.BodyLocation.Body',
    organs: 'WH40K.ItemSheet.Cybernetic.LocationOrgans',
    leftLeg: 'WH40K.BodyLocation.LeftLeg',
    rightLeg: 'WH40K.BodyLocation.RightLeg',
    spine: 'WH40K.ItemSheet.Cybernetic.LocationSpine',
    internal: 'WH40K.ItemSheet.Cybernetic.LocationInternal',
};

const isCyberneticType = (value: string): value is CyberneticType => (CYBERNETIC_TYPES as readonly string[]).includes(value);
const isCyberneticLocation = (value: string): value is CyberneticLocation => (CYBERNETIC_LOCATIONS as readonly string[]).includes(value);

/** The langpack key of a cybernetic type, or undefined for a value outside the vocabulary. */
export function cyberneticTypeLabelKey(type: string): I18nKey | undefined {
    return isCyberneticType(type) ? CYBERNETIC_TYPE_LABEL_KEYS[type] : undefined;
}

/** The langpack key of a body location, or undefined for a value outside the vocabulary. */
export function cyberneticLocationLabelKey(location: string): I18nKey | undefined {
    return isCyberneticLocation(location) ? CYBERNETIC_LOCATION_LABEL_KEYS[location] : undefined;
}
