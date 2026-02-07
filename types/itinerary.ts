// types/itinerary.ts

export type PlaceRef = {
  placeId?: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
};

export type ItineraryItem = {
  id: string;           // crypto.randomUUID()
  title: string;
  startTime?: string;   // "HH:MM" (deprecated, use fixedStartTime)
  fixedStartTime?: string; // "HH:MM" when user pins an item
  durationMin?: number;
  notes?: string;
  place?: PlaceRef;
  mapsUrl?: string;
  placeId?: string;
  rating?: number;
  ratingsTotal?: number;
};

export type GenerateInput = {
  budget?: "€" | "€€" | "€€€";
  activityTypes?: string[];
  walkingTolerance?: "Low" | "Medium" | "High";
  includeFood?: boolean;
  cuisines?: string[];
  mustInclude?: string;
  avoid?: string;
  chatPrompt?: string;
  workAroundExisting?: boolean;
};

export type Itinerary = {
  items: ItineraryItem[];
};
