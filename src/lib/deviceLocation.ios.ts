import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import type { Coordinates } from '@/stores/runFlowStore';

/**
 * Current device location on iOS and Android (Android re-exports this file).
 *
 * Replaces the former `expo-location` implementation with
 * `@react-native-community/geolocation`:
 *   - iOS asks for permission on first use via the Info.plist
 *     `NSLocationWhenInUseUsageDescription` string (the library prompts).
 *   - Android needs an explicit runtime request for ACCESS_FINE_LOCATION
 *     (declared in AndroidManifest.xml).
 * The callback-based `getCurrentPosition` is wrapped in a Promise and returns
 * the same `{ latitude, longitude, accuracy }` shape the caller expected.
 */
export async function getDeviceLocation(): Promise<Coordinates | null> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return null;
  }

  return new Promise<Coordinates | null>(resolve => {
    Geolocation.getCurrentPosition(
      position =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? undefined,
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
    );
  });
}
