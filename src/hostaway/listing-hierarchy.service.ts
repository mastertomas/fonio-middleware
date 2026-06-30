import { Injectable, Logger } from '@nestjs/common';
import { AvailabilityMode } from '@prisma/client';
import { HostawayClient } from './hostaway.client';
import {
  LISTING_HIERARCHY,
  resolveParentHostawayId,
} from './listing-hierarchy.config';
import { HostawayListing } from './hostaway.types';

export interface DiscoveredGroup {
  parentHostawayId: number;
  name: string;
  city: string;
  childHostawayIds: number[];
  availabilityMode: AvailabilityMode;
  source: 'config' | 'api' | 'merged';
}

@Injectable()
export class ListingHierarchyService {
  private readonly logger = new Logger(ListingHierarchyService.name);
  private cachedGroups: DiscoveredGroup[] | null = null;

  constructor(private readonly hostaway: HostawayClient) {}

  getCachedGroups(): DiscoveredGroup[] {
    return this.cachedGroups ?? this.configGroups();
  }

  resolveParent(listingId: number): number | null {
    for (const group of this.getCachedGroups()) {
      if (group.parentHostawayId === listingId) return group.parentHostawayId;
      if (group.childHostawayIds.includes(listingId)) {
        return group.parentHostawayId;
      }
    }
    return resolveParentHostawayId(listingId);
  }

  async discoverGroups(remotes: HostawayListing[]): Promise<DiscoveredGroup[]> {
    const groups = new Map<number, DiscoveredGroup>();

    for (const g of LISTING_HIERARCHY) {
      groups.set(g.parentHostawayId, {
        parentHostawayId: g.parentHostawayId,
        name: g.name,
        city: g.city,
        childHostawayIds: [...g.childHostawayIds],
        availabilityMode: g.availabilityMode as AvailabilityMode,
        source: 'config',
      });
    }

    for (const listing of remotes) {
      try {
        const units = await this.hostaway.getListingUnits(listing.id);
        const childIds = units
          .map((u) => Number(u.listingMapIdUnit))
          .filter((id) => Number.isFinite(id) && id > 0);

        if (childIds.length === 0) continue;

        const existing = groups.get(listing.id);
        if (existing) {
          existing.childHostawayIds = [
            ...new Set([...existing.childHostawayIds, ...childIds]),
          ];
          existing.source = 'merged';
        } else {
          groups.set(listing.id, {
            parentHostawayId: listing.id,
            name: listing.name,
            city: listing.city ?? '',
            childHostawayIds: childIds,
            availabilityMode: AvailabilityMode.BOTH,
            source: 'api',
          });
        }
      } catch {
        this.logger.debug(`No listing units for ${listing.id}`);
      }
      await this.sleep(150);
    }

    this.cachedGroups = [...groups.values()];
    return this.cachedGroups;
  }

  private configGroups(): DiscoveredGroup[] {
    return LISTING_HIERARCHY.map((g) => ({
      parentHostawayId: g.parentHostawayId,
      name: g.name,
      city: g.city,
      childHostawayIds: [...g.childHostawayIds],
      availabilityMode: g.availabilityMode as AvailabilityMode,
      source: 'config' as const,
    }));
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
