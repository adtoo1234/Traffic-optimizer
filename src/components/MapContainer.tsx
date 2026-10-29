import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  Maximize2,
  Home,
  MapPin,
  Satellite,
  Map as MapIcon,
  Crosshair,
  Car,
  Footprints,
  Bike,
  Bus,
  Plane,
  Zap,
  Navigation,
} from 'lucide-react';
import {
  GpsLocation,
  SearchedLocation,
  TravelMode,
  MediumEstimate,
  LiveTrafficIntelligence,
  RoutePossibility,
} from '../types/gps';
import {
  generateGeodesicArc,
  calculateHaversineDistanceKm,
  formatDistance,
  formatDuration,
  formatETA,
} from '../utils/geo';

interface MapContainerProps {
  myLocation: GpsLocation | null;
  targetLocation: SearchedLocation | null;
  selectedTravelMode: TravelMode;
  onSelectTravelMode: (mode: TravelMode) => void;
  onMapClickLocation: (coords: { lat: number; lng: number }) => void;
  onSetHomeLocation: (coords: { lat: number; lng: number }) => void;
  onOriginDragEnd?: (coords: { lat: number; lng: number }) => void;
  onRouteComputed: (data: {
    distanceMeters?: number;
    durationMillis?: number;
    durationFormatted?: string;
    mode: TravelMode;
  } | null) => void;
  onMediumEstimateComputed?: (mode: TravelMode, estimate: Partial<MediumEstimate>) => void;
  shouldZoomToHouse?: boolean;
  onHouseZoomCompleted?: () => void;
  isPinningHome: boolean;
  onTogglePinningHome: (val: boolean) => void;
  isNavigationMode?: boolean;
  trafficIntel?: LiveTrafficIntelligence | null;
  selectedRoute?: RoutePossibility | null;
  recommendedRoute?: RoutePossibility | null;
  showShiningGreenBall?: boolean;
  onSelectRoute?: (routeId: string) => void;
}

const MODE_COLORS: Record<TravelMode, string> = {
  DRIVING: '#10b981',    // Emerald
  WALKING: '#f59e0b',    // Amber
  BICYCLING: '#06b6d4',  // Cyan
  TWO_WHEELER: '#a855f7',// Purple
  TRANSIT: '#3b82f6',    // Blue
  FLIGHT: '#38bdf8',     // Sky Blue
};

const MODE_ICONS: Record<TravelMode, React.ReactNode> = {
  DRIVING: <Car className="w-3.5 h-3.5" />,
  WALKING: <Footprints className="w-3.5 h-3.5" />,
  BICYCLING: <Bike className="w-3.5 h-3.5" />,
  TWO_WHEELER: <Zap className="w-3.5 h-3.5" />,
  TRANSIT: <Bus className="w-3.5 h-3.5" />,
  FLIGHT: <Plane className="w-3.5 h-3.5" />,
};

function interpolateAlongPoints(points: { lat: number; lng: number }[], progress: number): { lat: number; lng: number } {
  if (!points || points.length === 0) return { lat: 0, lng: 0 };
  if (points.length === 1) return points[0];

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const totalSegments = points.length - 1;
  const rawIdx = clampedProgress * totalSegments;
  const segIdx = Math.min(totalSegments - 1, Math.floor(rawIdx));
  const segProgress = rawIdx - segIdx;

  const p1 = points[segIdx];
  const p2 = points[segIdx + 1];

  return {
    lat: p1.lat + (p2.lat - p1.lat) * segProgress,
    lng: p1.lng + (p2.lng - p1.lng) * segProgress,
  };
}

