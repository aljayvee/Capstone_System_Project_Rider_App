import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing } from '../config/theme';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  incidentId: string;
}

export class MobileErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    incidentId: '',
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const generatedId = `RIDER-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    return { hasError: true, error, incidentId: generatedId };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (__DEV__) {
      console.error('[Rider MobileErrorBoundary Caught]', error, errorInfo);
    }
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: undefined });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <AlertTriangle size={32} color={Colors.danger} />
            </View>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>Rider Safety Mode</Text>
            </View>

            <Text style={styles.title}>
              {this.props.fallbackTitle || 'Unexpected Exception'}
            </Text>

            <Text style={styles.description}>
              {this.props.fallbackDescription ||
                'A component encountered a rendering issue. Your errand status and GPS track are preserved.'}
            </Text>

            <View style={styles.incidentRow}>
              <Text style={styles.incidentLabel}>Incident Ref:</Text>
              <Text style={styles.incidentCode}>#{this.state.incidentId}</Text>
            </View>

            <TouchableOpacity onPress={this.handleReload} style={styles.button}>
              <RefreshCw size={16} color="#FFFFFF" />
              <Text style={styles.buttonText}>Restart Component</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1E293B',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
  },
  badgeText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: FontWeights.bold as any,
    textTransform: 'uppercase',
  },
  title: {
    color: '#F8FAFC',
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold as any,
    textAlign: 'center',
  },
  description: {
    color: '#94A3B8',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.normal as any,
    textAlign: 'center',
    lineHeight: 18,
  },
  incidentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginVertical: Spacing.xs,
  },
  incidentLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: FontWeights.medium as any,
  },
  incidentCode: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: FontWeights.bold as any,
  },
  button: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.xs,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
});

export default MobileErrorBoundary;
