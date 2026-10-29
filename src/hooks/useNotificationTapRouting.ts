import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { notificationTapped } from '../services/notificationEvents';
import { routeForRiderNotification } from '../utils/riderNotifications';
import { useRiderMissionContext } from '../context/RiderMissionContext';
import type { AuthedStackParamList } from '../navigation/AuthedNavigator';

/**
 * Opens what a tapped push is about, with the same router as a tap in the
 * Notifications list (utils/riderNotifications.ts). Called from the tab
 * navigator, which is a screen of the authed stack and so can navigate; the
 * push listener itself (useRegisterPushToken) lives above navigation.
 */
export function useNotificationTapRouting() {
  const navigation = useNavigation<StackNavigationProp<AuthedStackParamList>>();
  const { activeErrands } = useRiderMissionContext();
  const activeIdsRef = useRef<string[]>([]);
  activeIdsRef.current = (activeErrands ?? []).map((errand) => String(errand.id));

  useEffect(
    () =>
      notificationTapped.subscribe((payload) => {
        const route = routeForRiderNotification(
          { type: payload.type ?? '', errandId: payload.errandId },
          activeIdsRef.current
        );
        if (route.kind === 'chat') navigation.navigate('DispatcherChat');
        else if (route.kind === 'home') navigation.navigate('Tabs');
        else if (route.kind === 'task') navigation.navigate('Task');
        else if (route.kind === 'details') navigation.navigate('ErrandDetails', { errandId: route.errandId });
      }),
    [navigation]
  );
}
