import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient';
import { onActiveSocketChange } from '../services/liveLocationSocket';

export interface RiderMaintenanceNoticeState {
  isActive: boolean;
  maintenanceType: 'SCHEDULED' | 'EMERGENCY' | 'UPGRADE' | 'SECURITY';
  header: string;
  message: string;
  supportContact?: string;
  customColor?: string;
  updatedAt?: string;
}

export function useMaintenanceNotice(): RiderMaintenanceNoticeState {
  const [notice, setNotice] = useState<RiderMaintenanceNoticeState>({
    isActive: false,
    maintenanceType: 'SCHEDULED',
    header: 'System Under Maintenance',
    message: 'Scheduled system maintenance in progress. Services will resume shortly.',
    supportContact: 'support@sugo-express.org',
  });

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // 1. HTTP status fetch
    const fetchStatus = async () => {
      try {
        const res = await apiClient.get('/maintenance/status', {
          params: { portal: 'rider' },
          timeout: 5000,
        });
        if (isMountedRef.current && res.data) {
          setNotice({
            isActive: Boolean(res.data.isActive),
            maintenanceType: res.data.maintenanceType || 'SCHEDULED',
            header: res.data.header || 'System Under Maintenance',
            message:
              res.data.message ||
              res.data.notice ||
              'Scheduled system maintenance in progress. Services will resume shortly.',
            supportContact: res.data.supportContact,
            customColor: res.data.customColor,
            updatedAt: res.data.updatedAt,
          });
        }
      } catch {
        // Silently fail open; riders must not be blocked by network flakes
      }
    };

    fetchStatus();

    // 2. Real-time push listener attached to the shared socket
    let socketCleanup: (() => void) | undefined;
    const unsubSocketChange = onActiveSocketChange((socket) => {
      socketCleanup?.();
      socketCleanup = undefined;

      if (!socket || !isMountedRef.current) return;

      const handler = (payload: any) => {
        if (!isMountedRef.current) return;
        if (payload && payload.portal === 'rider') {
          setNotice({
            isActive: Boolean(payload.isActive),
            maintenanceType: payload.maintenanceType || 'SCHEDULED',
            header: payload.header || 'System Under Maintenance',
            message:
              payload.message ||
              payload.notice ||
              'Scheduled system maintenance in progress. Services will resume shortly.',
            supportContact: payload.supportContact,
            customColor: payload.customColor,
            updatedAt: payload.updatedAt,
          });
        }
      };

      socket.on('maintenance:update', handler);
      socketCleanup = () => {
        socket.off('maintenance:update', handler);
      };
    });

    // 3. 60-second fallback polling interval
    const interval = setInterval(fetchStatus, 60000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      unsubSocketChange();
      socketCleanup?.();
    };
  }, []);

  return notice;
}

export default useMaintenanceNotice;
