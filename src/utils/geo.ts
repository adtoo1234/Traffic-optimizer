import { Coordinates, DistanceMetrics } from '../types/gps';

// Earth's mean radius in kilometers
const EARTH_RADIUS_KM = 6371.0088;
const KM_TO_MILES = 0.621371;
const KM_TO_NAUTICAL_MILES = 0.539957;

/**
 * Calculates great-circle distance between two coordinates using the Haversine formula
 */
export function calculateHaversineDistanceKm(c1: Coordinates, c2: Coordinates): number {
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLon = ((c2.lng - c1.lng) * Math.PI) / 180;
  const lat1Rad = (c1.lat * Math.PI) / 180;
  const lat2Rad = (c2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculates initial bearing (forward azimuth) from c1 to c2 in degrees [0, 360)
 */
export function calculateBearing(c1: Coordinates, c2: Coordinates): number {
  const lat1 = (c1.lat * Math.PI) / 180;
  const lat2 = (c2.lat * Math.PI) / 180;
  const dLon = ((c2.lng - c1.lng) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Converts bearing degrees into 16-wind compass cardinal directions
 */
export function bearingToCardinal(deg: number): string {
  const directions = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ];
  const index = Math.round(((deg % 360) / 22.5)) % 16;
  return directions[index];
}

/**
 * Computes great circle arc waypoints between two coordinates for rendering realistic curved flight paths on a 2D map
 */
export function generateGeodesicArc(c1: Coordinates, c2: Coordinates, numPoints = 100): Coordinates[] {
  const lat1 = (c1.lat * Math.PI) / 180;
  const lon1 = (c1.lng * Math.PI) / 180;
  const lat2 = (c2.lat * Math.PI) / 180;
  const lon2 = (c2.lng * Math.PI) / 180;

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)
      )
    );

  if (d === 0) return [c1, c2];

  const points: Coordinates[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)));
    const lon = Math.atan2(y, x);
    points.push({
      lat: (lat * 180) / Math.PI,
      lng: (lon * 180) / Math.PI,
    });
  }
  return points;
}

/**
 * Calculates antipodal point (exact opposite side of planet)
 */
export function calculateAntipode(coords: Coordinates): Coordinates {
  return {
    lat: -coords.lat,
    lng: coords.lng > 0 ? coords.lng - 180 : coords.lng + 180,
  };
}

/**
 * Comprehensive distance metrics calculation
 */
export function computeDistanceMetrics(origin: Coordinates, destination: Coordinates): DistanceMetrics {
  const straightKm = calculateHaversineDistanceKm(origin, destination);
  const straightMiles = straightKm * KM_TO_MILES;
  const straightNauticalMiles = straightKm * KM_TO_NAUTICAL_MILES;
  const bearingDeg = calculateBearing(origin, destination);
  const bearingCardinal = bearingToCardinal(bearingDeg);

  // Approximate longitude-based solar time difference: 15° longitude = 1 hour
  const dLng = destination.lng - origin.lng;
  const timeDifferenceHours = Math.round((dLng / 15) * 10) / 10;

  // Approximate target local time based on solar offset
  const now = new Date();
  const targetTimeEpoch = now.getTime() + timeDifferenceHours * 3600 * 1000;
  const targetDate = new Date(targetTimeEpoch);
  const targetLocalTimeString = targetDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    straightKm,
    straightMiles,
    straightNauticalMiles,
    bearingDeg,
    bearingCardinal,
    timeDifferenceHours,
    targetLocalTimeString,
  };
}

/**
 * Formats distance cleanly (e.g. "1,429.5 km")
 */
export function formatDistance(val: number, unit: 'km' | 'mi' | 'nm' = 'km'): string {
  const formatted = val >= 100 ? Math.round(val).toLocaleString() : val.toFixed(1);
  return `${formatted} ${unit}`;
}

/**
 * Formats duration milliseconds into human-readable string (e.g. "24 min", "2h 15m", "3d 4h")
 */
