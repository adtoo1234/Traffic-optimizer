/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useGeolocation } from './hooks/useGeolocation';
import {
  SearchedLocation,
  DistanceMetrics,
  GpsLocation,
  TravelSession,
  TravelMode,
  MediumEstimate,
  LiveTrafficIntelligence,
} from './types/gps';
import {
  computeDistanceMetrics,
  calculateHaversineDistanceKm,
  computeFallbackMediumEstimates,
  formatDistance,
  formatDuration,
  formatETA,
} from './utils/geo';
import { reverseGeocodeLocation } from './utils/geocoding';
import { generateTrafficIntelligence } from './utils/traffic';
import { GpsStatusHeader } from './components/GpsStatusHeader';
import { PlaceSearch } from './components/PlaceSearch';
import { DistanceCard } from './components/DistanceCard';
import { MapContainer } from './components/MapContainer';
import { LiveNavigationHud, SidebarMode } from './components/LiveNavigationHud';
import {
  ArrowDownUp,
  Crosshair,
  Home,
  MapPin,
  HelpCircle,
  Play,
  Pause,
  Map as MapIcon,
  Gauge,
  X,
  Navigation,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';

const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ||
  'AIzaSyDFeLXZ-qLrrHxAIXi6ITpS330VYS2PXQY';

export default function App() {
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuota = () => setIsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  const {
    location: physicalGpsLocation,
    isAcquiring,
    requestGpsPosition,
    startLiveTracking,
    stopLiveTracking,
  } = useGeolocation();

  // Custom or GPS location for "Your Location"
  const [customOrigin, setCustomOrigin] = useState<SearchedLocation | null>(null);
  const [shouldZoomToHouse, setShouldZoomToHouse] = useState(true);
  const [isPinningHome, setIsPinningHome] = useState(false);
  const [showCoordInput, setShowCoordInput] = useState(false);
  const [coordInputValue, setCoordInputValue] = useState('');

  // Selected Travel Mode Medium (WALKING, BICYCLING, DRIVING, TWO_WHEELER, TRANSIT, FLIGHT)
  const [selectedTravelMode, setSelectedTravelMode] = useState<TravelMode>('DRIVING');

  // Alternative route selection state
  const [selectedRouteId, setSelectedRouteId] = useState<string>('current-route');
  const [isSimulatingDrive, setIsSimulatingDrive] = useState<boolean>(false);
  const [simulatedProgress, setSimulatedProgress] = useState<number>(0);
  const initialOriginCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Sidebar sizing state (allows user to shrink stats and maximize map size)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('expanded');
  const [sidebarWidth, setSidebarWidth] = useState<number>(440);

  // Mobile navigation HUD state: floating small boxes vs optional full stats sheet
  const [isBestRouteBoxMinimized, setIsBestRouteBoxMinimized] = useState<boolean>(false);
  const [showMobileStatsModal, setShowMobileStatsModal] = useState<boolean>(false);

  // Start Travel Session State
  const [travelSession, setTravelSession] = useState<TravelSession>({
    isActive: false,
    isPaused: false,
    startedAt: null,
    travelMode: 'DRIVING',
    elapsedSeconds: 0,
    currentSpeedKmh: 0,
  });

  // Trip Elapsed Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (travelSession.isActive && !travelSession.isPaused) {
      interval = setInterval(() => {
        setTravelSession((prev) => ({
          ...prev,
          elapsedSeconds: prev.elapsedSeconds + 1,
        }));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [travelSession.isActive, travelSession.isPaused]);

  // Active Origin: custom if set by user, otherwise physical GPS location
  const activeOrigin: GpsLocation | null = useMemo(() => {
    if (customOrigin) {
      return {
        coords: customOrigin.coords,
        name: customOrigin.name,
        address: customOrigin.formattedAddress,
        addressDetails: customOrigin.addressDetails,
        isSimulated: true,
        speed: travelSession.isActive ? travelSession.currentSpeedKmh || 42 : 0,
      };
    }
    return physicalGpsLocation;
  }, [customOrigin, physicalGpsLocation, travelSession.isActive, travelSession.currentSpeedKmh]);

  // Destination location
  const [destination, setDestination] = useState<SearchedLocation | null>({
    id: 'tokyo-tower',
    name: 'Tokyo Tower',
    formattedAddress: '4 Chome-2-8 Shibakoen, Minato City, Tokyo 105-0011, Japan',
    coords: { lat: 35.6586, lng: 139.7454 },
    addressDetails: {
      colony: 'Shibakoen',
      pincode: '105-0011',
      locality: 'Minato City',
      state: 'Tokyo',
      country: 'Japan',
      formattedAddress: '4 Chome-2-8 Shibakoen, Minato City, Tokyo 105-0011, Japan',
    },
    addedAt: Date.now(),
  });

  // Active route data for the selected medium
  const [routeData, setRouteData] = useState<{
    distanceMeters?: number;
    durationMillis?: number;
    durationFormatted?: string;
    mode: TravelMode;
  } | null>(null);

  // Live medium estimates computed by Routes API
  const [liveMediumEstimates, setLiveMediumEstimates] = useState<
    Partial<Record<TravelMode, MediumEstimate>>
  >({});

  // Reset live medium estimates whenever origin or destination changes
  useEffect(() => {
    setLiveMediumEstimates({});
    setRouteData(null);
    setSelectedRouteId('current-route');
  }, [activeOrigin?.coords.lat, activeOrigin?.coords.lng, destination?.coords.lat, destination?.coords.lng]);

  // Handle live computation callback from MapContainer
  const handleMediumEstimateComputed = useCallback(
    (mode: TravelMode, estimate: Partial<MediumEstimate>) => {
      setLiveMediumEstimates((prev) => ({
        ...prev,
        [mode]: {
          ...(prev[mode] as MediumEstimate),
          ...estimate,
        } as MediumEstimate,
      }));
    },
    []
  );

  // Convert activeOrigin to SearchedLocation format for the PlaceSearch input display
  const originAsSearchedLocation: SearchedLocation | null = useMemo(() => {
    if (!activeOrigin) return null;
    return {
      id: 'origin',
      name: activeOrigin.name || 'Your Location',
      formattedAddress: activeOrigin.address || '',
      coords: activeOrigin.coords,
      addressDetails: activeOrigin.addressDetails,
      addedAt: Date.now(),
    };
  }, [activeOrigin]);

  // Baseline fallback estimates for every medium (available immediately)
  const baselineMediumEstimates = useMemo<Record<TravelMode, MediumEstimate> | null>(() => {
    if (!activeOrigin || !destination) return null;
    const straightKm = calculateHaversineDistanceKm(activeOrigin.coords, destination.coords);
    const fallbacks = computeFallbackMediumEstimates(straightKm);

    return {
      WALKING: {
        mode: 'WALKING',
        label: 'Walk',
        subLabel: 'Pedestrian',
        durationMillis: fallbacks.WALKING.durationMillis,
        durationFormatted: formatDuration(fallbacks.WALKING.durationMillis),
        distanceMeters: fallbacks.WALKING.distanceMeters,
        distanceFormatted: formatDistance(fallbacks.WALKING.distanceMeters / 1000, 'km'),
        isRealRoute: false,
        etaFormatted: formatETA(fallbacks.WALKING.durationMillis),
        tag: `~${fallbacks.WALKING.caloriesBurned} kcal • Zero CO₂`,
        caloriesBurned: fallbacks.WALKING.caloriesBurned,
        speedKmh: fallbacks.WALKING.speedKmh,
      },
      BICYCLING: {
        mode: 'BICYCLING',
        label: 'Bike',
        subLabel: 'Bicycle',
        durationMillis: fallbacks.BICYCLING.durationMillis,
        durationFormatted: formatDuration(fallbacks.BICYCLING.durationMillis),
        distanceMeters: fallbacks.BICYCLING.distanceMeters,
        distanceFormatted: formatDistance(fallbacks.BICYCLING.distanceMeters / 1000, 'km'),
        isRealRoute: false,
        etaFormatted: formatETA(fallbacks.BICYCLING.durationMillis),
        tag: `~${fallbacks.BICYCLING.caloriesBurned} kcal • Eco`,
        caloriesBurned: fallbacks.BICYCLING.caloriesBurned,
        speedKmh: fallbacks.BICYCLING.speedKmh,
      },
      TWO_WHEELER: {
        mode: 'TWO_WHEELER',
        label: '2-Wheeler',
        subLabel: 'Scooter / Bike',
        durationMillis: fallbacks.TWO_WHEELER.durationMillis,
        durationFormatted: formatDuration(fallbacks.TWO_WHEELER.durationMillis),
        distanceMeters: fallbacks.TWO_WHEELER.distanceMeters,
        distanceFormatted: formatDistance(fallbacks.TWO_WHEELER.distanceMeters / 1000, 'km'),
        isRealRoute: false,
        etaFormatted: formatETA(fallbacks.TWO_WHEELER.durationMillis),
        tag: 'Fast in traffic',
        speedKmh: fallbacks.TWO_WHEELER.speedKmh,
      },
      DRIVING: {
        mode: 'DRIVING',
        label: 'Drive',
        subLabel: 'Car / Cab',
        durationMillis: fallbacks.DRIVING.durationMillis,
        durationFormatted: formatDuration(fallbacks.DRIVING.durationMillis),
        distanceMeters: fallbacks.DRIVING.distanceMeters,
        distanceFormatted: formatDistance(fallbacks.DRIVING.distanceMeters / 1000, 'km'),
        isRealRoute: false,
        etaFormatted: formatETA(fallbacks.DRIVING.durationMillis),
        tag: 'Standard Road',
        speedKmh: fallbacks.DRIVING.speedKmh,
      },
      TRANSIT: {
        mode: 'TRANSIT',
        label: 'Transit',
        subLabel: 'Bus / Metro',
        durationMillis: fallbacks.TRANSIT.durationMillis,
        durationFormatted: formatDuration(fallbacks.TRANSIT.durationMillis),
        distanceMeters: fallbacks.TRANSIT.distanceMeters,
        distanceFormatted: formatDistance(fallbacks.TRANSIT.distanceMeters / 1000, 'km'),
        isRealRoute: false,
        etaFormatted: formatETA(fallbacks.TRANSIT.durationMillis),
        tag: 'Public lines',
        speedKmh: fallbacks.TRANSIT.speedKmh,
      },
      FLIGHT: {
        mode: 'FLIGHT',
        label: 'Flight',
        subLabel: 'Direct Air',
        durationMillis: fallbacks.FLIGHT.durationMillis,
        durationFormatted: formatDuration(fallbacks.FLIGHT.durationMillis),
        distanceMeters: fallbacks.FLIGHT.distanceMeters,
        distanceFormatted: formatDistance(fallbacks.FLIGHT.distanceMeters / 1000, 'km'),
        isRealRoute: false,
        etaFormatted: formatETA(fallbacks.FLIGHT.durationMillis),
        tag: 'Direct flight',
        speedKmh: fallbacks.FLIGHT.speedKmh,
      },
    };
  }, [activeOrigin, destination]);

  // Merged medium estimates
  const mediumEstimates = useMemo<Record<TravelMode, MediumEstimate>>(() => {
    if (!baselineMediumEstimates) {
      return {} as Record<TravelMode, MediumEstimate>;
    }
    return {
      ...baselineMediumEstimates,
      ...liveMediumEstimates,
    };
  }, [baselineMediumEstimates, liveMediumEstimates]);

  // Compute straight-line metrics + route info for the active selected travel mode
  const metrics: DistanceMetrics | null = useMemo(() => {
    if (!activeOrigin || !destination) return null;
    const base = computeDistanceMetrics(activeOrigin.coords, destination.coords);

    const activeEst = mediumEstimates[selectedTravelMode];
    if (activeEst) {
      base.routeDistanceKm = activeEst.distanceMeters / 1000;
      base.routeDistanceMiles = (activeEst.distanceMeters / 1000) * 0.621371;
      base.routeDurationFormatted = activeEst.durationFormatted;
      base.travelMode = selectedTravelMode;
    } else if (routeData?.distanceMeters) {
      base.routeDistanceKm = routeData.distanceMeters / 1000;
      base.routeDistanceMiles = (routeData.distanceMeters / 1000) * 0.621371;
      base.routeDurationFormatted = routeData.durationFormatted;
      base.travelMode = routeData.mode;
    }

    return base;
  }, [activeOrigin, destination, selectedTravelMode, mediumEstimates, routeData]);

  // Live Traffic Intelligence and Alternate Route Simulation
  const trafficIntelligence = useMemo<LiveTrafficIntelligence | null>(() => {
    if (!activeOrigin || !destination) return null;
    const distKm = metrics?.routeDistanceKm || calculateHaversineDistanceKm(activeOrigin.coords, destination.coords);
    const durMin = metrics?.routeDurationFormatted
      ? parseInt(metrics.routeDurationFormatted) || 28
      : 28;
    return generateTrafficIntelligence(
      activeOrigin.coords,
      destination.coords,
      selectedTravelMode,
      distKm,
      durMin
    );
  }, [
    activeOrigin?.coords.lat,
    activeOrigin?.coords.lng,
    destination?.coords.lat,
    destination?.coords.lng,
    selectedTravelMode,
    metrics?.routeDistanceKm,
    metrics?.routeDurationFormatted,
  ]);

  // Selected Alternative Route
  const activeSelectedRoute = useMemo(() => {
    if (!trafficIntelligence) return null;
    return (
      trafficIntelligence.alternateRoutes.find((r) => r.id === selectedRouteId) ||
      trafficIntelligence.alternateRoutes[0]
    );
  }, [trafficIntelligence, selectedRouteId]);

  // Recommended Best Route (Fastest route with maximum time saved)
  const recommendedRoute = useMemo(() => {
    return trafficIntelligence?.alternateRoutes.find((r) => r.isRecommended) || null;
  }, [trafficIntelligence]);

  // When mobile user closes stats sheet: select recommended best route and illuminate shining green ball!
  const handleCloseMobileStats = useCallback(() => {
    setShowMobileStatsModal(false);
    if (recommendedRoute) {
      setSelectedRouteId(recommendedRoute.id);
    }
  }, [recommendedRoute]);

  // Simulated Drive Movement along Route (for testing/desktop users)
  useEffect(() => {
    let simInterval: ReturnType<typeof setInterval> | null = null;
    if (isSimulatingDrive && travelSession.isActive && !travelSession.isPaused && destination) {
      if (!initialOriginCoordsRef.current && activeOrigin) {
        initialOriginCoordsRef.current = activeOrigin.coords;
      }

      simInterval = setInterval(() => {
        setSimulatedProgress((prev) => {
          const next = prev + 0.015;
          if (next >= 1) {
            setIsSimulatingDrive(false);
            return 1;
          }

          if (initialOriginCoordsRef.current && destination) {
            const start = initialOriginCoordsRef.current;
            const end = destination.coords;
            const newLat = start.lat + (end.lat - start.lat) * next;
            const newLng = start.lng + (end.lng - start.lng) * next;

            setCustomOrigin((cur) => ({
              id: 'sim-moving',
              name: 'Live Vehicle In Motion',
              formattedAddress: `${newLat.toFixed(5)}, ${newLng.toFixed(5)}`,
              coords: { lat: newLat, lng: newLng },
              addedAt: Date.now(),
            }));
          }

          return next;
        });
      }, 1000);
    }

    return () => {
      if (simInterval) clearInterval(simInterval);
    };
  }, [isSimulatingDrive, travelSession.isActive, travelSession.isPaused, destination, activeOrigin]);

  // Reset to live device GPS and zoom directly to house
  const handleUseDeviceGps = () => {
    setCustomOrigin(null);
    requestGpsPosition();
    setShouldZoomToHouse(true);
    setRouteData(null);
  };

  // Travel action handlers
  const handleStartTravel = () => {
    startLiveTracking();
    if (activeOrigin) {
      initialOriginCoordsRef.current = activeOrigin.coords;
    }
    setSimulatedProgress(0);
    setShowMobileStatsModal(false);
    setIsBestRouteBoxMinimized(false);
    setTravelSession((prev) => ({
      ...prev,
      isActive: true,
      isPaused: false,
      startedAt: Date.now(),
      travelMode: selectedTravelMode,
      elapsedSeconds: 0,
      currentSpeedKmh: selectedTravelMode === 'WALKING' ? 5 : selectedTravelMode === 'BICYCLING' ? 16 : 42,
    }));
  };

  const handleEndTravel = () => {
    stopLiveTracking();
    setIsSimulatingDrive(false);
    setSimulatedProgress(0);
    setTravelSession((prev) => ({
      ...prev,
      isActive: false,
      isPaused: false,
      startedAt: null,
      elapsedSeconds: 0,
      currentSpeedKmh: 0,
    }));
  };

  const handleTogglePauseTravel = () => {
    setTravelSession((prev) => ({
      ...prev,
      isPaused: !prev.isPaused,
    }));
  };

  // Switch travel medium mode
  const handleTravelModeChange = (mode: TravelMode) => {
    setSelectedTravelMode(mode);
    setTravelSession((prev) => ({
      ...prev,
      travelMode: mode,
    }));
  };

  // Switch between simulated alternative routes
  const handleSelectRoute = (routeId: string) => {
    setSelectedRouteId(routeId);
  };

  // Toggle test drive movement simulation
  const handleToggleSimulateDrive = () => {
    setIsSimulatingDrive(!isSimulatingDrive);
  };

  // Re-center map handler
  const handleRecenterMap = () => {
    setShouldZoomToHouse(true);
  };

  // Mobile scroll helper: scrolls smoothly down to map
  const handleScrollToMap = () => {
    const mapElement = document.getElementById('map-section');
    if (mapElement) {
      mapElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Mobile scroll helper: scrolls automatically down to the Start Travel option
  const handleScrollToStartTravel = () => {
    const travelElement = document.getElementById('start-travel-section');
    if (travelElement) {
      travelElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const btn = document.getElementById('start-travel-btn');
      if (btn) {
        btn.classList.add('ring-4', 'ring-emerald-400');
        setTimeout(() => {
          btn.classList.remove('ring-4', 'ring-emerald-400');
        }, 1600);
      }
    } else {
      handleStartTravel();
    }
  };

  // Directly set home coordinates from map click or drag
  const handleSetHomeLocation = async (coords: { lat: number; lng: number }) => {
    const rev = await reverseGeocodeLocation(coords);
    setCustomOrigin({
      id: `home-${Date.now()}`,
      name: rev.name || `My House (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
      formattedAddress: rev.formattedAddress || `Latitude: ${coords.lat}, Longitude: ${coords.lng}`,
      coords,
      addressDetails: rev.details,
      addedAt: Date.now(),
    });
    setShouldZoomToHouse(true);
    setRouteData(null);
  };

  // Handle direct coordinate paste e.g. "28.5355, 77.3910"
  const handleApplyCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    const match = coordInputValue.trim().match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[3]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        handleSetHomeLocation({ lat, lng });
        setShowCoordInput(false);
        setCoordInputValue('');
      }
    }
  };

  // Swap Origin and Destination
  const handleSwapLocations = () => {
    if (!activeOrigin || !destination) return;
    const currentOrigin = {
      id: `origin-${Date.now()}`,
      name: activeOrigin.name || 'Your Location',
      formattedAddress: activeOrigin.address || '',
      coords: activeOrigin.coords,
      addressDetails: activeOrigin.addressDetails,
      addedAt: Date.now(),
    };
    const currentDest = destination;

    setCustomOrigin(currentDest);
    setDestination(currentOrigin);
    setRouteData(null);
  };

  // Map click handler: updates destination
  const handleMapClick = (coords: { lat: number; lng: number }) => {
    setDestination({
      id: `pin-${Date.now()}`,
      name: `Map Pin (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})`,
      formattedAddress: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
      coords,
      addedAt: Date.now(),
    });
    setRouteData(null);
  };

  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      libraries={['places', 'routes', 'marker', 'geometry', 'maps', 'core']}
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        {/* Tier 1 Quota Banner if limit reached */}
        {isQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        {/* FULLSCREEN NAVIGATION COCKPIT (WHEN START TRAVEL CLICKED) */}
        {travelSession.isActive && activeOrigin && destination && trafficIntelligence && activeSelectedRoute ? (
          <div className="fixed inset-0 w-screen h-screen overflow-hidden flex flex-col md:flex-row z-30 bg-slate-950">
            {/* Desktop Left Side: Live Navigation & Traffic Intelligence HUD (Desktop Only, hidden on mobile so map stays 100% full screen) */}
            <div className="h-full z-30 relative shrink-0 overflow-hidden hidden md:flex">
              <LiveNavigationHud
                myLocation={activeOrigin}
                targetLocation={destination}
                travelSession={travelSession}
                trafficIntel={trafficIntelligence}
                selectedRoute={activeSelectedRoute}
                onSelectRoute={handleSelectRoute}
                onTogglePauseTravel={handleTogglePauseTravel}
                onEndTravel={handleEndTravel}
                onToggleSimulateDrive={handleToggleSimulateDrive}
                isSimulatingDrive={isSimulatingDrive}
                onRecenterMap={handleRecenterMap}
                sidebarMode={sidebarMode}
                onSidebarModeChange={setSidebarMode}
                customWidth={sidebarWidth}
                onCustomWidthChange={setSidebarWidth}
                onCloseMobileStats={handleCloseMobileStats}
              />
            </div>

            {/* Whole Screen Google Map: occupies 100% full screen on mobile, right panel on desktop */}
            <div className="flex-1 w-full h-full relative overflow-hidden flex flex-col">
              {/* Desktop Quick Map View Size Selector */}
              <div className="absolute top-4 left-4 z-20 hidden md:flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-2xl text-xs font-bold text-slate-200">
                <span className="text-[11px] text-slate-400">Map View:</span>
                <button
                  type="button"
                  onClick={() => setSidebarMode('collapsed')}
                  className={`px-2 py-0.5 rounded-md text-[11px] transition ${
                    sidebarMode === 'collapsed'
                      ? 'bg-blue-600 text-white font-black shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Maximize Map size (Sidebar shrinks to rail)"
                >
                  Max Map (98%)
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarMode('compact')}
                  className={`px-2 py-0.5 rounded-md text-[11px] transition ${
                    sidebarMode === 'compact'
                      ? 'bg-blue-600 text-white font-black shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Slim Sidebar (Large Map)"
                >
                  Slim Stats
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarMode('expanded')}
                  className={`px-2 py-0.5 rounded-md text-[11px] transition ${
                    sidebarMode === 'expanded'
                      ? 'bg-blue-600 text-white font-black shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Full Stats Sidebar"
                >
                  Full Stats
                </button>
              </div>

              {/* MOBILE SMALL BOX 1: Top Floating Status & Control Box (No full section, leaves map clear) */}
              <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex md:hidden items-center justify-between gap-1.5 pointer-events-none">
                {/* Mini Speed Box */}
                <div className="pointer-events-auto flex items-center gap-1 bg-slate-900/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700/80 shadow-xl text-white shrink-0">
                  <span className="text-emerald-400 text-xs font-black">
                    {travelSession.currentSpeedKmh || 42}
                  </span>
                  <span className="text-[8px] text-slate-400 font-semibold uppercase">km/h</span>
                </div>

                {/* Mini Destination & Clearance Box */}
                <div className="pointer-events-auto flex-1 min-w-0 bg-slate-900/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700/80 shadow-xl flex items-center justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white truncate flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      <span className="truncate">{destination.name}</span>
                    </div>
                    <div className="text-[9px] text-amber-300 font-semibold truncate flex items-center gap-1">
                      <span>Clears ~{trafficIntelligence.clearanceForecastMinutes}m</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-emerald-300 font-bold">{activeSelectedRoute.durationFormatted}</span>
                    </div>
                  </div>
                </div>

                {/* Mini Action Buttons: Recenter & End Trip */}
                <div className="pointer-events-auto flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleRecenterMap}
                    className="p-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md text-blue-400 border border-slate-700/80 shadow-xl active:scale-95 transition"
                    title="Re-center Map"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleEndTravel}
                    className="p-1.5 rounded-xl bg-rose-600/95 backdrop-blur-md text-white border border-rose-500 shadow-xl active:scale-95 transition"
                    title="End Journey"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* MOBILE SMALL BOX 2: Best Route Floating Small Box (Compact, dismissible/collapsible, never covers screen) */}
              {recommendedRoute && (
                <div className="absolute top-13 left-2.5 right-2.5 sm:right-auto sm:max-w-xs z-20 flex md:hidden flex-col pointer-events-none">
                  <div className="pointer-events-auto bg-slate-950/95 backdrop-blur-xl border border-emerald-500/60 rounded-xl p-2 shadow-[0_4px_20px_rgba(16,185,129,0.25)] transition-all">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* Shining Green Ball Indicator */}
                        <div className="relative flex items-center justify-center shrink-0 w-3.5 h-3.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-emerald-400/50 animate-ping absolute" />
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] relative" />
                        </div>
                        <span className="text-[10px] font-black text-emerald-300 uppercase tracking-wide">
                          Best Route
                        </span>
                        {recommendedRoute.timeSavedMinutes > 0 && (
                          <span className="text-[9px] font-black text-emerald-300 bg-emerald-950 px-1.5 py-0.2 rounded-md border border-emerald-500/40">
                            -{recommendedRoute.timeSavedMinutes}m
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {selectedRouteId !== recommendedRoute.id && (
                          <button
                            type="button"
                            onClick={() => handleSelectRoute(recommendedRoute.id)}
                            className="text-[9px] font-black text-white bg-blue-600 hover:bg-blue-500 active:scale-95 px-2 py-0.5 rounded-md shadow-sm transition"
                          >
                            Switch
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsBestRouteBoxMinimized(!isBestRouteBoxMinimized)}
                          className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                          title={isBestRouteBoxMinimized ? 'Expand' : 'Minimize'}
                        >
                          {isBestRouteBoxMinimized ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronUp className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {!isBestRouteBoxMinimized && (
                      <div className="mt-1 pt-1 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-white truncate flex items-center gap-1">
                            <span className="truncate">{recommendedRoute.name}</span>
                            <span className="text-[8px] font-bold text-blue-400 bg-blue-950/80 px-1 py-0.2 rounded border border-blue-500/40 shrink-0">
                              🔵 Blued
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-300 truncate">
                            {recommendedRoute.durationFormatted} ({recommendedRoute.distanceFormatted}) • {recommendedRoute.via}
                          </div>
                        </div>

                        {selectedRouteId === recommendedRoute.id && (
                          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/40 shrink-0 flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> Active
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* MOBILE SMALL BOXES 3: Bottom Dock of Route Small Boxes & Compact Controls */}
              <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 flex md:hidden flex-col gap-1.5 pointer-events-none">
                {/* Horizontal row of small boxes for routes */}
                <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {trafficIntelligence.alternateRoutes.map((route) => {
                    const isSelected = selectedRouteId === route.id;
                    const isRec = route.isRecommended;

                    return (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => handleSelectRoute(route.id)}
                        className={`shrink-0 text-left p-1.5 rounded-xl backdrop-blur-md border transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-blue-950/95 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.6)] ring-1 ring-blue-400'
                            : isRec
                            ? 'bg-slate-900/90 border-emerald-500/60 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                            : 'bg-slate-900/90 border-slate-700/80'
                        }`}
                        style={{ minWidth: '115px', maxWidth: '145px' }}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[10px] font-bold text-white truncate">
                            {route.name}
                          </span>
                          {isRec && (
                            <span className="text-[8px] font-black text-emerald-400 bg-emerald-950 px-1 rounded border border-emerald-500/40 shrink-0">
                              ★ Best
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-[9px]">
                          <span className={`font-black ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                            {route.durationFormatted}
                          </span>
                          {route.timeSavedMinutes > 0 ? (
                            <span className="text-emerald-400 font-bold">-{route.timeSavedMinutes}m</span>
                          ) : route.timeSavedMinutes < 0 ? (
                            <span className="text-rose-400 font-bold">+{Math.abs(route.timeSavedMinutes)}m</span>
                          ) : (
                            <span className="text-slate-400">Direct</span>
                          )}
                          {route.id !== 'current-route' && (
                            <span className="text-[8px] text-blue-400 font-bold ml-auto">🔵</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Floating Mini Controls Pill */}
                <div className="pointer-events-auto flex items-center justify-between gap-1.5 bg-slate-900/95 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-700/80 shadow-xl text-xs">
                  <div className="flex items-center gap-1 text-[10px] text-slate-300 truncate">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="truncate">Tap small box to switch route</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleToggleSimulateDrive}
                      className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border transition ${
                        isSimulatingDrive
                          ? 'bg-blue-600 text-white border-blue-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                      title="Simulate vehicle moving along road"
                    >
                      {isSimulatingDrive ? 'Simulating' : 'Simulate'}
                    </button>
                    <button
                      type="button"
                      onClick={handleTogglePauseTravel}
                      className="p-1 rounded-lg bg-slate-800 border border-slate-700 text-white active:scale-95 transition"
                      title={travelSession.isPaused ? 'Resume' : 'Pause'}
                    >
                      {travelSession.isPaused ? (
                        <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                      ) : (
                        <Pause className="w-3 h-3 text-amber-400" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMobileStatsModal(true)}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-[9px] font-bold flex items-center gap-1"
                      title="Open full telemetry modal"
                    >
                      <Gauge className="w-3 h-3 text-emerald-400" />
                      <span>Stats</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Optional Mobile Full Telemetry Modal (Only opens if user clicks Stats, easily dismissed) */}
              {showMobileStatsModal && (
                <div className="fixed inset-0 z-50 md:hidden bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-150">
                  <div className="bg-slate-900 border-t border-slate-700 rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
                    <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gauge className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          Trip Telemetry & Traffic Detail
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseMobileStats}
                        className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <LiveNavigationHud
                        myLocation={activeOrigin}
                        targetLocation={destination}
                        travelSession={travelSession}
                        trafficIntel={trafficIntelligence}
                        selectedRoute={activeSelectedRoute}
                        onSelectRoute={handleSelectRoute}
                        onTogglePauseTravel={handleTogglePauseTravel}
                        onEndTravel={handleEndTravel}
                        onToggleSimulateDrive={handleToggleSimulateDrive}
                        isSimulatingDrive={isSimulatingDrive}
                        onRecenterMap={handleRecenterMap}
                        sidebarMode="expanded"
                        onSidebarModeChange={() => {}}
                        customWidth={400}
                        onCustomWidthChange={() => {}}
                        onCloseMobileStats={handleCloseMobileStats}
                      />
                    </div>
                  </div>
                </div>
              )}

              <MapContainer
                myLocation={activeOrigin}
                targetLocation={destination}
                selectedTravelMode={selectedTravelMode}
                onSelectTravelMode={handleTravelModeChange}
                onMapClickLocation={handleMapClick}
                onSetHomeLocation={handleSetHomeLocation}
                onOriginDragEnd={handleSetHomeLocation}
                onRouteComputed={setRouteData}
                onMediumEstimateComputed={handleMediumEstimateComputed}
                shouldZoomToHouse={shouldZoomToHouse}
                onHouseZoomCompleted={() => setShouldZoomToHouse(false)}
                isPinningHome={false}
                onTogglePinningHome={() => {}}
                isNavigationMode={true}
                trafficIntel={trafficIntelligence}
                selectedRoute={activeSelectedRoute}
                recommendedRoute={recommendedRoute}
                showShiningGreenBall={true}
                onSelectRoute={handleSelectRoute}
              />
            </div>
          </div>
        ) : (
          /* STANDARD COMPARISON & PLANNING VIEW (BEFORE START JOURNEY) */
          <>
            {/* Header */}
            <GpsStatusHeader
              location={activeOrigin}
              isAcquiring={isAcquiring}
              onRequestGps={handleUseDeviceGps}
            />

            {/* Main Content */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 pb-28 lg:pb-8 grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Panel: Location Selection, Medium Comparison, & Distance Card */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                {/* Location Inputs Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
                  {/* 1. Your Location Input */}
                  <div>
                    <PlaceSearch
                      label="Your Location (Origin)"
                      placeholder="Type your apartment, society, colony, or house..."
                      indicatorColor="blue"
                      selectedLocation={originAsSearchedLocation}
                      locationBiasCoords={activeOrigin?.coords}
                      onLocationSelect={(loc) => {
                        setCustomOrigin(loc);
                        setShouldZoomToHouse(true);
                        setRouteData(null);
                      }}
                      actionButton={
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShouldZoomToHouse(true)}
                            className="text-[11px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-lg border border-blue-500/40 bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 transition"
                            title="Zoom directly to Level 19 close-up"
                          >
                            <Home className="w-3 h-3 text-blue-400" />
                            <span>Zoom to House</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleUseDeviceGps}
                            className={`text-[11px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-lg border transition ${
                              !customOrigin
                                ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
                                : 'bg-slate-800 text-slate-400 hover:text-blue-300 border-slate-700 hover:bg-slate-700'
                            }`}
                            title="Use device GPS"
                          >
                            <Crosshair className="w-3 h-3" />
                            <span>{!customOrigin ? 'Live GPS Active' : 'Live GPS'}</span>
                          </button>
                        </div>
                      }
                    />

                    {/* Pinpoint Home Quick Helper Bar */}
                    <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-300 font-semibold flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-amber-400" />
                          Pinpoint Exact Rooftop / Gate:
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setIsPinningHome(!isPinningHome)}
                            className={`px-2 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                              isPinningHome
                                ? 'bg-amber-500 text-slate-950 shadow-md'
                                : 'bg-slate-800 text-amber-400 hover:bg-slate-700 border border-amber-600/30'
                            }`}
                          >
                            <span>{isPinningHome ? 'Click map now' : '📍 Tap on Map'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowCoordInput(!showCoordInput)}
                            className="px-2 py-1 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700"
                          >
                            Paste Lat,Lng
                          </button>
                        </div>
                      </div>

                      {/* Manual Coordinate Input Dropdown */}
                      {showCoordInput && (
                        <form onSubmit={handleApplyCoordinates} className="flex gap-1.5 pt-1 border-t border-slate-800">
                          <input
                            type="text"
                            value={coordInputValue}
                            onChange={(e) => setCoordInputValue(e.target.value)}
                            placeholder="Paste phone GPS e.g. 28.5355, 77.3910"
                            className="flex-1 px-2.5 py-1 text-xs bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                          />
                          <button
                            type="submit"
                            className="px-2.5 py-1 bg-blue-600 text-white rounded-md text-xs font-bold hover:bg-blue-500"
                          >
                            Apply
                          </button>
                        </form>
                      )}

                      <p className="text-[10px] text-slate-400 flex items-start gap-1">
                        <HelpCircle className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                        <span>
                          Browser GPS on PC/WiFi often estimates position from telecom hubs. Use the search bar above to type your building name, or click <strong>&quot;📍 Tap on Map&quot;</strong> to place the pin right onto your roof.
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Swap Button */}
                  <div className="flex items-center justify-center -my-1">
                    <button
                      type="button"
                      onClick={handleSwapLocations}
                      className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition flex items-center gap-1.5 text-[11px] px-3"
                      title="Swap Your Location and Destination"
                    >
                      <ArrowDownUp className="w-3.5 h-3.5 text-blue-400" />
                      <span>Swap Locations</span>
                    </button>
                  </div>

                  {/* 2. Destination Location Input */}
                  <div>
                    <PlaceSearch
                      label="Destination Location"
                      placeholder="Search destination city, country, or address..."
                      indicatorColor="rose"
                      selectedLocation={destination}
                      locationBiasCoords={activeOrigin?.coords}
                      onLocationSelect={(loc) => {
                        setDestination(loc);
                        setRouteData(null);
                      }}
                    />
                  </div>
                </div>

                {/* Travel Medium Comparison & Distance Display + Start Travel Option */}
                {activeOrigin && destination && metrics && (
                  <DistanceCard
                    myLocation={activeOrigin}
                    targetLocation={destination}
                    metrics={metrics}
                    travelSession={travelSession}
                    selectedTravelMode={selectedTravelMode}
                    mediumEstimates={mediumEstimates}
                    onStartTravel={handleStartTravel}
                    onEndTravel={handleEndTravel}
                    onTogglePauseTravel={handleTogglePauseTravel}
                    onTravelModeChange={handleTravelModeChange}
                  />
                )}
              </div>

              {/* Right Panel: Interactive World Map */}
              <div id="map-section" className="lg:col-span-7 flex flex-col h-[520px] sm:h-[580px] lg:h-auto min-h-[460px] scroll-mt-20">
                <MapContainer
                  myLocation={activeOrigin}
                  targetLocation={destination}
                  selectedTravelMode={selectedTravelMode}
                  onSelectTravelMode={handleTravelModeChange}
                  onMapClickLocation={handleMapClick}
                  onSetHomeLocation={handleSetHomeLocation}
                  onOriginDragEnd={handleSetHomeLocation}
                  onRouteComputed={setRouteData}
                  onMediumEstimateComputed={handleMediumEstimateComputed}
                  shouldZoomToHouse={shouldZoomToHouse}
                  onHouseZoomCompleted={() => setShouldZoomToHouse(false)}
                  isPinningHome={isPinningHome}
                  onTogglePinningHome={setIsPinningHome}
                  isNavigationMode={false}
                  trafficIntel={trafficIntelligence}
                  selectedRoute={activeSelectedRoute}
                  recommendedRoute={recommendedRoute}
                  showShiningGreenBall={selectedRouteId === recommendedRoute?.id}
                  onSelectRoute={handleSelectRoute}
                />
              </div>
            </main>

            {/* FIXED MOBILE BOTTOM ACTION DOCK (Convenient One-Thumb Mobile Navigation) */}
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 p-2.5 px-3 flex items-center justify-between gap-2.5 lg:hidden shadow-[0_-10px_25px_rgba(0,0,0,0.7)]">
              {/* BELOW LEFT: VIEW MAP BUTTON */}
              <button
                type="button"
                onClick={handleScrollToMap}
                className="flex-1 py-3 px-3 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-100 text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-sm"
              >
                <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                <span>View Map</span>
              </button>

              {/* CENTER: QUICK METRIC CHIP */}
              {metrics && (
                <button
                  type="button"
                  onClick={handleScrollToStartTravel}
                  className="flex flex-col items-center px-2 py-0.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-center active:scale-95 transition"
                >
                  <span className="text-[10px] text-slate-400 font-semibold leading-tight">
                    {mediumEstimates[selectedTravelMode]?.label || 'Route'}
                  </span>
                  <span className="text-xs font-black text-emerald-400 leading-tight">
                    {metrics.routeDurationFormatted || formatDistance(metrics.straightKm, 'km')}
                  </span>
                </button>
              )}

              {/* BELOW RIGHT: START TRAVEL BUTTON */}
              <button
                type="button"
                onClick={handleScrollToStartTravel}
                className="flex-1 py-3 px-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-black flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-950/50 active:scale-95"
              >
                <Play className="w-4 h-4 fill-white shrink-0" />
                <span>Start Travel</span>
              </button>
            </div>
          </>
        )}
      </div>
    </APIProvider>
  );
}
