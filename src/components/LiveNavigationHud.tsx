import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Navigation,
  Compass,
  AlertTriangle,
  Clock,
  Zap,
  Play,
  Pause,
  Square,
  TrendingDown,
  Car,
  Bike,
  Footprints,
  Bus,
  Plane,
  X,
  Gauge,
  Radio,
  Check,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Maximize2,
  Minimize2,
  Sliders,
} from 'lucide-react';
import {
  GpsLocation,
  SearchedLocation,
  TravelSession,
  TravelMode,
  LiveTrafficIntelligence,
  RoutePossibility,
} from '../types/gps';

export type SidebarMode = 'expanded' | 'compact' | 'collapsed';

interface LiveNavigationHudProps {
  myLocation: GpsLocation;
  targetLocation: SearchedLocation;
  travelSession: TravelSession;
  trafficIntel: LiveTrafficIntelligence;
  selectedRoute: RoutePossibility;
  onSelectRoute: (routeId: string) => void;
  onTogglePauseTravel: () => void;
  onEndTravel: () => void;
  onToggleSimulateDrive?: () => void;
  isSimulatingDrive?: boolean;
  onRecenterMap: () => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
  customWidth: number;
  onCustomWidthChange: (width: number) => void;
  onMobileSwitchToMap?: () => void;
  onCloseMobileStats?: () => void;
}

