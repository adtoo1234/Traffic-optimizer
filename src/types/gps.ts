export interface Coordinates {
  lat: number;
  lng: number;
}

export interface AddressDetails {
  colony?: string; // Colony, Neighborhood, Sublocality
  pincode?: string; // Postal code / PIN code
  street?: string; // Street, Road, Premise
  locality?: string; // City or Town
  district?: string; // District / County
  state?: string; // State or Province
  country?: string;
  formattedAddress?: string;
}

export interface GpsLocation {
  coords: Coordinates;
  accuracy?: number; // in meters
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp?: number;
  name?: string;
  address?: string;
  addressDetails?: AddressDetails;
  isSimulated?: boolean;
}

export interface SearchedLocation {
  id: string;
  name: string;
  formattedAddress: string;
  coords: Coordinates;
  placeId?: string;
  types?: string[];
  addressDetails?: AddressDetails;
  addedAt: number;
}

export type TravelMode = 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TWO_WHEELER' | 'TRANSIT' | 'FLIGHT';

export interface MediumEstimate {
  mode: TravelMode;
  label: string;
  subLabel?: string;
  durationMillis: number;
  durationFormatted: string;
  distanceMeters: number;
  distanceFormatted: string;
  isRealRoute: boolean;
  etaFormatted: string;
  tag?: string;
  caloriesBurned?: number;
  speedKmh?: number;
}

export interface DistanceMetrics {
  straightKm: number;
  straightMiles: number;
  straightNauticalMiles: number;
  bearingDeg: number;
  bearingCardinal: string;
  routeDistanceKm?: number;
  routeDistanceMiles?: number;
  routeDurationFormatted?: string;
  travelMode?: TravelMode;
  timeDifferenceHours?: number;
  targetLocalTimeString?: string;
}

export interface TrafficBottleneck {
  id: string;
  locationName: string;
  coords: Coordinates;
  distanceAheadKm: number;
  delayMinutes: number;
  severity: 'heavy' | 'moderate' | 'slow';
  clearanceTimeMinutes: number; // Time it will take for traffic to get over
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
  description: string;
}

export interface RoutePossibility {
  id: string;
  name: string;
  via: string;
  durationMinutes: number;
  durationFormatted: string;
  distanceKm: number;
  distanceFormatted: string;
  timeSavedMinutes: number; // positive = saves time, negative = slower
  isRecommended: boolean;
  trafficLevel: 'low' | 'moderate' | 'heavy';
  avoidedBottlenecks: number;
  waypoints?: Coordinates[];
  color: string;
  description: string;
}

export interface LiveTrafficIntelligence {
  hasCongestionAhead: boolean;
  overallCongestionLevel: 'free' | 'moderate' | 'congested' | 'severe';
  totalDelayMinutes: number;
  clearanceForecastMinutes: number; // overall time until traffic clears
  activeBottlenecks: TrafficBottleneck[];
  alternateRoutes: RoutePossibility[];
  selectedRouteId: string;
}

export interface TravelSession {
  isActive: boolean;
  isPaused: boolean;
  startedAt: number | null;
  travelMode: TravelMode;
  elapsedSeconds: number;
  isSimulatedMovement?: boolean;
  currentSpeedKmh?: number;
  simulatedProgressRatio?: number; // 0 to 1
  selectedRouteId?: string;
}
