export interface HostawayTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface HostawayListResponse<T> {
  status: string;
  result: T[];
  count?: number;
}

export interface HostawaySingleResponse<T> {
  status: string;
  result: T;
}

export interface HostawayListing {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  personCapacity: number;
  bedroomsNumber: number | null;
  roomType: string | null;
  specialStatus: string | null;
  listingTags?: { id: number; name: string }[];
  listingAmenities?: { amenityId: number; amenityName: string }[];
}

export interface HostawayListingUnit {
  id: number;
  name: string;
  listingMapIdUnit?: number | string | null;
}

export interface HostawayCalendarDay {
  date: string;
  isAvailable: number;
  minimumStay: number;
  price: number;
}

export interface HostawayReservation {
  id: number;
  listingMapId: number;
  arrivalDate: string;
  departureDate: string;
  numberOfGuests: number;
  adults: number | null;
  children: number | null;
  pets: number | null;
  status: string;
  guestName: string;
  guestFirstName?: string | null;
  guestLastName?: string | null;
  guestEmail: string | null;
  phone: string | null;
}

export interface HostawayConversation {
  id: number;
  listingMapId: number;
  reservationId: number;
}

export interface HostawayConversationMessage {
  id: number;
  body: string;
  communicationType: string;
  insertedOn?: string;
  isIncoming?: number;
}