export const LiveNavigationHud: React.FC<LiveNavigationHudProps> = ({
  myLocation,
  targetLocation,
  travelSession,
  trafficIntel,
  selectedRoute,
  onSelectRoute,
  onTogglePauseTravel,
  onEndTravel,
  onToggleSimulateDrive,
  isSimulatingDrive = false,
  onRecenterMap,
  sidebarMode,
  onSidebarModeChange,
  customWidth,
  onCustomWidthChange,
  onMobileSwitchToMap,
  onCloseMobileStats,
}) => {
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(customWidth);

  const formatElapsed = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const currentSpeed = travelSession.currentSpeedKmh ?? myLocation.speed ?? 0;

  // Mouse drag handler for custom resizer
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = customWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = moveEvent.clientX - startXRef.current;
      const newWidth = Math.max(260, Math.min(620, startWidthRef.current + delta));
      onCustomWidthChange(newWidth);
      if (newWidth < 340) {
        onSidebarModeChange('compact');
      } else {
        onSidebarModeChange('expanded');
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 1. COLLAPSED SLIM RAIL (Maximizes map to 97% of screen)
  if (sidebarMode === 'collapsed') {
    return (
      <div className="relative z-30 h-full w-14 sm:w-16 bg-slate-950/95 backdrop-blur-2xl border-r border-slate-800 flex flex-col items-center justify-between py-4 shadow-2xl shrink-0">
        <div className="flex flex-col items-center gap-4">
          {/* Expand Toggle Button */}
          <button
            type="button"
            onClick={() => onSidebarModeChange('compact')}
            className="p-2.5 rounded-xl bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 border border-emerald-500/40 transition shadow-md group relative"
            title="Expand Stats Sidebar"
          >
            <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            <span className="sr-only">Expand Sidebar</span>
          </button>

          {/* Speed Indicator */}
          <div className="flex flex-col items-center p-2 rounded-xl bg-slate-900 border border-slate-800" title={`Current Speed: ${currentSpeed} km/h`}>
            <Gauge className="w-4 h-4 text-emerald-400 mb-0.5" />
            <span className="text-xs font-black text-white">{currentSpeed}</span>
            <span className="text-[9px] text-slate-400">km/h</span>
          </div>

          {/* Traffic Beacon */}
          <div
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center"
            title={`Traffic delay: +${trafficIntel.totalDelayMinutes}m • Clears in ~${trafficIntel.clearanceForecastMinutes}m`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="text-[9px] font-bold text-amber-300 mt-1">~{trafficIntel.clearanceForecastMinutes}m</span>
          </div>

          {/* Re-center Map */}
          <button
            type="button"
            onClick={onRecenterMap}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-blue-400 transition"
            title="Re-center map on vehicle"
          >
            <Navigation className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onTogglePauseTravel}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 transition"
            title={travelSession.isPaused ? 'Resume Journey' : 'Pause Journey'}
          >
            {travelSession.isPaused ? <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
          </button>

          <button
            type="button"
            onClick={onEndTravel}
            className="p-2 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white transition shadow-sm"
            title="End Journey"
          >
            <Square className="w-4 h-4 fill-white" />
          </button>
        </div>
      </div>
    );
  }

  // Current width style depending on mode: small on mobile screens (230px) so map is visible!
  const sidebarWidthStyle = sidebarMode === 'compact' ? 290 : customWidth;

  return (
    <div
      style={{
        width: typeof window !== 'undefined' && window.innerWidth >= 768 ? sidebarWidthStyle : undefined,
        maxWidth: '85vw',
      }}
      className="relative z-30 h-full w-[230px] sm:w-[250px] bg-slate-950/95 backdrop-blur-2xl border-r border-slate-800 p-2.5 sm:p-3 flex flex-col gap-2.5 text-slate-100 shadow-2xl overflow-y-auto shrink-0 transition-all duration-150"
    >
      {/* 1. Header with Size Mode Switcher */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative flex items-center justify-center shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute" />
            <span className="w-2 h-2 rounded-full bg-emerald-400 relative" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] sm:text-xs font-black tracking-wider uppercase text-emerald-400 truncate">
              {sidebarMode === 'compact' ? 'Live HUD' : 'Navigation Cockpit'}
            </div>
            <div className="text-[9px] sm:text-[10px] text-slate-400 truncate">
              To: <strong className="text-white">{targetLocation.name}</strong>
            </div>
          </div>
        </div>

        {/* Mobile Close Stats Button -> Triggers Recommended Best Route with Shining Green Ball! */}
        {onCloseMobileStats && (
          <button
            type="button"
            onClick={onCloseMobileStats}
            className="md:hidden flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black shrink-0 shadow-lg shadow-emerald-950/60 active:scale-95 transition border border-emerald-400"
            title="Close stats & view recommended best route with shining green ball"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close</span>
          </button>
        )}

        {/* Desktop Size Presets Toolbar (Max Map vs Compact vs Normal) */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          {/* Quick Collapse to Rail */}
          <button
            type="button"
            onClick={() => onSidebarModeChange('collapsed')}
            className="p-1 rounded-md bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition"
            title="Minimize sidebar to rail (Maximum Map View)"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>

          {/* Toggle Compact vs Expanded */}
          <button
            type="button"
            onClick={() => onSidebarModeChange(sidebarMode === 'compact' ? 'expanded' : 'compact')}
            className={`p-1 rounded-md border text-[11px] font-bold transition flex items-center gap-1 ${
              sidebarMode === 'compact'
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title={sidebarMode === 'compact' ? 'Switch to Expanded view' : 'Switch to Slim/Compact view (More Map)'}
          >
            {sidebarMode === 'compact' ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{sidebarMode === 'compact' ? 'Slim' : 'Full'}</span>
          </button>

          <button
            type="button"
            onClick={onEndTravel}
            className="p-1 rounded-md bg-rose-950/60 border border-rose-800/60 hover:bg-rose-900 text-rose-300 transition"
            title="Exit Navigation"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Live Telemetry Tiles */}
      <div className={`grid gap-2 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-inner ${
        sidebarMode === 'compact' ? 'grid-cols-2 text-center' : 'grid-cols-3'
      }`}>
        {/* Speed */}
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1">
            <Gauge className="w-3 h-3 text-emerald-400" /> Speed
          </span>
          <span className="text-lg sm:text-xl font-black text-white">
            {currentSpeed} <span className="text-[10px] font-medium text-slate-400">km/h</span>
          </span>
        </div>

        {/* Elapsed Timer */}
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1">
            <Clock className="w-3 h-3 text-cyan-400" /> Elapsed
          </span>
          <span className="text-lg sm:text-xl font-black text-cyan-300 font-mono">
            {formatElapsed(travelSession.elapsedSeconds)}
          </span>
        </div>

        {/* GPS Fix (Shown in expanded mode or small row) */}
        {sidebarMode === 'expanded' && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Radio className="w-3 h-3 text-amber-400" /> GPS Fix
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-200 mt-1">
              ±{Math.round(myLocation.accuracy || 12)}m
            </span>
          </div>
        )}
      </div>

      {/* 3. LIVE TRAFFIC IN SIGHT & TIME FOR TRAFFIC TO GET OVER */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 flex flex-col gap-2.5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200 uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
            <span>Traffic In Sight</span>
          </div>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wide ${
              trafficIntel.overallCongestionLevel === 'severe'
                ? 'bg-rose-950/80 border-rose-700/60 text-rose-300'
                : 'bg-amber-950/80 border-amber-700/60 text-amber-300'
            }`}
          >
            {trafficIntel.overallCongestionLevel}
          </span>
        </div>

        {/* TIME FOR TRAFFIC TO GET OVER FORECAST */}
        <div className="p-2.5 rounded-lg bg-gradient-to-r from-amber-950/70 via-slate-900 to-rose-950/50 border border-amber-500/40 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Traffic Clears In:
            </span>
            <span className="text-sm sm:text-base font-extrabold text-amber-300">
              ~{trafficIntel.clearanceForecastMinutes} mins
            </span>
          </div>
          <div className="text-[10px] text-slate-300">
            Bottleneck delay: <strong>+{trafficIntel.totalDelayMinutes}m</strong>. Normal flow restores in ~{trafficIntel.clearanceForecastMinutes} mins.
          </div>
        </div>

        {/* Detailed Bottleneck list (Collapsed in compact mode) */}
        {sidebarMode === 'expanded' && trafficIntel.activeBottlenecks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-slate-400">
              Bottlenecks Ahead:
            </span>
            {trafficIntel.activeBottlenecks.map((b) => (
              <div
                key={b.id}
                className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-bold text-white truncate text-[11px] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span>{b.locationName}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {b.distanceAheadKm} km • Speed: {b.currentSpeedKmh} km/h
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-rose-400 font-bold text-[11px]">+{b.delayMinutes}m</span>
                  <span className="text-[9px] text-amber-300 block">Clears {b.clearanceTimeMinutes}m</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. ALTERNATIVE ROUTES & TIME-SAVING POSSIBILITIES */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Route Possibilities</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-semibold">Time Savings</span>
        </div>

        {/* On Mobile: Direct Action to Close & Show Recommended Best Route with Shining Green Ball */}
        {onCloseMobileStats && (
          <button
            type="button"
            onClick={onCloseMobileStats}
            className="md:hidden w-full py-2 px-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/50 active:scale-95 transition border border-emerald-400/50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Close &amp; Follow Best Route ➔</span>
          </button>
        )}

        {/* Routes List */}
        <div className="flex flex-col gap-2">
          {trafficIntel.alternateRoutes.map((route) => {
            const isSelected = selectedRoute.id === route.id;
            return (
              <div
                key={route.id}
                className={`p-2.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-slate-900 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: route.color }} />
                      <span className="text-xs font-bold text-white truncate">{route.name}</span>
                    </div>
                    {sidebarMode === 'expanded' && (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{route.via}</div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-white block">{route.durationFormatted}</span>
                    <span className="text-[9px] text-slate-400">{route.distanceFormatted}</span>
                  </div>
                </div>

                <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
                  <div>
                    {route.timeSavedMinutes > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                        <TrendingDown className="w-3 h-3" />
                        <span>Saves {route.timeSavedMinutes}m</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Current</span>
                    )}
                  </div>

                  {isSelected ? (
                    <span className="text-[10px] font-bold text-blue-400 flex items-center gap-0.5">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectRoute(route.id)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white transition active:scale-95"
                    >
                      Switch
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. TEST DRIVE SIMULATOR & CONTROLS */}
      {sidebarMode === 'expanded' && onToggleSimulateDrive && (
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <div className="text-xs font-bold text-slate-200">Test Drive Movement</div>
            <div className="text-[10px] text-slate-400 truncate">
              Simulate car moving on map
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleSimulateDrive}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 ${
              isSimulatingDrive
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {isSimulatingDrive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />}
            <span>{isSimulatingDrive ? 'Stop' : 'Simulate'}</span>
          </button>
        </div>
      )}

      {/* 6. Footer Journey Controls */}
      <div className="mt-auto pt-2.5 border-t border-slate-800 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onTogglePauseTravel}
          className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1 transition border border-slate-700"
        >
          {travelSession.isPaused ? (
            <>
              <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5 text-amber-400" />
              <span>Pause</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onEndTravel}
          className="py-2 px-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-1 transition shadow-md"
        >
          <Square className="w-3.5 h-3.5 fill-white" />
          <span>End</span>
        </button>
      </div>

      {/* 7. DRAGGABLE RESIZER HANDLE ON RIGHT BORDER */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-emerald-500/40 active:bg-emerald-500 transition-colors flex items-center justify-center group"
        title="Drag to resize sidebar width or expand map size"
      >
        <div className="w-1 h-8 rounded-full bg-slate-700 group-hover:bg-emerald-400 transition-colors" />
      </div>
    </div>
  );
};
