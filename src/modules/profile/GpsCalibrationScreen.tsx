import React from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import Svg, { Circle, Line } from 'react-native-svg';
import {
  ChevronLeft,
  CircleCheck,
  CircleX,
  Crosshair,
  RotateCcw,
  Satellite,
  TriangleAlert,
} from 'lucide-react-native';
import {
  analyzeCalibration,
  CALIBRATION_SECONDS,
  toSavedCalibration,
  weightedCenter,
  type CalibrationGrade,
  type CalibrationReport,
  type CalibrationSample,
  type ProviderState,
  type SavedCalibration,
} from '../../utils/gpsCalibration';
import { GpsStabilizer } from '../../utils/gpsStabilizer';
import { liveStabilizer, loadGpsCalibration, saveGpsCalibration } from '../../services/gpsSteadying';
import {
  BorderRadius,
  Colors,
  FontSizes,
  FontWeights,
  MAX_CONTENT_WIDTH,
  Spacing,
  moderateScale,
  scaledFontSize,
} from '../../config/theme';
import { ProfileColors } from './profileTheme';

type Phase = 'intro' | 'starting' | 'running' | 'done' | 'blocked';

type Blocked = 'permission' | 'location_off' | 'watch_failed';

const GRADE_COPY: Record<CalibrationGrade, { title: string; tone: 'good' | 'warn' | 'bad' }> = {
  good: { title: 'GPS is steady', tone: 'good' },
  fair: { title: 'GPS is usable, but wanders', tone: 'warn' },
  poor: { title: 'GPS is unsteady here', tone: 'bad' },
  moved: { title: 'The phone moved', tone: 'warn' },
  no_fix: { title: 'No GPS position', tone: 'bad' },
};

const M_PER_DEG = 111_320;

const formatMeters = (value: number | null) => (value === null ? '-' : `${value.toFixed(value < 10 ? 1 : 0)} m`);

/**
 * The GPS check, from Profile.
 *
 * The rider keeps the phone still for 30 seconds. Every raw fix is drawn as a
 * dot around the phone's real spot, next to the pin as Sugo Rider shows it
 * (utils/gpsStabilizer), so the rider can see both the phone's GPS noise and
 * that the pin does not follow it. The scatter measured here becomes the
 * radius the live pin holds still within (services/gpsSteadying), and poor
 * results come with the specific fix: open sky, Google Location Accuracy,
 * battery saver, a fake-location app.
 *
 * Satellite counts are not shown: expo-location does not expose them. What it
 * does expose, the phone's accuracy figure and its Doppler speed, is what the
 * pin actually runs on.
 */
