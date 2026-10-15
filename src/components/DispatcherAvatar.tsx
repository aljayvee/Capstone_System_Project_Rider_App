import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Headphones } from 'lucide-react-native';
import { riderApiService } from '../config/apiConfig';
import { Colors } from '../config/theme';

export interface DispatcherAvatarProps {
  dispatcherId?: string | number | null;
  size?: number;
  iconSize?: number;
}

/** The dispatcher's avatar in the Rider ↔ Dispatcher chat header. Reuses
 * riderApiService.fetchProfilePhoto — the same rider-owned-photo endpoint
 * already used for a rider's own profile picture, since the underlying
 * RiderProfilePhoto table stores OWNER/DISPATCHER/RIDER avatars alike. */
export default function DispatcherAvatar({ dispatcherId, size = 34, iconSize }: DispatcherAvatarProps) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhotoUri(null);
    if (!dispatcherId) return;
    riderApiService.fetchProfilePhoto(dispatcherId).then((uri) => {
      if (!cancelled) setPhotoUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [dispatcherId]);

  const resolvedIconSize = iconSize ?? Math.round(size * 0.5);

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: Colors.whiteOverlayLight,
        },
      ]}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={[styles.image, { borderRadius: size / 2 }]} />
      ) : (
        <Headphones size={resolvedIconSize} color={Colors.textWhite} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
