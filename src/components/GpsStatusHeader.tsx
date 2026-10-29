import React from 'react';
import { Locate, Navigation, Building2 } from 'lucide-react';
import { GpsLocation } from '../types/gps';

interface GpsStatusHeaderProps {
  location: GpsLocation | null;
  isAcquiring: boolean;
  onRequestGps: () => void;
}

export const GpsStatusHeader: React.FC<GpsStatusHeaderProps> = ({
  location,
  isAcquiring,
  onRequestGps,
}) => {
  const colony = location?.addressDetails?.colony;
  const pincode = location?.addressDetails?.pincode;

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Navigation className="w-5 h-5 -rotate-45" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              GPS Location &amp; Distance
            </h1>
            <p className="text-xs text-slate-400">
              Pinpoint live colony &amp; PIN code • Compare worldwide distance
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Live Colony & PIN Code Badge if detected */}
          {colony && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-950/50 border border-blue-700/40 text-xs text-blue-300">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-semibold">{colony}</span>
              {pincode && (
                <span className="bg-blue-900/60 text-blue-200 px-1.5 py-0.2 rounded font-mono text-[10px]">
                  {pincode}
                </span>
              )}
            </div>
          )}

          {/* Detect Live Location Button */}
          <button
            onClick={onRequestGps}
            disabled={isAcquiring}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50 shadow-md shadow-blue-600/20"
            title="Detect live GPS location with exact colony and PIN code"
          >
            <Locate className={`w-3.5 h-3.5 ${isAcquiring ? 'animate-spin' : ''}`} />
            <span>{isAcquiring ? 'Detecting Live GPS...' : 'Detect Live Location'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
