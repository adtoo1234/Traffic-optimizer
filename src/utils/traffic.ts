import { Coordinates, TrafficBottleneck, RoutePossibility, LiveTrafficIntelligence, TravelMode } from '../types/gps';
import { calculateHaversineDistanceKm, formatDistance, formatDuration } from './geo';

/**
 * Computes live traffic congestion in sight and alternative route simulations for saving time
 */
export function generateTrafficIntelligence(
  origin: Coordinates,
  destination: Coordinates,
  travelMode: TravelMode,
  baseDistanceKm: number,
  baseDurationMinutes: number
): LiveTrafficIntelligence {
  const straightKm = calculateHaversineDistanceKm(origin, destination);
  const isFar = straightKm > 50;

  // Walking and Flight don't encounter vehicular road gridlock
  if (travelMode === 'WALKING' || travelMode === 'FLIGHT') {
    return {
      hasCongestionAhead: false,
      overallCongestionLevel: 'free',
      totalDelayMinutes: 0,
      clearanceForecastMinutes: 0,
      activeBottlenecks: [],
      alternateRoutes: [
        {
          id: 'primary',
          name: 'Primary Path',
          via: travelMode === 'WALKING' ? 'Pedestrian Walkway' : 'Direct Air Corridor',
          durationMinutes: baseDurationMinutes,
          durationFormatted: formatDuration(baseDurationMinutes * 60 * 1000),
          distanceKm: baseDistanceKm,
          distanceFormatted: formatDistance(baseDistanceKm, 'km'),
          timeSavedMinutes: 0,
          isRecommended: true,
          trafficLevel: 'low',
          avoidedBottlenecks: 0,
          color: travelMode === 'WALKING' ? '#f59e0b' : '#38bdf8',
          description: 'Optimal standard line',
        },
      ],
      selectedRouteId: 'primary',
    };
  }

  // Calculate midpoints along the route vector
  const dLat = destination.lat - origin.lat;
  const dLng = destination.lng - origin.lng;

  // Bottleneck 1: ~35% of the route ahead
  const b1Coords: Coordinates = {
    lat: origin.lat + dLat * 0.35 + 0.002,
    lng: origin.lng + dLng * 0.35 - 0.003,
  };
  const b1DistanceKm = Math.max(0.8, Math.round(straightKm * 0.35 * 10) / 10);
  const b1DelayMin = Math.max(4, Math.min(18, Math.round(baseDurationMinutes * 0.28)));
  const b1ClearanceMin = Math.round(b1DelayMin * 1.6 + 5); // Time it takes for traffic to get over / clear

  // Bottleneck 2: ~70% of the route ahead (if distance > 6 km)
  const bottlenecks: TrafficBottleneck[] = [
    {
      id: 'bottleneck-1',
      locationName: isFar ? 'Expressway Toll & Interchange Junction' : 'Main Arterial Flyover & Central Crossing',
      coords: b1Coords,
      distanceAheadKm: b1DistanceKm,
      delayMinutes: b1DelayMin,
      severity: 'heavy',
      clearanceTimeMinutes: b1ClearanceMin,
      currentSpeedKmh: 14,
      freeFlowSpeedKmh: 52,
      description: 'Severe vehicle tailback due to lane narrowing and high vehicle density',
    },
  ];

  if (straightKm > 6) {
    const b2Coords: Coordinates = {
      lat: origin.lat + dLat * 0.72 - 0.003,
      lng: origin.lng + dLng * 0.72 + 0.002,
    };
    const b2DistanceKm = Math.round(straightKm * 0.72 * 10) / 10;
    const b2DelayMin = Math.max(3, Math.min(10, Math.round(baseDurationMinutes * 0.16)));
    const b2ClearanceMin = Math.round(b2DelayMin * 1.4 + 4);

    bottlenecks.push({
      id: 'bottleneck-2',
      locationName: isFar ? 'Sector Ring Road Merge' : 'Downtown Commercial Market Crossroad',
      coords: b2Coords,
      distanceAheadKm: b2DistanceKm,
      delayMinutes: b2DelayMin,
      severity: 'moderate',
      clearanceTimeMinutes: b2ClearanceMin,
      currentSpeedKmh: 24,
      freeFlowSpeedKmh: 48,
      description: 'Slow-moving stop-and-go queue; expected bottleneck during peak movement',
    });
  }

  const totalDelayMinutes = bottlenecks.reduce((acc, b) => acc + b.delayMinutes, 0);
  // Overall traffic clearance time is approximately maximum clearance of the active bottlenecks + buffer
  const clearanceForecastMinutes = Math.max(...bottlenecks.map((b) => b.clearanceTimeMinutes));

  // Generate 3 Route Possibilities (Primary + 2 Time-Saving Alternatives)
  // Route 1: Current Route (affected by the traffic delay)
  const currentDurationMin = Math.round(baseDurationMinutes + totalDelayMinutes * 0.6);

  // Route 2: Express Bypass (Slightly longer distance, but bypasses bottleneck 1, saving significant time!)
  const bypassDistanceKm = Math.round((baseDistanceKm * 1.08) * 10) / 10;
  const timeSavedBypass = Math.max(5, Math.min(22, Math.round(totalDelayMinutes * 0.75)));
  const bypassDurationMin = Math.max(3, currentDurationMin - timeSavedBypass);

  // Waypoints for Route 2 (curving outward away from bottleneck 1)
  const bypassWaypoints: Coordinates[] = [
    origin,
    {
      lat: origin.lat + dLat * 0.3 + (dLng > 0 ? 0.015 : -0.015),
      lng: origin.lng + dLng * 0.3 + (dLat > 0 ? -0.015 : 0.015),
    },
    {
      lat: origin.lat + dLat * 0.65 + (dLng > 0 ? 0.012 : -0.012),
      lng: origin.lng + dLng * 0.65 + (dLat > 0 ? -0.012 : 0.012),
    },
    destination,
  ];

  // Route 3: Service Arterial / Inner Corridor (Avoids downtown bottleneck)
  const serviceDistanceKm = Math.round((baseDistanceKm * 0.98) * 10) / 10;
  const timeSavedService = Math.max(2, Math.min(10, Math.round(totalDelayMinutes * 0.38)));
  const serviceDurationMin = Math.max(3, currentDurationMin - timeSavedService);

  const serviceWaypoints: Coordinates[] = [
    origin,
    {
      lat: origin.lat + dLat * 0.45 - (dLng > 0 ? 0.01 : -0.01),
      lng: origin.lng + dLng * 0.45 - (dLat > 0 ? -0.01 : 0.01),
    },
    destination,
  ];

  const alternateRoutes: RoutePossibility[] = [
    {
      id: 'current-route',
      name: 'Current Path (Direct Road)',
      via: isFar ? 'via National Highway (Congested)' : 'via Central Avenue / Main Road',
      durationMinutes: currentDurationMin,
      durationFormatted: formatDuration(currentDurationMin * 60 * 1000),
      distanceKm: baseDistanceKm,
      distanceFormatted: formatDistance(baseDistanceKm, 'km'),
      timeSavedMinutes: 0,
      isRecommended: false,
      trafficLevel: totalDelayMinutes > 10 ? 'heavy' : 'moderate',
      avoidedBottlenecks: 0,
      color: '#ef4444', // Red/Orange for congested current
      description: `Includes +${totalDelayMinutes} min traffic delay. Clearing in ~${clearanceForecastMinutes} mins.`,
    },
    {
      id: 'bypass-express',
      name: 'Outer Bypass Corridor (Fastest)',
      via: isFar ? 'via Peripheral Ring Road Bypass' : 'via Elevated Expressway Link',
      durationMinutes: bypassDurationMin,
      durationFormatted: formatDuration(bypassDurationMin * 60 * 1000),
      distanceKm: bypassDistanceKm,
      distanceFormatted: formatDistance(bypassDistanceKm, 'km'),
      timeSavedMinutes: timeSavedBypass,
      isRecommended: true,
      trafficLevel: 'low',
      avoidedBottlenecks: bottlenecks.length,
      waypoints: bypassWaypoints,
      color: '#2563eb', // Vibrant Royal Blue (blued alternate route)
      description: `Bypasses ${bottlenecks[0]?.locationName || 'main gridlock'} entirely. Free-flowing traffic.`,
    },
    {
      id: 'arterial-link',
      name: 'Parallel Sector Road',
      via: 'via Sector Border Road & Greenway',
      durationMinutes: serviceDurationMin,
      durationFormatted: formatDuration(serviceDurationMin * 60 * 1000),
      distanceKm: serviceDistanceKm,
      distanceFormatted: formatDistance(serviceDistanceKm, 'km'),
      timeSavedMinutes: timeSavedService,
      isRecommended: false,
      trafficLevel: 'moderate',
      avoidedBottlenecks: 1,
      waypoints: serviceWaypoints,
      color: '#0284c7', // Ocean / Sky Blue (blued alternate route)
      description: 'Moderate traffic with fewer traffic lights and steady movement.',
    },
  ];

  return {
    hasCongestionAhead: true,
    overallCongestionLevel: totalDelayMinutes > 12 ? 'severe' : totalDelayMinutes > 6 ? 'congested' : 'moderate',
    totalDelayMinutes,
    clearanceForecastMinutes,
    activeBottlenecks: bottlenecks,
    alternateRoutes,
    selectedRouteId: 'current-route',
  };
}
