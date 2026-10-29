import React from 'react';
import {
  Car,
  Compass,
  Building2,
  Mail,
  Play,
  Square,
  Pause,
  Footprints,
  Bike,
  Clock,
  Radio,
  Zap,
  Bus,
  Plane,
  Flame,
  Leaf,
  Check,
  CheckCircle2,
} from 'lucide-react';
import {
  GpsLocation,
  SearchedLocation,
  DistanceMetrics,
  TravelSession,
  TravelMode,
  MediumEstimate,
} from '../types/gps';
import { formatDistance } from '../utils/geo';

interface DistanceCardProps {
  myLocation: GpsLocation;
  targetLocation: SearchedLocation;
  metrics: DistanceMetrics;
  travelSession: TravelSession;
  selectedTravelMode: TravelMode;
  mediumEstimates: Record<TravelMode, MediumEstimate>;
  onStartTravel: () => void;
  onEndTravel: () => void;
  onTogglePauseTravel: () => void;
  onTravelModeChange: (mode: TravelMode) => void;
}

interface MediumConfig {
  mode: TravelMode;
  label: string;
  subLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string; // Tailwind color class or hex
  borderColor: string;
  badgeBg: string;
  badgeText: string;
  perk: string;
}

const MEDIUMS_CONFIG: MediumConfig[] = [
  {
    mode: 'WALKING',
    label: 'Walk',
    subLabel: 'On Foot',
    icon: Footprints,
    accentColor: 'from-amber-500/20 to-orange-500/10 border-amber-500 text-amber-400',
    borderColor: 'border-amber-500/40 hover:border-amber-400',
    badgeBg: 'bg-amber-950/80 border-amber-700/50 text-amber-300',
    badgeText: 'text-amber-400',
    perk: 'Burn calories • Zero emissions',
  },
  {
    mode: 'BICYCLING',
    label: 'Bike',
    subLabel: 'Cycling',
    icon: Bike,
    accentColor: 'from-cyan-500/20 to-teal-500/10 border-cyan-500 text-cyan-400',
    borderColor: 'border-cyan-500/40 hover:border-cyan-400',
    badgeBg: 'bg-cyan-950/80 border-cyan-700/50 text-cyan-300',
    badgeText: 'text-cyan-400',
    perk: 'Eco-friendly • Cardio fitness',
  },
  {
    mode: 'DRIVING',
    label: 'Drive',
    subLabel: 'Car / Road',
    icon: Car,
    accentColor: 'from-emerald-500/20 to-green-500/10 border-emerald-500 text-emerald-400',
    borderColor: 'border-emerald-500/40 hover:border-emerald-400',
    badgeBg: 'bg-emerald-950/80 border-emerald-700/50 text-emerald-300',
    badgeText: 'text-emerald-400',
    perk: 'Fastest land option',
  },
  {
    mode: 'TWO_WHEELER',
    label: '2-Wheeler',
    subLabel: 'Scooter / Bike',
    icon: Zap,
    accentColor: 'from-purple-500/20 to-violet-500/10 border-purple-500 text-purple-400',
    borderColor: 'border-purple-500/40 hover:border-purple-400',
    badgeBg: 'bg-purple-950/80 border-purple-700/50 text-purple-300',
    badgeText: 'text-purple-400',
    perk: 'Nimble in city traffic',
  },
  {
    mode: 'TRANSIT',
    label: 'Transit',
    subLabel: 'Bus / Metro',
    icon: Bus,
    accentColor: 'from-blue-500/20 to-indigo-500/10 border-blue-500 text-blue-400',
    borderColor: 'border-blue-500/40 hover:border-blue-400',
    badgeBg: 'bg-blue-950/80 border-blue-700/50 text-blue-300',
    badgeText: 'text-blue-400',
    perk: 'Public mass transit',
  },
  {
    mode: 'FLIGHT',
    label: 'Flight',
    subLabel: 'Direct Air',
    icon: Plane,
    accentColor: 'from-sky-500/20 to-cyan-500/10 border-sky-500 text-sky-400',
    borderColor: 'border-sky-500/40 hover:border-sky-400',
    badgeBg: 'bg-sky-950/80 border-sky-700/50 text-sky-300',
    badgeText: 'text-sky-400',
    perk: 'Cruising at 820 km/h',
  },
];