export const MapContainer: React.FC<MapContainerProps> = ({
  myLocation,
  targetLocation,
  selectedTravelMode,
  onSelectTravelMode,
  onMapClickLocation,
  onSetHomeLocation,
  onOriginDragEnd,
  onRouteComputed,
  onMediumEstimateComputed,
  shouldZoomToHouse,
  onHouseZoomCompleted,
  isPinningHome,
  onTogglePinningHome,
  isNavigationMode = false,
  trafficIntel,
  selectedRoute,
  recommendedRoute,
  showShiningGreenBall = false,
  onSelectRoute,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const [mapTypeId, setMapTypeId] = useState<string>('roadmap');
  const [currentViewMode, setCurrentViewMode] = useState<'house' | 'both' | 'destination'>('house');
  const [ballProgress, setBallProgress] = useState(0);

  // Shining green ball animation loop along the recommended route
  useEffect(() => {
    if (!showShiningGreenBall || !recommendedRoute) return;
    const interval = setInterval(() => {
      setBallProgress((prev) => (prev >= 1 ? 0 : prev + 0.012));
    }, 60);
    return () => clearInterval(interval);
  }, [showShiningGreenBall, recommendedRoute]);

  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const geodesicPolylineRef = useRef<google.maps.Polyline | null>(null);
  const alternatePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const isInitialLoadRef = useRef(true);

  const clearLines = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    alternatePolylinesRef.current.forEach((p) => p.setMap(null));
    alternatePolylinesRef.current = [];
    if (geodesicPolylineRef.current) {
      geodesicPolylineRef.current.setMap(null);
      geodesicPolylineRef.current = null;
    }
  }, []);

  // Google Maps Traffic Layer: display real-time live traffic in sight
  useEffect(() => {
    if (!map) return;
    if (isNavigationMode) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(map);
    } else {
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
      }
    }
    return () => {
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
      }
    };
  }, [map, isNavigationMode]);

  // Zoom directly to user's house
  const zoomToMyHouse = useCallback(() => {
    if (!map || !myLocation) return;
    setCurrentViewMode('house');
    map.panTo(myLocation.coords);
    map.setZoom(19);
  }, [map, myLocation]);

  // Fit both locations in view
  const fitBothLocations = useCallback(() => {
    if (!map || !myLocation || !targetLocation) return;
    setCurrentViewMode('both');
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(myLocation.coords);
    bounds.extend(targetLocation.coords);
    map.fitBounds(bounds, { top: 70, right: 70, bottom: 70, left: 70 });
  }, [map, myLocation, targetLocation]);

  // Zoom to destination
  const zoomToDestination = useCallback(() => {
    if (!map || !targetLocation) return;
    setCurrentViewMode('destination');
    map.panTo(targetLocation.coords);
    map.setZoom(17);
  }, [map, targetLocation]);

  // Follow car position in navigation mode
  useEffect(() => {
    if (!map || !myLocation) return;
    if (isNavigationMode) {
      map.panTo(myLocation.coords);
    } else if (currentViewMode === 'house') {
      map.panTo(myLocation.coords);
      map.setZoom(19);
    }
  }, [map, myLocation?.coords.lat, myLocation?.coords.lng, currentViewMode, isNavigationMode]);

  // Handle triggered zoom to house from parent
  useEffect(() => {
    if (shouldZoomToHouse && map && myLocation && !isNavigationMode) {
      zoomToMyHouse();
      onHouseZoomCompleted?.();
    }
  }, [shouldZoomToHouse, map, myLocation, zoomToMyHouse, onHouseZoomCompleted, isNavigationMode]);

  // Background computation for all road mediums using Routes API
  useEffect(() => {
    if (!routesLib || !(routesLib as any).Route || !myLocation || !targetLocation) return;

    const origin = myLocation.coords;
    const destination = targetLocation.coords;
    const distanceKm = calculateHaversineDistanceKm(origin, destination);

    const modesToQuery: TravelMode[] = ['DRIVING', 'WALKING', 'BICYCLING', 'TWO_WHEELER', 'TRANSIT'];
    const filteredModes = modesToQuery.filter((m) => {
      if ((m === 'WALKING' || m === 'BICYCLING') && distanceKm > 1000) return false;
      return true;
    });

    filteredModes.forEach((mode) => {
      const request = {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: mode,
        fields: ['distanceMeters', 'durationMillis'],
      };

      (routesLib as any).Route.computeRoutes(request)
        .then(({ routes }: { routes: any[] }) => {
          if (routes && routes.length > 0) {
            const primary = routes[0];
            const dist = primary.distanceMeters ?? 0;
            const dur = primary.durationMillis ?? 0;
            const durFormatted = formatDuration(dur);
            const distFormatted = formatDistance(dist / 1000, 'km');

            onMediumEstimateComputed?.(mode, {
              mode,
              distanceMeters: dist,
              distanceFormatted: distFormatted,
              durationMillis: dur,
              durationFormatted: durFormatted,
              isRealRoute: true,
              etaFormatted: formatETA(dur),
            });
          }
        })
        .catch(() => {});
    });
  }, [routesLib, myLocation?.coords.lat, myLocation?.coords.lng, targetLocation?.coords.lat, targetLocation?.coords.lng, onMediumEstimateComputed]);

  // Primary Route and Alternate Routes rendering (Always Blued & Perfectly Highlighted)
  useEffect(() => {
    if (!map) return;
    clearLines();

    if (!myLocation || !targetLocation) {
      onRouteComputed(null);
      return;
    }

    const origin = myLocation.coords;
    const destination = targetLocation.coords;

    // Draw geodesic arc for flight or general path
    const arcPoints = generateGeodesicArc(origin, destination, 60);
    const geodesicLine = new google.maps.Polyline({
      path: arcPoints,
      geodesic: true,
      strokeColor: MODE_COLORS[selectedTravelMode] || '#38bdf8',
      strokeOpacity: selectedTravelMode === 'FLIGHT' ? 0.9 : 0.25,
      strokeWeight: selectedTravelMode === 'FLIGHT' ? 4 : 2,
      map: map,
    });
    geodesicPolylineRef.current = geodesicLine;

    // 1. Draw ALL Alternate Routes in distinct Blue shades (Blued & Highlighted)
    const alternateRoutesList = trafficIntel?.alternateRoutes.filter(
      (r) => r.waypoints && r.waypoints.length > 0
    ) || [];

    alternateRoutesList.forEach((alt) => {
      const isSelected = selectedRoute?.id === alt.id;

      // Dark blue/navy casing line for high contrast
      const casing = new google.maps.Polyline({
        path: alt.waypoints!,
        geodesic: true,
        strokeColor: isSelected ? '#0f172a' : '#1e3a8a',
        strokeWeight: isSelected ? 9 : 7,
        strokeOpacity: isSelected ? 0.9 : 0.65,
        zIndex: isSelected ? 40 : 20,
        clickable: true,
        map: map,
      });

      // Core BLUED polyline: Vibrant Royal Blue when selected (#2563eb), clear crisp Navigation Blue when unselected (#3b82f6)
      const blueStrokeColor = isSelected
        ? '#2563eb'
        : (alt.color || '#3b82f6');

      const core = new google.maps.Polyline({
        path: alt.waypoints!,
        geodesic: true,
        strokeColor: blueStrokeColor,
        strokeWeight: isSelected ? 6.5 : 4.5,
        strokeOpacity: isSelected ? 1.0 : 0.85,
        zIndex: isSelected ? 45 : 25,
        clickable: true,
        map: map,
      });

      casing.addListener('click', () => {
        onSelectRoute?.(alt.id);
      });
      core.addListener('click', () => {
        onSelectRoute?.(alt.id);
      });

      alternatePolylinesRef.current.push(casing, core);
    });

    // If FLIGHT is selected
    if (selectedTravelMode === 'FLIGHT') {
      const straightKm = calculateHaversineDistanceKm(origin, destination);
      const flightHours = straightKm / 820;
      const flightMillis = (flightHours * 3600 + (straightKm > 100 ? 2100 : 900)) * 1000;

      onRouteComputed({
        distanceMeters: Math.round(straightKm * 1000),
        durationMillis: Math.round(flightMillis),
        durationFormatted: formatDuration(flightMillis),
        mode: 'FLIGHT',
      });
      return;
    }

    // View mode fitting in non-navigation mode
    if (!isNavigationMode) {
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        zoomToMyHouse();
      } else if (currentViewMode === 'both') {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(destination);
        alternateRoutesList.forEach((alt) => {
          alt.waypoints?.forEach((p) => bounds.extend(p));
        });
        map.fitBounds(bounds, { top: 70, right: 70, bottom: 70, left: 70 });
      }
    }

    // Compute Primary route path via Routes API
    if (routesLib && (routesLib as any).Route) {
      const request = {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: selectedTravelMode,
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
      };

      (routesLib as any).Route.computeRoutes(request)
        .then(({ routes }: { routes: any[] }) => {
          if (!routes || routes.length === 0) {
            onRouteComputed(null);
            return;
          }

          const primary = routes[0];

          if (geodesicPolylineRef.current) {
            geodesicPolylineRef.current.setMap(null);
          }

          const isPrimarySelected = !selectedRoute || selectedRoute.id === 'current-route';

          // When primary is active: show prominent red (if congested in nav mode) or travel mode color
          // When alternate route is active: dim primary route to secondary slate (#64748b)
          const primaryColor = !isPrimarySelected
            ? '#64748b'
            : isNavigationMode && trafficIntel?.hasCongestionAhead
            ? '#ef4444' // congested red
            : MODE_COLORS[selectedTravelMode] || '#10b981';

          const primaryWeight = isPrimarySelected ? 6.5 : 4.5;
          const primaryOpacity = isPrimarySelected ? 0.95 : 0.6;
          const primaryZIndex = isPrimarySelected ? 35 : 15;

          const newPolylines = primary.createPolylines();
          newPolylines.forEach((p: google.maps.Polyline) => {
            p.setOptions({
              strokeColor: primaryColor,
              strokeWeight: primaryWeight,
              strokeOpacity: primaryOpacity,
              zIndex: primaryZIndex,
              clickable: true,
            });
            p.addListener('click', () => {
              onSelectRoute?.('current-route');
            });
            p.setMap(map);
          });
          polylinesRef.current = newPolylines;

          const durationFormatted = primary.durationMillis
            ? formatDuration(primary.durationMillis)
            : '';

          onRouteComputed({
            distanceMeters: primary.distanceMeters,
            durationMillis: primary.durationMillis,
            durationFormatted,
            mode: selectedTravelMode,
          });

          // Fit bounds depending on selection
          if (isNavigationMode) {
            if (selectedRoute?.waypoints && selectedRoute.id !== 'current-route') {
              const bounds = new google.maps.LatLngBounds();
              selectedRoute.waypoints.forEach((pt) => bounds.extend(pt));
              map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 450 });
            } else if (primary.viewport) {
              map.fitBounds(primary.viewport, { top: 80, right: 80, bottom: 80, left: 460 });
            }
          }
        })
        .catch(() => {
          onRouteComputed(null);
        });
    }

    return () => {
      clearLines();
    };
  }, [
    map,
    routesLib,
    myLocation,
    targetLocation,
    selectedTravelMode,
    isNavigationMode,
    selectedRoute,
    trafficIntel,
    clearLines,
    onRouteComputed,
    currentViewMode,
    zoomToMyHouse,
    onSelectRoute,
  ]);

  // Map Click Handler
  const handleMapClick = (e: MapMouseEvent) => {
    if (isNavigationMode) return; // disable during active navigation
    if (e.detail?.latLng) {
      const clickedCoords = {
        lat: e.detail.latLng.lat,
        lng: e.detail.latLng.lng,
      };

      if (isPinningHome) {
        onSetHomeLocation(clickedCoords);
        onTogglePinningHome(false);
        if (map) {
          map.panTo(clickedCoords);
          map.setZoom(19);
        }
      } else {
        onMapClickLocation(clickedCoords);
      }
    }
  };

  const handleMarkerDragEnd = (e: google.maps.MapMouseEvent) => {
    if (e.latLng && onOriginDragEnd && !isNavigationMode) {
      const newCoords = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng(),
      };
      onOriginDragEnd(newCoords);
      if (map) {
        map.panTo(newCoords);
        map.setZoom(19);
      }
    }
  };

  const defaultCenter = myLocation ? myLocation.coords : { lat: 28.6139, lng: 77.209 };

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden flex flex-col">
      {/* Non-navigation Header controls */}
      {!isNavigationMode && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-3 py-2 z-10 flex flex-wrap items-center justify-between gap-2 backdrop-blur-md">
          <div className="flex items-center flex-wrap gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={zoomToMyHouse}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                currentViewMode === 'house'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Zoom directly into your building rooftop and local roads (Level 19)"
            >
              <Home className="w-3.5 h-3.5 text-blue-300" />
              <span>My House (Zoom 19)</span>
            </button>

            <button
              type="button"
              onClick={() => onTogglePinningHome(!isPinningHome)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                isPinningHome
                  ? 'bg-amber-500 text-slate-950 animate-pulse shadow-md'
                  : 'text-amber-400 hover:text-amber-300 hover:bg-slate-800'
              }`}
              title="Click on the map directly on your house to pin your exact location"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{isPinningHome ? 'Click House on Map...' : 'Pin My House on Map'}</span>
            </button>

            <button
              type="button"
              onClick={fitBothLocations}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                currentViewMode === 'both'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Show full distance route connecting both locations"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Route (Both)</span>
            </button>

            <button
              type="button"
              onClick={zoomToDestination}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                currentViewMode === 'destination'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Zoom to Destination"
            >
              <MapPin className="w-3.5 h-3.5 text-rose-300" />
              <span>Destination</span>
            </button>
          </div>

          {/* Map style toggle */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setMapTypeId('roadmap')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                mapTypeId === 'roadmap'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Roadmap</span>
            </button>
            <button
              type="button"
              onClick={() => setMapTypeId('hybrid')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                mapTypeId === 'hybrid'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Satellite className="w-3.5 h-3.5" />
              <span>Satellite</span>
            </button>
          </div>
        </div>
      )}

      {/* In Navigation Mode: Top Floating Traffic Beacon */}
      {isNavigationMode && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-700/80 shadow-2xl">
          <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <span>Live Traffic Layer Active</span>
          </span>
        </div>
      )}

      {/* The Google Map */}
      <div className="relative flex-1 w-full h-full">
        <Map
          mapId="DEMO_MAP_ID"
          defaultCenter={defaultCenter}
          defaultZoom={isNavigationMode ? 16 : 19}
          maxZoom={21}
          minZoom={2}
          gestureHandling="greedy"
          mapTypeId={mapTypeId}
          onClick={handleMapClick}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          className={`w-full h-full ${isPinningHome ? 'cursor-crosshair' : ''}`}
        >
          {/* User Marker: If in navigation mode, displays dynamic live car/vehicle navigation marker */}
          {myLocation && (
            <AdvancedMarker
              position={myLocation.coords}
              title={isNavigationMode ? 'Your Vehicle (Live Tracking)' : 'Your House (Drag to place)'}
              draggable={!isNavigationMode}
              onDragEnd={handleMarkerDragEnd}
            >
              {isNavigationMode ? (
                <div className="flex flex-col items-center">
                  <div className="relative flex items-center justify-center">
                    <span className="absolute w-12 h-12 rounded-full bg-emerald-500/40 animate-ping" />
                    <div className="relative w-10 h-10 rounded-full bg-emerald-600 border-2 border-white shadow-2xl flex items-center justify-center text-white">
                      <Navigation
                        className="w-5 h-5 fill-white transform"
                        style={{
                          transform: myLocation.heading
                            ? `rotate(${myLocation.heading}deg)`
                            : 'rotate(0deg)',
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-1 bg-slate-900/95 border border-emerald-400 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-xl whitespace-nowrap">
                    Live GPS • {myLocation.speed ?? 0} km/h
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center group cursor-grab active:cursor-grabbing">
                  <div className="relative flex items-center justify-center">
                    <span className="absolute w-14 h-14 rounded-full bg-blue-500/40 animate-ping pointer-events-none" />
                    <div className="relative w-11 h-11 rounded-full bg-blue-600 border-2 border-white shadow-2xl flex items-center justify-center text-white text-xs font-black">
                      🏠 You
                    </div>
                  </div>
                  <div className="mt-1 bg-slate-900/95 border border-blue-400/70 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-2xl whitespace-nowrap flex items-center gap-1.5 backdrop-blur-md">
                    <span>{myLocation.addressDetails?.colony || myLocation.name || 'Your House'}</span>
                    {myLocation.addressDetails?.pincode && (
                      <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                        {myLocation.addressDetails.pincode}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </AdvancedMarker>
          )}

          {/* Target Destination Marker */}
          {targetLocation && (
            <AdvancedMarker
              position={targetLocation.coords}
              title={targetLocation.formattedAddress || targetLocation.name}
            >
              <div className="flex flex-col items-center group cursor-pointer">
                <Pin background="#e11d48" borderColor="#ffffff" glyphColor="#ffffff" scale={1.2} />
                <div className="mt-1 bg-slate-900/95 border border-rose-500/50 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-xl whitespace-nowrap flex items-center gap-1">
                  <span>{targetLocation.name}</span>
                </div>
              </div>
            </AdvancedMarker>
          )}

          {/* Traffic Bottleneck Markers when in Navigation mode */}
          {isNavigationMode &&
            trafficIntel?.activeBottlenecks.map((bottleneck) => (
              <AdvancedMarker
                key={bottleneck.id}
                position={bottleneck.coords}
                title={`Traffic Bottleneck: ${bottleneck.locationName}`}
              >
                <div className="flex flex-col items-center">
                  <div className="relative flex items-center justify-center">
                    <span className="w-8 h-8 rounded-full bg-rose-600/60 animate-ping absolute" />
                    <div className="w-8 h-8 rounded-full bg-rose-600 border-2 border-white shadow-2xl flex items-center justify-center text-white text-xs font-black">
                      ⚠️
                    </div>
                  </div>
                  <div className="mt-1 bg-slate-950/95 border border-rose-500/80 px-2 py-0.5 rounded text-[10px] font-bold text-rose-300 shadow-2xl whitespace-nowrap">
                    +{bottleneck.delayMinutes}m delay • Clears ~{bottleneck.clearanceTimeMinutes}m
                  </div>
                </div>
              </AdvancedMarker>
            ))}

          {/* SHINING GREEN BALL ON RECOMMENDED ROUTE */}
          {showShiningGreenBall && recommendedRoute && recommendedRoute.waypoints && recommendedRoute.waypoints.length > 0 && (
            <AdvancedMarker
              position={interpolateAlongPoints(recommendedRoute.waypoints, ballProgress)}
              title="Recommended Best Route: Shining Green Beacon"
            >
              <div className="relative flex items-center justify-center pointer-events-none -translate-x-1/2 -translate-y-1/2">
                {/* Outward pulsating neon ring */}
                <span className="w-16 h-16 rounded-full bg-emerald-400/40 animate-ping absolute" />
                {/* Secondary emerald aura */}
                <span className="w-10 h-10 rounded-full bg-emerald-400/60 blur-[3px] absolute animate-pulse" />
                {/* Core Shining Green Ball */}
                <div className="relative w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-400 to-teal-100 shadow-[0_0_25px_#10b981,0_0_50px_#34d399,0_0_12px_#ffffff] border-2 border-white flex items-center justify-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-white shadow-md animate-pulse" />
                </div>
              </div>
            </AdvancedMarker>
          )}

          {/* Recommended Route Apex Highlight Badge */}
          {showShiningGreenBall && recommendedRoute && recommendedRoute.waypoints && recommendedRoute.waypoints.length > 2 && (
            <AdvancedMarker
              position={recommendedRoute.waypoints[Math.floor(recommendedRoute.waypoints.length / 2)]}
            >
              <div className="bg-slate-950/95 border-2 border-emerald-400 text-white text-[11px] font-black px-3 py-1 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.7)] flex items-center gap-1.5 whitespace-nowrap animate-bounce">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981]" />
                <span>Recommended Best Route • Saves {recommendedRoute.timeSavedMinutes}m</span>
              </div>
            </AdvancedMarker>
          )}

          {/* INTERACTIVE APEX BADGES FOR ALL ALTERNATE ROUTES (BLUED & HIGHLIGHTED) */}
          {trafficIntel?.alternateRoutes
            .filter((r) => r.waypoints && r.waypoints.length > 0)
            .map((alt) => {
              const isSelected = selectedRoute?.id === alt.id;
              const midIdx = Math.floor(alt.waypoints!.length / 2);
              const apexPos = alt.waypoints![midIdx];

              return (
                <AdvancedMarker
                  key={`alt-apex-${alt.id}`}
                  position={apexPos}
                  title={`${alt.name} - Click to select route`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRoute?.(alt.id);
                    }}
                    className={`group flex items-center gap-1.5 px-3 py-1 rounded-full shadow-2xl transition-all duration-150 cursor-pointer active:scale-95 border ${
                      isSelected
                        ? 'bg-blue-600 border-white text-white shadow-[0_0_20px_rgba(37,99,235,0.85)] ring-2 ring-blue-400 font-black scale-105'
                        : 'bg-slate-950/95 hover:bg-blue-950 border-blue-500/90 hover:border-blue-300 text-blue-200 hover:text-white font-bold hover:scale-105 shadow-blue-950/50'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected
                          ? 'bg-white shadow-[0_0_8px_#ffffff] animate-pulse'
                          : 'bg-blue-400 group-hover:bg-blue-300'
                      }`}
                    />
                    <span className="text-xs whitespace-nowrap">
                      {alt.name}
                    </span>
                    {alt.timeSavedMinutes > 0 ? (
                      <span
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-blue-800 text-white'
                            : 'bg-blue-600/30 text-blue-300 border border-blue-400/40'
                        }`}
                      >
                        -{alt.timeSavedMinutes}m
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">
                        {alt.durationFormatted}
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[9px] bg-emerald-400 text-slate-950 font-black px-1.5 py-0.2 rounded uppercase tracking-wider ml-0.5">
                        Active
                      </span>
                    )}
                  </button>
                </AdvancedMarker>
              );
            })}

          {/* Midpoint Distance Label in standard comparison view */}
          {!isNavigationMode && myLocation && targetLocation && currentViewMode === 'both' && (
            <AdvancedMarker
              position={{
                lat: (myLocation.coords.lat + targetLocation.coords.lat) / 2,
                lng: (myLocation.coords.lng + targetLocation.coords.lng) / 2,
              }}
            >
              <div className="bg-slate-900/95 border border-sky-400 text-sky-300 text-xs font-bold px-3 py-1 rounded-full shadow-2xl pointer-events-none backdrop-blur-md">
                {formatDistance(
                  calculateHaversineDistanceKm(myLocation.coords, targetLocation.coords),
                  'km'
                )}
              </div>
            </AdvancedMarker>
          )}
        </Map>
      </div>
    </div>
  );
};
