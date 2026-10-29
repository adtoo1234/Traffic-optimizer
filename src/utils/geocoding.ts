import { AddressDetails, Coordinates } from '../types/gps';

/**
 * Extracts colony, PIN code, and detailed components from Google Places address_components
 */
export function parseGoogleAddressComponents(
  components: google.maps.places.AddressComponent[] | google.maps.GeocoderAddressComponent[],
  formattedAddress: string
): AddressDetails {
  const details: AddressDetails = {
    formattedAddress,
  };

  let sublocality1 = '';
  let sublocality2 = '';
  let neighborhood = '';
  let route = '';
  let streetNumber = '';
  let premise = '';

  for (const comp of components as any[]) {
    const types: string[] = comp.types || [];
    const longName = comp.long_name || comp.longText || '';
    const shortName = comp.short_name || comp.shortText || '';

    if (types.includes('postal_code')) {
      details.pincode = longName || shortName;
    }
    if (types.includes('sublocality_level_1')) {
      sublocality1 = longName;
    }
    if (types.includes('sublocality_level_2')) {
      sublocality2 = longName;
    }
    if (types.includes('neighborhood')) {
      neighborhood = longName;
    }
    if (types.includes('locality')) {
      details.locality = longName;
    }
    if (types.includes('administrative_area_level_2')) {
      details.district = longName;
    }
    if (types.includes('administrative_area_level_1')) {
      details.state = longName;
    }
    if (types.includes('country')) {
      details.country = longName;
    }
    if (types.includes('route')) {
      route = longName;
    }
    if (types.includes('street_number')) {
      streetNumber = longName;
    }
    if (types.includes('premise')) {
      premise = longName;
    }
  }

  // Determine colony / neighborhood
  details.colony = sublocality1 || sublocality2 || neighborhood || '';

  // Determine street / building
  const streetParts = [premise, streetNumber, route].filter(Boolean);
  details.street = streetParts.join(' ');

  // Fallback for locality
  if (!details.locality && details.district) {
    details.locality = details.district;
  }

  return details;
}

/**
 * Reverse geocodes coordinates to pinpoint exact Colony, PIN code, and Address
 * Uses high-accuracy reverse geocoding that does not require legacy Google Geocoding billing.
 */
export async function reverseGeocodeLocation(coords: Coordinates): Promise<{
  name: string;
  formattedAddress: string;
  details: AddressDetails;
}> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'en',
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};

      // Pinpoint Colony / Sublocality / Neighborhood / Ward
      const colony =
        addr.suburb ||
        addr.neighbourhood ||
        addr.residential ||
        addr.city_district ||
        addr.quarter ||
        addr.hamlet ||
        addr.subdistrict ||
        '';

      // Pinpoint PIN / Postal code
      const pincode = addr.postcode || '';

      // Street & building
      const street = [addr.house_number, addr.road || addr.pedestrian || addr.street]
        .filter(Boolean)
        .join(' ');

      const locality = addr.city || addr.town || addr.village || addr.municipality || '';
      const district = addr.county || addr.state_district || '';
      const state = addr.state || '';
      const country = addr.country || '';

      const details: AddressDetails = {
        colony,
        pincode,
        street,
        locality,
        district,
        state,
        country,
        formattedAddress: data.display_name || `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
      };

      const nameParts: string[] = [];
      if (colony) nameParts.push(colony);
      if (locality && locality !== colony) nameParts.push(locality);
      if (pincode) nameParts.push(`PIN: ${pincode}`);

      const displayName =
        nameParts.length > 0
          ? nameParts.join(', ')
          : `Coordinates (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;

      return {
        name: displayName,
        formattedAddress: data.display_name || '',
        details,
      };
    }
  } catch (err) {
    console.warn('Reverse geocoding error:', err);
  }

  // Graceful fallback to coordinate label
  return {
    name: `Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`,
    formattedAddress: `Lat: ${coords.lat.toFixed(6)}, Lng: ${coords.lng.toFixed(6)}`,
    details: {
      formattedAddress: `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
    },
  };
}