export const DistanceCard: React.FC<DistanceCardProps> = ({
  myLocation,
  targetLocation,
  metrics,
  travelSession,
  selectedTravelMode,
  mediumEstimates,
  onStartTravel,
  onEndTravel,
  onTogglePauseTravel,
  onTravelModeChange,
}) => {
  const originDetails = myLocation.addressDetails;
  const targetDetails = targetLocation.addressDetails;

  const currentMediumEst = mediumEstimates[selectedTravelMode] || {
    mode: selectedTravelMode,
    label: selectedTravelMode,
    durationMillis: 0,
    durationFormatted: metrics.routeDurationFormatted || 'Calculating...',
    distanceMeters: (metrics.routeDistanceKm || metrics.straightKm) * 1000,
    distanceFormatted: formatDistance(metrics.routeDistanceKm || metrics.straightKm, 'km'),
    isRealRoute: !!metrics.routeDistanceKm,
    etaFormatted: 'Calculating...',
  };

  const formatElapsed = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col gap-4">
      {/* Locations Comparison Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pb-4 border-b border-slate-800">
        {/* 1. Your Location Card */}
        <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-500/30 animate-pulse" />
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                  Your Location
                </span>
              </div>

              {!myLocation.isSimulated && myLocation.accuracy && (
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                  GPS ±{Math.round(myLocation.accuracy)}m
                </span>
              )}
            </div>

            <div className="text-sm font-bold text-slate-100 truncate">
              {myLocation.name || 'Current Position'}
            </div>

            {/* Pinpoint Details: Colony & PIN Code */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {originDetails?.colony && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-900/30 text-blue-300 border border-blue-700/40 text-[11px] font-semibold">
                  <Building2 className="w-3 h-3 text-blue-400" />
                  <span>Colony: {originDetails.colony}</span>
                </span>
              )}

              {originDetails?.pincode && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-900/30 text-amber-300 border border-amber-700/40 text-[11px] font-semibold">
                  <Mail className="w-3 h-3 text-amber-400" />
                  <span>PIN: {originDetails.pincode}</span>
                </span>
              )}

              {originDetails?.locality && originDetails.locality !== originDetails.colony && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px]">
                  <span>{originDetails.locality}</span>
                </span>
              )}
            </div>

            {myLocation.address && (
              <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                {myLocation.address}
              </p>
            )}
          </div>

          <div className="text-[11px] text-slate-400 font-mono mt-2 pt-2 border-t border-slate-900">
            Coordinates: {myLocation.coords.lat.toFixed(5)}, {myLocation.coords.lng.toFixed(5)}
          </div>
        </div>

        {/* 2. Searched Location Card */}
        <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/30" />
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                  Target Destination
                </span>
              </div>
            </div>

            <div className="text-sm font-bold text-slate-100 truncate">
              {targetLocation.name}
            </div>

            {/* Target Pinpoint Details */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {targetDetails?.colony && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-900/30 text-rose-300 border border-rose-700/40 text-[11px] font-semibold">
                  <Building2 className="w-3 h-3 text-rose-400" />
                  <span>Area: {targetDetails.colony}</span>
                </span>
              )}

              {targetDetails?.pincode && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-900/30 text-amber-300 border border-amber-700/40 text-[11px] font-semibold">
                  <Mail className="w-3 h-3 text-amber-400" />
                  <span>PIN: {targetDetails.pincode}</span>
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 mt-2 line-clamp-2">
              {targetLocation.formattedAddress}
            </p>
          </div>

          <div className="text-[11px] text-slate-400 font-mono mt-2 pt-2 border-t border-slate-900">
            Coordinates: {targetLocation.coords.lat.toFixed(5)}, {targetLocation.coords.lng.toFixed(5)}
          </div>
        </div>
      </div>

      {/* TRAVEL MEDIUMS & TIME BREAKDOWN (Walk, Bike, Drive, 2-Wheeler, Transit, Flight) */}
      <div className="flex flex-col gap-2.5 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Travel Mediums &amp; Time Comparison
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Tap any medium to view route &amp; time
          </span>
        </div>

        {/* Medium Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {MEDIUMS_CONFIG.map((item) => {
            const Icon = item.icon;
            const est = mediumEstimates[item.mode];
            const isSelected = selectedTravelMode === item.mode;

            const durationDisplay = est?.durationFormatted || 'Calculating...';
            const distanceDisplay = est?.distanceFormatted || '--';

            return (
              <button
                key={item.mode}
                type="button"
                onClick={() => onTravelModeChange(item.mode)}
                className={`relative p-3 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? `bg-slate-950 ring-2 ring-emerald-500 shadow-lg shadow-emerald-950/40 border-emerald-500`
                    : `bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700`
                }`}
              >
                {/* Selected Indicator Checkmark */}
                {isSelected && (
                  <div className="absolute top-2 right-2 flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-slate-950">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}

                <div>
                  {/* Icon & Label */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div
                      className={`p-1.5 rounded-lg border ${
                        isSelected
                          ? 'bg-emerald-900/50 border-emerald-500/60 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-200 block leading-tight">
                        {item.label}
                      </span>
                      <span className="text-[10px] text-slate-400 block leading-tight">
                        {item.subLabel}
                      </span>
                    </div>
                  </div>

                  {/* Time / Duration - Big & Bold */}
                  <div className="text-base sm:text-lg font-black tracking-tight text-white mt-1">
                    {durationDisplay}
                  </div>

                  {/* Distance */}
                  <div className="text-[11px] text-slate-400 font-medium">
                    {distanceDisplay}
                  </div>
                </div>

                {/* Subtag / Calories / Route Badge */}
                <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  {est?.caloriesBurned ? (
                    <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                      <Flame className="w-2.5 h-2.5" />
                      <span>{est.caloriesBurned} kcal</span>
                    </span>
                  ) : item.mode === 'BICYCLING' || item.mode === 'WALKING' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                      <Leaf className="w-2.5 h-2.5" />
                      <span>Zero CO₂</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 truncate">{item.perk}</span>
                  )}

                  {est?.isRealRoute && (
                    <span className="text-[9px] font-semibold text-emerald-400 uppercase">
                      Live
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SELECTED MEDIUM SPOTLIGHT BANNER */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-700/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Selected Medium: {currentMediumEst.label}
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
              {currentMediumEst.etaFormatted}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-white">
              {currentMediumEst.durationFormatted}
            </span>
            <span className="text-sm font-semibold text-slate-300">
              via {currentMediumEst.distanceFormatted}
            </span>
            <span className="text-xs text-slate-400">
              (Straight: {formatDistance(metrics.straightKm, 'km')})
            </span>
          </div>
        </div>

        {/* Direction & Compass Heading */}
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-400" />
            <div>
              <div className="text-slate-400 text-[10px]">Bearing</div>
              <div className="font-bold text-white">
                {metrics.bearingCardinal} ({Math.round(metrics.bearingDeg)}°)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* START TRAVEL CONTROLS HUD */}
      <div id="start-travel-section" className="pt-2 border-t border-slate-800 scroll-mt-24">
        {!travelSession.isActive ? (
          /* Initial State: Big Start Travel Button with Active Medium */
          <div className="flex flex-col gap-2">
            <button
              id="start-travel-btn"
              type="button"
              onClick={onStartTravel}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition transform active:scale-[0.99]"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>
                Start Journey ({currentMediumEst.label} • {currentMediumEst.durationFormatted})
              </span>
            </button>
            <p className="text-[10px] text-slate-400 text-center">
              Switch between Walk, Bike, Drive, 2-Wheeler, Transit, or Flight anytime to compare paths.
            </p>
          </div>
        ) : (
          /* Active Travel State: Active Journey HUD */
          <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">
                  {travelSession.isPaused
                    ? 'Journey Paused'
                    : `Traveling via ${currentMediumEst.label}`}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-200 bg-emerald-900/60 px-2.5 py-1 rounded-md border border-emerald-700/50">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Elapsed: {formatElapsed(travelSession.elapsedSeconds)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2 px-3 bg-slate-950/60 rounded-lg border border-emerald-900/40 text-xs">
              <div>
                <span className="text-slate-400 text-[10px] block">Target Destination</span>
                <span className="font-bold text-white truncate block">
                  {targetLocation.name}
                </span>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] block">Expected Time</span>
                <span className="font-bold text-emerald-300">
                  {currentMediumEst.durationFormatted}
                </span>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] block">Medium Route</span>
                <span className="font-bold text-slate-200">
                  {currentMediumEst.distanceFormatted}
                </span>
              </div>
            </div>

            {/* Travel Active Controls */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={onTogglePauseTravel}
                className="py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition border border-slate-700"
              >
                {travelSession.isPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                    <span>Resume Journey</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5 text-amber-400" />
                    <span>Pause Journey</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onEndTravel}
                className="py-2.5 px-3 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>End Journey</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
