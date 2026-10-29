import { useState, useEffect, useCallback, useRef } from 'react';
import { GpsLocation } from '../types/gps';
import { reverseGeocodeLocation } from '../utils/geocoding';

export function useGeolocation() {
  const [location, setLocation] = useState<GpsLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAcquiring, setIsAcquiring] = useState<boolean>(true);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [isLiveTracking, setIsLiveTracking] = useState<boolean>(false);
  const watchIdRef = useRef<number | null>(null);

  const requestGpsPosition = useCallback((enableHighAccuracy = true) => {
    setIsAcquiring(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setIsAcquiring(false);
      const fallbackCoords = { lat: 28.6139, lng: 77.209 }; // Default coordinates
      setLocation({
        coords: fallbackCoords,
        name: 'New Delhi (Default)',
        isSimulated: true,
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        const initialLoc: GpsLocation = {
          coords,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0, // convert m/s to km/h
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
          name: 'Locating exact address...',
          isSimulated: false,
        };
        setLocation(initialLoc);
        setIsAcquiring(false);
        setIsGeocoding(true);

        // Perform reverse geocoding to pinpoint colony and PIN code
        reverseGeocodeLocation(coords)
          .then(({ name, formattedAddress, details }) => {
            setLocation((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                name,
                address: formattedAddress,
                addressDetails: details,
              };
            });
          })
          .catch((err) => {
            console.warn('Reverse geocoding error:', err);
          })
          .finally(() => {
            setIsGeocoding(false);
          });
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        let errorMsg = 'Could not detect your live GPS location.';
        if (err.code === err.PERMISSION_DENIED) {
          errorMsg = 'Location permission was denied. Please allow location access or search your building above.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMsg = 'GPS satellite/network position unavailable.';
        } else if (err.code === err.TIMEOUT) {
          errorMsg = 'Location request timed out. Please try again.';
        }
        setError(errorMsg);
        setIsAcquiring(false);

        // Graceful fallback
        setLocation((prev) =>
          prev || {
            coords: { lat: 28.6139, lng: 77.209 },
            name: 'New Delhi',
            address: 'Connaught Place, New Delhi, India',
            addressDetails: {
              colony: 'Connaught Place',
              pincode: '110001',
              locality: 'New Delhi',
              state: 'Delhi',
              country: 'India',
              formattedAddress: 'Connaught Place, New Delhi, Delhi 110001, India',
            },
            isSimulated: true,
          }
        );
      },
      {
        enableHighAccuracy,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  }, []);

  // Continuous watchPosition during active travel session
  const startLiveTracking = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;
    setIsLiveTracking(true);

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const speedKmh = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : null;
          setLocation((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              coords: {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              },
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude,
              speed: speedKmh ?? prev.speed,
              heading: pos.coords.heading ?? prev.heading,
              timestamp: pos.timestamp,
            };
          });
        },
        (err) => {
          console.warn('Live watchPosition update error:', err.message);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 10000,
        }
      );
    } catch (e) {
      console.warn('Failed to start watchPosition:', e);
    }
  }, []);

  const stopLiveTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsLiveTracking(false);
  }, []);

  useEffect(() => {
    requestGpsPosition(true);
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [requestGpsPosition]);

  return {
    location,
    setLocation,
    error,
    isAcquiring,
    isGeocoding,
    isLiveTracking,
    requestGpsPosition,
    startLiveTracking,
    stopLiveTracking,
  };
}