export function formatDuration(durationMillis: number): string {
  if (durationMillis <= 0) return '0 min';
  const totalSeconds = Math.round(durationMillis / 1000);
  const totalMinutes = Math.round(totalSeconds / 60);

  if (totalMinutes < 1) return '< 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;

  if (totalHours < 24) {
    return remMinutes > 0 ? `${totalHours}h ${remMinutes}m` : `${totalHours} hr`;
  }

  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days} days`;
}

/**
 * Formats arrival time given duration in milliseconds
 */
export function formatETA(durationMillis: number): string {
  if (durationMillis <= 0) return 'Arrived';
  const arrivalDate = new Date(Date.now() + durationMillis);
  const now = new Date();
  
  const timeStr = arrivalDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  const isToday = arrivalDate.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = arrivalDate.toDateString() === tomorrow.toDateString();

  if (isToday) return `ETA ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;

  const diffDays = Math.round((arrivalDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
  return `in ${diffDays} days (${timeStr})`;
}

/**
 * Calculate realistic fallback estimates for every medium based on straight-line distance
 */
export function computeFallbackMediumEstimates(straightKm: number) {
  // Road factor accounts for city turns and highway curves vs straight-line flight
  const roadFactor = 1.24;
  const estimatedRoadKm = Math.max(0.1, straightKm * roadFactor);

  // 1. Walking: 4.8 km/h
  const walkSpeed = 4.8;
  const walkHours = estimatedRoadKm / walkSpeed;
  const walkMillis = walkHours * 3600 * 1000;
  const walkCalories = Math.round(estimatedRoadKm * 62);

  // 2. Bicycling (Bike): 16 km/h
  const bikeSpeed = 16.0;
  const bikeHours = estimatedRoadKm / bikeSpeed;
  const bikeMillis = bikeHours * 3600 * 1000;
  const bikeCalories = Math.round(estimatedRoadKm * 32);

  // 3. Two-Wheeler / Scooter: ~38 km/h in city, up to 60 km/h
  const twoWheelerSpeed = straightKm < 15 ? 36 : straightKm < 50 ? 48 : 62;
  const twoWheelerHours = estimatedRoadKm / twoWheelerSpeed;
  const twoWheelerMillis = twoWheelerHours * 3600 * 1000;

  // 4. Driving (Car): ~45 km/h urban up to 85 km/h highways
  const driveSpeed = straightKm < 15 ? 35 : straightKm < 60 ? 55 : 82;
  const driveHours = estimatedRoadKm / driveSpeed;
  const driveMillis = driveHours * 3600 * 1000;

  // 5. Public Transit (Bus / Metro): ~26 km/h including stops & transfers
  const transitSpeed = 26;
  const transitHours = estimatedRoadKm / transitSpeed;
  const transitMillis = (transitHours * 3600 + 600) * 1000; // +10 min wait buffer

  // 6. Direct Flight: straightKm at 820 km/h + 35 min airport departure/arrival buffer
  const flightHours = straightKm / 820;
  const flightMillis = (flightHours * 3600 + (straightKm > 100 ? 2100 : 900)) * 1000;

  return {
    WALKING: {
      distanceMeters: Math.round(estimatedRoadKm * 1000),
      durationMillis: Math.round(walkMillis),
      caloriesBurned: walkCalories,
      speedKmh: walkSpeed,
    },
    BICYCLING: {
      distanceMeters: Math.round(estimatedRoadKm * 1000),
      durationMillis: Math.round(bikeMillis),
      caloriesBurned: bikeCalories,
      speedKmh: bikeSpeed,
    },
    TWO_WHEELER: {
      distanceMeters: Math.round(estimatedRoadKm * 1000),
      durationMillis: Math.round(twoWheelerMillis),
      speedKmh: twoWheelerSpeed,
    },
    DRIVING: {
      distanceMeters: Math.round(estimatedRoadKm * 1000),
      durationMillis: Math.round(driveMillis),
      speedKmh: driveSpeed,
    },
    TRANSIT: {
      distanceMeters: Math.round(estimatedRoadKm * 1000),
      durationMillis: Math.round(transitMillis),
      speedKmh: transitSpeed,
    },
    FLIGHT: {
      distanceMeters: Math.round(straightKm * 1000),
      durationMillis: Math.round(flightMillis),
      speedKmh: 820,
    },
  };
}
