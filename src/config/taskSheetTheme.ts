import { Colors } from './theme';
import { RiderSurfaceColors } from './riderSurfaceTheme';

/** Shared neutral surfaces with task completion feedback. */
export const TaskSheetColors = {
  ...RiderSurfaceColors,
  completed: Colors.success,
  completedSurface: Colors.successBg,
} as const;
