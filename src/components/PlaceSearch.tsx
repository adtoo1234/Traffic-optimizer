import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Search, MapPin, Loader2, X } from 'lucide-react';
import { Coordinates, SearchedLocation } from '../types/gps';
import { parseGoogleAddressComponents, reverseGeocodeLocation } from '../utils/geocoding';

interface PlaceSearchProps {
  label?: string;
  placeholder?: string;
  onLocationSelect: (location: SearchedLocation) => void;
  selectedLocation: SearchedLocation | null;
  indicatorColor?: 'blue' | 'rose';
  actionButton?: React.ReactNode;
  locationBiasCoords?: Coordinates;
}

export const PlaceSearch: React.FC<PlaceSearchProps> = ({
  label,
  placeholder = 'Search any city, building, colony, or address...',
  onLocationSelect,
  selectedLocation,
  indicatorColor = 'blue',
  actionButton,
  locationBiasCoords,
}) => {
  const placesLib = useMapsLibrary('places');
  const [inputValue, setInputValue] = useState(selectedLocation?.name || '');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync input value if selectedLocation changed externally
  useEffect(() => {
    if (selectedLocation) {
      setInputValue(selectedLocation.name);
    }
  }, [selectedLocation]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
  }, []);

  useEffect(() => {
    if (!placesLib) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = inputValue.trim();
    if (!trimmed) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    // Direct coordinates check (e.g. "35.6762, 139.6503")
    const coordMatch = trimmed.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }

        const request: google.maps.places.AutocompleteRequest = {
          input: trimmed,
          sessionToken: sessionTokenRef.current,
        };

        // Bias search towards user's current city/area if known
        if (locationBiasCoords) {
          request.locationBias = {
            center: locationBiasCoords,
            radius: 40000, // 40km local bias
          };
        }

        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        setSuggestions(res.suggestions || []);
      } catch (err) {
        console.warn('Autocomplete error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 220);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputValue, placesLib, locationBiasCoords]);

  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!placesLib || !suggestion.placePrediction) return;

    setIsLoading(true);
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'],
      });

      if (place.location) {
        const coords = {
          lat: place.location.lat(),
          lng: place.location.lng(),
        };

        let addressDetails;
        if (place.addressComponents && place.formattedAddress) {
          addressDetails = parseGoogleAddressComponents(
            place.addressComponents as any,
            place.formattedAddress
          );
        } else {
          const rev = await reverseGeocodeLocation(coords);
          addressDetails = rev.details;
        }

        const newLocation: SearchedLocation = {
          id: place.id || `${Date.now()}`,
          name: place.displayName || (suggestion.placePrediction as any)?.text || 'Selected Place',
          formattedAddress: place.formattedAddress || '',
          coords,
          placeId: place.id,
          addressDetails,
          addedAt: Date.now(),
        };

        onLocationSelect(newLocation);
        setInputValue(newLocation.name);
        setIsOpen(false);
      }
    } catch (err) {
      console.error('Failed to fetch place details:', err);
    } finally {
      setIsLoading(false);
      resetSession();
    }
  };

  // Direct text search fallback if user presses Enter without selecting from dropdown
  const handleDirectSearch = async (query: string) => {
    if (!placesLib || !query.trim()) return;

    // Check if coordinates
    const coordMatch = query.trim().match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[3]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        const rev = await reverseGeocodeLocation({ lat, lng });
        onLocationSelect({
          id: `coord-${Date.now()}`,
          name: rev.name,
          formattedAddress: rev.formattedAddress,
          coords: { lat, lng },
          addressDetails: rev.details,
          addedAt: Date.now(),
        });
        setIsOpen(false);
        return;
      }
    }

    // If top suggestion exists, use it
    if (suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0]);
      return;
    }

    // Otherwise use Place.searchByText
    setIsLoading(true);
    try {
      if ((placesLib as any).Place?.searchByText) {
        const searchRequest: any = {
          textQuery: query,
          fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'],
        };
        if (locationBiasCoords) {
          searchRequest.locationBias = {
            center: locationBiasCoords,
            radius: 40000,
          };
        }

        const res = await (placesLib as any).Place.searchByText(searchRequest);
        if (res.places && res.places.length > 0) {
          const firstPlace = res.places[0];
          if (firstPlace.location) {
            const coords = {
              lat: firstPlace.location.lat(),
              lng: firstPlace.location.lng(),
            };

            let addressDetails;
            if (firstPlace.addressComponents && firstPlace.formattedAddress) {
              addressDetails = parseGoogleAddressComponents(
                firstPlace.addressComponents,
                firstPlace.formattedAddress
              );
            } else {
              const rev = await reverseGeocodeLocation(coords);
              addressDetails = rev.details;
            }

            const newLoc: SearchedLocation = {
              id: firstPlace.id || `${Date.now()}`,
              name: firstPlace.displayName || query,
              formattedAddress: firstPlace.formattedAddress || '',
              coords,
              placeId: firstPlace.id,
              addressDetails,
              addedAt: Date.now(),
            };

            onLocationSelect(newLoc);
            setInputValue(newLoc.name);
            setIsOpen(false);
          }
        }
      }
    } catch (err) {
      console.warn('Direct place search error:', err);
    } finally {
      setIsLoading(false);
      resetSession();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDirectSearch(inputValue);
    }
  };

  const iconColorClass = indicatorColor === 'rose' ? 'text-rose-500' : 'text-blue-500';
  const focusRingClass =
    indicatorColor === 'rose'
      ? 'focus:ring-rose-500/50 focus:border-rose-500'
      : 'focus:ring-blue-500/50 focus:border-blue-500';

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                indicatorColor === 'rose' ? 'bg-rose-500' : 'bg-blue-500'
              }`}
            />
            {label}
          </label>
          {actionButton}
        </div>
      )}

      <div className="relative flex items-center">
        <div className={`absolute left-3.5 ${iconColorClass} pointer-events-none`}>
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-slate-400" />
          )}
        </div>

        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full pl-10 pr-9 py-2.5 bg-slate-950 text-slate-100 placeholder-slate-500 text-sm font-medium rounded-xl border border-slate-700/80 shadow-xs focus:outline-none focus:ring-2 ${focusRingClass} transition-all`}
        />

        {inputValue && (
          <button
            type="button"
            onClick={() => {
              setInputValue('');
              setSuggestions([]);
              resetSession();
            }}
            className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            aria-label="Clear input"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
          {suggestions.map((suggestion, index) => {
            const pred = suggestion.placePrediction as any;
            const primaryText =
              pred?.mainText?.text ||
              pred?.text?.text ||
              pred?.text ||
              'Unknown Place';
            const secondaryText =
              pred?.secondaryText?.text ||
              pred?.secondaryText ||
              '';

            return (
              <button
                key={index}
                type="button"
                onClick={() => handleSelectSuggestion(suggestion)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-slate-800 flex items-start gap-2.5 transition-colors border-b border-slate-800/80 last:border-b-0"
              >
                <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${iconColorClass}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">
                    {primaryText}
                  </div>
                  {secondaryText && (
                    <div className="text-xs text-slate-400 truncate">
                      {secondaryText}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