export default function GpsCalibrationScreen() {
  const navigation = useNavigation();
  const [phase, setPhase] = React.useState<Phase>('intro');
  const [blocked, setBlocked] = React.useState<Blocked | null>(null);
  const [provider, setProvider] = React.useState<ProviderState | null>(null);
  const [saved, setSaved] = React.useState<SavedCalibration | null>(null);
  const [saveFailed, setSaveFailed] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [live, setLive] = React.useState<CalibrationReport | null>(null);
  const [report, setReport] = React.useState<CalibrationReport | null>(null);
  const [plot, setPlot] = React.useState<{ samples: CalibrationSample[]; pin: { latitude: number; longitude: number } | null }>({
    samples: [],
    pin: null,
  });
  const [turningOn, setTurningOn] = React.useState(false);
  const [showStartModal, setShowStartModal] = React.useState(false);

  const subscriptionRef = React.useRef<Location.LocationSubscription | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const samplesRef = React.useRef<CalibrationSample[]>([]);
  const steadiedRef = React.useRef<Array<{ latitude: number; longitude: number }>>([]);
  const stabilizerRef = React.useRef<GpsStabilizer | null>(null);
  const startedAtRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  const readProvider = React.useCallback(async (): Promise<ProviderState | null> => {
    try {
      const status = await Location.getProviderStatusAsync();
      const state: ProviderState = {
        locationServicesEnabled: status.locationServicesEnabled,
        gpsAvailable: status.gpsAvailable,
        networkAvailable: status.networkAvailable,
      };
      if (mountedRef.current) setProvider(state);
      return state;
    } catch {
      return null;
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    void loadGpsCalibration().then((value) => {
      if (mountedRef.current) setSaved(value);
    });
    void readProvider();
    return () => {
      mountedRef.current = false;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [readProvider]);

  const stopListening = React.useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finish = React.useCallback(async () => {
    stopListening();
    const endedAt = Date.now();
    const state = (await readProvider()) ?? provider;
    const result = analyzeCalibration({
      samples: samplesRef.current,
      steadied: steadiedRef.current,
      startedAt: startedAtRef.current,
      endedAt,
      provider: state,
    });
    if (!mountedRef.current) return;
    setReport(result);
    setPhase('done');

    const toKeep = toSavedCalibration(result, endedAt);
    if (toKeep) {
      try {
        await saveGpsCalibration(toKeep);
        if (mountedRef.current) {
          setSaved(toKeep);
          setSaveFailed(false);
        }
      } catch {
        // The pin was still retuned for this session (saveGpsCalibration
        // applies before it stores); only keeping it for next time failed.
        if (mountedRef.current) setSaveFailed(true);
      }
    }
  }, [provider, readProvider, stopListening]);

  const start = React.useCallback(async () => {
    setPhase('starting');
    setBlocked(null);
    setReport(null);
    setSaveFailed(false);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setBlocked('permission');
        setPhase('blocked');
        return;
      }
    } catch {
      setBlocked('permission');
      setPhase('blocked');
      return;
    }

    const state = await readProvider();
    if (state && !state.locationServicesEnabled) {
      setBlocked('location_off');
      setPhase('blocked');
      return;
    }

    samplesRef.current = [];
    steadiedRef.current = [];
    // A steadier of its own, tuned like the live pin is right now, so the
    // rider sees what the map would have shown during these 30 seconds.
    stabilizerRef.current = new GpsStabilizer({ lockRadiusMeters: liveStabilizer.lockRadiusMeters });
    startedAtRef.current = Date.now();
    setElapsed(0);
    setLive(null);
    setPlot({ samples: [], pin: null });

    try {
      subscriptionRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          if (!mountedRef.current) return;
          const sample: CalibrationSample = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracyMeters: loc.coords.accuracy ?? null,
            speedMps: loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed : null,
            timestamp: loc.timestamp,
            mocked: loc.mocked === true,
          };
          samplesRef.current = [...samplesRef.current, sample];

          const verdict = stabilizerRef.current?.push({
            latitude: sample.latitude,
            longitude: sample.longitude,
            accuracyMeters: sample.accuracyMeters,
            speedMps: sample.speedMps,
            headingDeg: loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : null,
            timestamp: sample.timestamp,
          });
          if (verdict && verdict.kind !== 'reject') {
            steadiedRef.current = [...steadiedRef.current, { latitude: verdict.fix.latitude, longitude: verdict.fix.longitude }];
          }

          setLive(
            analyzeCalibration({
              samples: samplesRef.current,
              steadied: steadiedRef.current,
              startedAt: startedAtRef.current,
              endedAt: Date.now(),
              provider: null,
            })
          );
          setPlot({
            samples: samplesRef.current,
            pin: steadiedRef.current[steadiedRef.current.length - 1] ?? null,
          });
        }
      );
    } catch {
      stopListening();
      if (!mountedRef.current) return;
      setBlocked('watch_failed');
      setPhase('blocked');
      return;
    }

    if (!mountedRef.current) {
      stopListening();
      return;
    }
    setPhase('running');
    timerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(Math.min(CALIBRATION_SECONDS, seconds));
      if (seconds >= CALIBRATION_SECONDS) void finish();
    }, 250);
  }, [finish, readProvider, stopListening]);

  const cancel = React.useCallback(() => {
    stopListening();
    setPhase('intro');
    setLive(null);
    setPlot({ samples: [], pin: null });
  }, [stopListening]);

  const turnOnLocationAccuracy = React.useCallback(async () => {
    setTurningOn(true);
    try {
      // Android's own dialog: the rider approves it there, nothing changes silently.
      await Location.enableNetworkProviderAsync();
    } catch {
      // Declined in the dialog; the status row below keeps saying it is off.
    } finally {
      await readProvider();
      if (mountedRef.current) setTurningOn(false);
    }
  }, [readProvider]);

  const lockRadius = saved?.lockRadiusMeters ?? liveStabilizer.lockRadiusMeters;
  const shownReport = phase === 'done' ? report : live;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            stopListening();
            navigation.goBack();
          }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to your profile"
        >
          <ChevronLeft size={22} color={Colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} maxFontSizeMultiplier={1.2}>GPS Calibration</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ProviderRows provider={provider} onTurnOn={turnOnLocationAccuracy} turningOn={turningOn} />

        {phase === 'intro' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.15}>How the check works</Text>
            {[
              'Go outside, or stand by a window with open sky.',
              'Set the phone down, or hold it still, screen up.',
              `Keep it still for ${CALIBRATION_SECONDS} seconds. Sugo Rider measures how far this phone's GPS wanders, and sets your map pin to ignore that much.`,
            ].map((line, index) => (
              <View key={line} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.body} maxFontSizeMultiplier={1.15}>{line}</Text>
              </View>
            ))}
            {saved ? (
              <Text style={styles.muted} maxFontSizeMultiplier={1.15}>
                Last check {new Date(saved.measuredAt).toLocaleDateString()}: GPS wandered {formatMeters(saved.spreadP95Meters)}.
                Your pin holds still within {formatMeters(saved.lockRadiusMeters)}.
              </Text>
            ) : (
              <Text style={styles.muted} maxFontSizeMultiplier={1.15}>
                Not checked on this phone yet. Your pin holds still within {formatMeters(lockRadius)} until you run it.
              </Text>
            )}
            <PrimaryButton label="Start calibration" icon="start" onPress={() => setShowStartModal(true)} testID="gps-calibration-start" />
          </View>
        )}

        {phase === 'starting' && (
          <View style={[styles.section, styles.centered]}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.muted} maxFontSizeMultiplier={1.15}>Starting the GPS</Text>
          </View>
        )}

        {phase === 'blocked' && blocked && (
          <View style={[styles.section, styles.errorSection]}>
            <View style={styles.inlineRow}>
              <CircleX size={20} color={Colors.danger} />
              <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.15}>
                {blocked === 'permission'
                  ? 'Location permission is off'
                  : blocked === 'location_off'
                    ? 'Location is switched off'
                    : 'The GPS could not be started'}
              </Text>
            </View>
            <Text style={styles.body} maxFontSizeMultiplier={1.15}>
              {blocked === 'permission'
                ? 'Sugo Rider needs your location for this check. Allow it for Sugo Rider in your phone settings, then try again.'
                : blocked === 'location_off'
                  ? 'Turn on Location. Android asks you to confirm.'
                  : 'Something on the phone refused the request. Close other GPS apps and try again.'}
            </Text>
            {blocked === 'location_off' ? (
              <PrimaryButton
                label={turningOn ? 'Waiting for Android' : 'Turn on Location'}
                icon="none"
                disabled={turningOn}
                onPress={async () => {
                  await turnOnLocationAccuracy();
                  if (mountedRef.current) setShowStartModal(true);
                }}
              />
            ) : (
              <PrimaryButton label="Try again" icon="again" onPress={() => setShowStartModal(true)} />
            )}
          </View>
        )}

        {phase === 'running' && (
          <View style={styles.section}>
            <View style={styles.inlineRow}>
              <Crosshair size={18} color={Colors.textDark} />
              <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.15}>Keep the phone still</Text>
              <Text style={styles.countdown} maxFontSizeMultiplier={1.15}>{CALIBRATION_SECONDS - elapsed}s</Text>
            </View>
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: CALIBRATION_SECONDS, now: elapsed }}
            >
              <View style={[styles.progressFill, { width: `${(elapsed / CALIBRATION_SECONDS) * 100}%` }]} />
            </View>
            {plot.samples.length === 0 ? (
              <View style={[styles.plotEmpty, styles.centered]}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.muted} maxFontSizeMultiplier={1.15}>
                  Waiting for the satellites ({elapsed}s). Under a roof this can take a minute.
                </Text>
              </View>
            ) : (
              <TargetPlot samples={plot.samples} pin={plot.pin} lockRadius={lockRadius} />
            )}
            {shownReport && <Stats report={shownReport} />}
            <TouchableOpacity
              onPress={cancel}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Stop the calibration"
            >
              <Text style={styles.secondaryText} maxFontSizeMultiplier={1.15}>Stop</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'done' && report && (
          <View style={styles.section}>
            <GradeBanner grade={report.grade} />
            {plot.samples.length > 0 && <TargetPlot samples={plot.samples} pin={plot.pin} lockRadius={lockRadius} />}
            <Stats report={report} />
            <View style={styles.adviceList}>
              {report.advice.map((line) => (
                <Text key={line} style={styles.body} maxFontSizeMultiplier={1.15}>
                  {line}
                </Text>
              ))}
            </View>
            {report.lockRadiusMeters !== null ? (
              <Text style={styles.savedNote} maxFontSizeMultiplier={1.15}>
                {saveFailed
                  ? `Applied for now: your pin holds still within ${formatMeters(report.lockRadiusMeters)}. It could not be saved for next time; run the check again after restarting the app.`
                  : `Saved. Your pin now holds still within ${formatMeters(report.lockRadiusMeters)} until the phone really moves.`}
              </Text>
            ) : (
              <Text style={styles.savedNote} maxFontSizeMultiplier={1.15}>
                Nothing was changed. Your pin still holds still within {formatMeters(lockRadius)}.
              </Text>
            )}
            <PrimaryButton label="Run again" icon="again" onPress={() => setShowStartModal(true)} />
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showStartModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowStartModal(false)}
        testID="gps-calibration-start-modal"
      >
        <SafeAreaView edges={['top', 'bottom']} style={styles.modalBackdrop}>
          <View style={styles.modalContent} accessibilityViewIsModal>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalBody} bounces={false}>
              <Crosshair size={32} color={ProfileColors.accent} />
              <Text style={styles.modalTitle} accessibilityRole="header" maxFontSizeMultiplier={1.25}>
                Ready to calibrate?
              </Text>
              <Text style={styles.modalText} maxFontSizeMultiplier={1.25}>
                Stop in a safe place with open sky, or stand near a window.
              </Text>
              <Text style={styles.modalText} maxFontSizeMultiplier={1.25}>
                Set your phone down or hold it screen up. Keep it still for {CALIBRATION_SECONDS} seconds once the check starts.
              </Text>
            </ScrollView>
            <View style={styles.modalActions}>
              <PrimaryButton
                label="Begin calibration"
                icon="start"
                testID="gps-calibration-confirm-start"
                onPress={() => {
                  setShowStartModal(false);
                  void start();
                }}
              />
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowStartModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Not now"
              >
                <Text style={styles.modalCancelText} maxFontSizeMultiplier={1.25}>Not now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function ProviderRows({
  provider,
  onTurnOn,
  turningOn,
}: {
  provider: ProviderState | null;
  onTurnOn: () => void;
  turningOn: boolean;
}) {
  if (!provider) {
    return (
      <View style={[styles.section, styles.centered]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }
  const rows: Array<{ label: string; on: boolean | undefined; hint: string }> = [
    { label: 'Location', on: provider.locationServicesEnabled, hint: 'Needed for everything below.' },
    { label: 'Satellite GPS', on: provider.gpsAvailable, hint: 'The position itself.' },
    {
      label: 'Google Location Accuracy',
      on: provider.networkAvailable,
      hint: 'Wi-Fi and cell towers help the phone find the satellites faster.',
    },
  ];
  const needsTurnOn = !provider.locationServicesEnabled || provider.networkAvailable === false;
  return (
    <View style={styles.section}>
      <View style={styles.inlineRow}>
        <Satellite size={18} color={Colors.textDark} />
        <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.15}>This phone</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.statusRow}>
          <View style={styles.statusText}>
            <Text style={styles.statusLabel} maxFontSizeMultiplier={1.15}>{row.label}</Text>
            <Text style={styles.muted} maxFontSizeMultiplier={1.15}>{row.hint}</Text>
          </View>
          <View style={[styles.chip, row.on === false ? styles.chipOff : row.on ? styles.chipOn : styles.chipUnknown]}>
            <Text
              style={[styles.chipText, row.on === false ? styles.chipTextOff : row.on ? styles.chipTextOn : null]}
              maxFontSizeMultiplier={1.1}
            >
              {row.on === undefined ? 'Unknown' : row.on ? 'On' : 'Off'}
            </Text>
          </View>
        </View>
      ))}
      {needsTurnOn && (
        <TouchableOpacity
          onPress={onTurnOn}
          disabled={turningOn}
          style={styles.secondaryBtn}
          accessibilityRole="button"
          accessibilityState={{ busy: turningOn }}
          accessibilityLabel="Turn on location accuracy"
        >
          {turningOn ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Text style={styles.secondaryText} maxFontSizeMultiplier={1.15}>Turn on</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

function GradeBanner({ grade }: { grade: CalibrationGrade }) {
  const { title, tone } = GRADE_COPY[grade];
  const Icon = tone === 'good' ? CircleCheck : tone === 'warn' ? TriangleAlert : CircleX;
  const color = tone === 'good' ? Colors.success : tone === 'warn' ? Colors.warning : Colors.danger;
  const background = tone === 'good' ? Colors.successBg : tone === 'warn' ? Colors.warningBg : Colors.dangerBg;
  return (
    <View style={[styles.banner, { backgroundColor: background }]} accessibilityRole="summary">
      <Icon size={20} color={color} />
      <Text style={[styles.bannerText, { color }]} maxFontSizeMultiplier={1.15}>{title}</Text>
    </View>
  );
}

function Stats({ report }: { report: CalibrationReport }) {
  const rows = [
    { label: 'Positions received', value: String(report.fixes) },
    { label: 'Phone says accurate to', value: formatMeters(report.medianAccuracyMeters) },
    { label: 'Raw GPS wandered up to', value: formatMeters(report.spreadP95Meters) },
    { label: 'Your map pin moved', value: formatMeters(report.pinMovedMeters) },
    { label: 'Positions per second', value: report.fixes > 0 ? report.fixesPerSecond.toFixed(1) : '-' },
    { label: 'First position after', value: report.firstFixSeconds === null ? '-' : `${report.firstFixSeconds}s` },
  ];
  return (
    <View style={styles.statsTable}>
      {rows.map((row, index) => (
        <View key={row.label} style={[styles.statRow, index === rows.length - 1 && styles.noBorder]}>
          <Text style={styles.statLabel} maxFontSizeMultiplier={1.15}>{row.label}</Text>
          <Text style={styles.statValue} maxFontSizeMultiplier={1.15}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The phone's fixes as dots around their average, the map pin in red, and the
 * lock radius as a dashed ring. Drawn to scale; the scale grows to fit.
 */
function TargetPlot({
  samples,
  pin,
  lockRadius,
}: {
  samples: CalibrationSample[];
  pin: { latitude: number; longitude: number } | null;
  lockRadius: number;
}) {
  const size = 220;
  const half = size / 2;
  const center = weightedCenter(samples);
  if (!center) return null;
  const mPerDegLon = M_PER_DEG * Math.cos((center.latitude * Math.PI) / 180);
  const toXY = (p: { latitude: number; longitude: number }) => ({
    east: (p.longitude - center.longitude) * mPerDegLon,
    north: (p.latitude - center.latitude) * M_PER_DEG,
  });
  const points = samples.map(toXY);
  const farthest = points.reduce((max, p) => Math.max(max, Math.hypot(p.east, p.north)), 0);
  const extent = Math.max(10, lockRadius * 1.15, farthest * 1.1);
  const scale = (half - 8) / extent;
  const pinXY = pin ? toXY(pin) : null;

  return (
    <View style={styles.plotWrap}>
      <Svg width={size} height={size} accessibilityLabel={`${samples.length} GPS positions, scattered up to ${Math.round(farthest)} metres`}>
        <Circle cx={half} cy={half} r={half - 2} fill={Colors.bgLight} stroke={Colors.border} strokeWidth={1} />
        <Line x1={half} y1={8} x2={half} y2={size - 8} stroke={Colors.border} strokeWidth={1} />
        <Line x1={8} y1={half} x2={size - 8} y2={half} stroke={Colors.border} strokeWidth={1} />
        <Circle
          cx={half}
          cy={half}
          r={lockRadius * scale}
          fill="none"
          stroke={Colors.navy}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        {points.map((p, i) => (
          <Circle
            key={i}
            cx={half + p.east * scale}
            cy={half - p.north * scale}
            r={3}
            fill={Colors.navy}
            fillOpacity={0.35}
          />
        ))}
        {pinXY && (
          <Circle
            cx={half + pinXY.east * scale}
            cy={half - pinXY.north * scale}
            r={7}
            fill={Colors.primary}
            stroke={Colors.bgWhite}
            strokeWidth={2}
          />
        )}
      </Svg>
      <View style={styles.legend}>
        <LegendItem swatch={<View style={[styles.dot, styles.dotRaw]} />} label="Raw GPS positions" />
        <LegendItem swatch={<View style={[styles.dot, styles.dotPin]} />} label="Your pin on the map" />
        <LegendItem
          swatch={<View style={styles.dashSwatch} />}
          label={`Pin holds still inside ${formatMeters(lockRadius)}`}
        />
      </View>
    </View>
  );
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text style={styles.legendText} maxFontSizeMultiplier={1.15}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  icon,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon: 'start' | 'again' | 'none';
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryBtn, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      testID={testID}
    >
      {icon === 'start' && <Crosshair size={16} color={Colors.onPrimary} />}
      {icon === 'again' && <RotateCcw size={16} color={Colors.onPrimary} />}
      <Text style={styles.primaryText} maxFontSizeMultiplier={1.15}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: moderateScale(20, 0.5),
    backgroundColor: Colors.overlayDark,
  },
  modalContent: {
    width: '100%',
    maxWidth: Math.min(MAX_CONTENT_WIDTH, moderateScale(420, 0.5)),
    maxHeight: '90%',
    backgroundColor: ProfileColors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  modalBody: {
    padding: moderateScale(24, 0.5),
    gap: moderateScale(12, 0.5),
  },
  modalTitle: {
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.xl, 0.35),
    fontWeight: FontWeights.bold,
  },
  modalText: {
    color: Colors.textMedium,
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    lineHeight: moderateScale(24, 0.5),
  },
  modalActions: {
    paddingHorizontal: moderateScale(24, 0.5),
    paddingBottom: moderateScale(16, 0.5),
    gap: Spacing.sm,
  },
  modalCancel: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  modalCancelText: {
    color: ProfileColors.accent,
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    fontWeight: FontWeights.semibold,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.bgWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: scaledFontSize(FontSizes.lg, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  errorSection: {
    borderColor: Colors.dangerBg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  body: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textMedium,
    lineHeight: 20,
  },
  muted: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: Colors.onNavy,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  statusText: {
    flex: 1,
    gap: 2,
  },
  statusLabel: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textDark,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  chipOn: {
    backgroundColor: Colors.successBg,
  },
  chipOff: {
    backgroundColor: Colors.dangerBg,
  },
  chipUnknown: {
    backgroundColor: Colors.bgGray,
  },
  chipText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold as any,
    color: Colors.textGray,
  },
  chipTextOn: {
    color: Colors.success,
  },
  chipTextOff: {
    color: Colors.danger,
  },
  countdown: {
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgGray,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  plotEmpty: {
    minHeight: 220,
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  plotWrap: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  legend: {
    alignSelf: 'stretch',
    gap: Spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  legendText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: BorderRadius.full,
  },
  dotRaw: {
    backgroundColor: Colors.navy,
    opacity: 0.35,
  },
  dotPin: {
    backgroundColor: Colors.primary,
  },
  dashSwatch: {
    width: 14,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.navy,
  },
  statsTable: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.md,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  statLabel: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textGray,
  },
  statValue: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textDark,
    fontVariant: ['tabular-nums'],
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  bannerText: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  adviceList: {
    gap: Spacing.sm,
  },
  savedNote: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    minHeight: 48,
  },
  primaryText: {
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.onPrimary,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySurface,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    minHeight: 48,
  },
  secondaryText: {
    color: Colors.primary,
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.semibold as any,
  },
  disabled: {
    opacity: 0.6,
  },
});
