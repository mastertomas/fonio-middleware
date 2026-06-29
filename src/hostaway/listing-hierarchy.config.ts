/** Parent listing groups mapped from Hostaway UI structure */
export const LISTING_HIERARCHY: {
  parentHostawayId: number;
  name: string;
  city: string;
  childHostawayIds: number[];
  availabilityMode: 'PARENT_ONLY' | 'CHILDREN_ONLY' | 'BOTH';
}[] = [
  {
    parentHostawayId: 175206,
    name: 'Bergdomizil',
    city: 'Buchenberg',
    childHostawayIds: [172744, 172749, 172750, 172757],
    availabilityMode: 'BOTH',
  },
  {
    parentHostawayId: 176398,
    name: 'Kornbergstraße 2.OG',
    city: 'Stuttgart',
    childHostawayIds: [172746, 172747, 172751],
    availabilityMode: 'BOTH',
  },
  {
    parentHostawayId: 176399,
    name: 'Kornbergstraße 3.OG',
    city: 'Stuttgart',
    childHostawayIds: [172753, 172754, 172756],
    availabilityMode: 'BOTH',
  },
  {
    parentHostawayId: 176400,
    name: 'Kornbergstraße 4.OG',
    city: 'Stuttgart',
    childHostawayIds: [172745, 172748, 172752],
    availabilityMode: 'BOTH',
  },
];

/** Standalone listings (no parent group) */
export const STANDALONE_LISTING_IDS = [
  172755, 172758, 243292, 260074, 315366, 320947, 363930, 423614, 485161,
];

/** Draft listings excluded from fonio availability */
export const EXCLUDED_LISTING_IDS = [172754];

export function resolveParentHostawayId(listingId: number): number | null {
  for (const group of LISTING_HIERARCHY) {
    if (group.parentHostawayId === listingId) return group.parentHostawayId;
    if (group.childHostawayIds.includes(listingId)) return group.parentHostawayId;
  }
  return null;
}

export function resolveGroupForListing(listingId: number) {
  return LISTING_HIERARCHY.find(
    (g) =>
      g.parentHostawayId === listingId ||
      g.childHostawayIds.includes(listingId),
  );
}
