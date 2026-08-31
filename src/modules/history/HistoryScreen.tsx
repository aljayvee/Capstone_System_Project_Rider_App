import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Search, X, ArrowUpDown, PackageCheck, ChevronRight, MapPin } from 'lucide-react-native';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import type { AuthedStackParamList } from '../../navigation/AuthedNavigator';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, scaledFontSize, moderateScale, MAX_CONTENT_WIDTH } from '../../config/theme';
import { formatErrandId } from '../../utils/formatErrandId';
import { formatTimestamp, formatPeso } from '../../utils/format';
import { earningsOf, formatEarnings, totalEarnings } from '../../utils/earnings';
import type { Errand } from '../../types/rider';

const PAGE_SIZE = 10;

type SortKey =
  | 'date-desc'
  | 'date-asc'
  | 'id'
  | 'fee-desc'
  | 'fee-asc'
  | 'share-desc'
  | 'share-asc';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'date-desc', label: 'Newest first' },
  { key: 'date-asc', label: 'Oldest first' },
  { key: 'id', label: 'Errand ID' },
  { key: 'fee-desc', label: 'Highest fee' },
  { key: 'fee-asc', label: 'Lowest fee' },
  { key: 'share-desc', label: 'Highest share' },
  { key: 'share-asc', label: 'Lowest share' },
];

/** The whole delivery fee collected on an errand, or 0 when unpriced. */
function feeOf(errand: Errand): number {
  return errand.riderEarnings?.deliveryFee ?? 0;
}

/**
 * Everything one errand can be found by.
 *
 * Store names are in here because a rider remembers where they went far more
 * often than they remember an id — "the one from Gaisano" is how the errand is
 * actually held in mind a week later.
 */
function searchHaystack(errand: Errand): string {
  return [
    formatErrandId(errand.id),
    errand.id,
    errand.customer,
    errand.address,
    ...(errand.pinpoints ?? []).map((p) => p.storeName),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Errands already delivered, searchable and paged.
 *
 * Filtering runs against the list already in memory rather than a query per
 * keystroke. The rider's own history is bounded by how many errands one person
 * has run, it is fetched once for the session anyway, and searching it this way
 * keeps working in a dead spot — which is exactly where a rider is standing when
 * they need to prove what they delivered.
 */
export default function HistoryScreen() {
  const { deliveredErrands, phase } = useRiderMissionContext();
  const navigation = useNavigation<StackNavigationProp<AuthedStackParamList>>();

  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<SortKey>('date-desc');
  const [page, setPage] = React.useState(1);
  const [sortOpen, setSortOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return deliveredErrands;
    // Every word must match somewhere, so "gaisano maria" narrows rather than
    // widening the way a single joined substring would.
    const words = needle.split(/\s+/);
    return deliveredErrands.filter((errand) => {
      const haystack = searchHaystack(errand);
      return words.every((w) => haystack.includes(w));
    });
  }, [deliveredErrands, query]);

  const sorted = React.useMemo(() => {
    const copy = [...filtered];
    const time = (e: Errand) => new Date(e.updatedAt || e.createdAt).getTime() || 0;
    switch (sort) {
      case 'date-asc':
        return copy.sort((a, b) => time(a) - time(b));
      case 'id':
        return copy.sort((a, b) => formatErrandId(a.id).localeCompare(formatErrandId(b.id)));
      case 'fee-desc':
        return copy.sort((a, b) => feeOf(b) - feeOf(a));
      case 'fee-asc':
        return copy.sort((a, b) => feeOf(a) - feeOf(b));
      case 'share-desc':
        return copy.sort((a, b) => (earningsOf(b) ?? 0) - (earningsOf(a) ?? 0));
      case 'share-asc':
        return copy.sort((a, b) => (earningsOf(a) ?? 0) - (earningsOf(b) ?? 0));
      case 'date-desc':
      default:
        return copy.sort((a, b) => time(b) - time(a));
    }
  }, [filtered, sort]);

  const pageCount = Math.max(Math.ceil(sorted.length / PAGE_SIZE), 1);
  const safePage = Math.min(page, pageCount);
  const visible = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // A narrowed list leaves the rider stranded on an empty page 7 otherwise.
  React.useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const activeSort = SORTS.find((s) => s.key === sort) ?? SORTS[0];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Pinned Top Fixed Section (Rule 8.12) */}
      <View style={styles.fixedTopSection}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} maxFontSizeMultiplier={1.2}>My History</Text>
          <Text style={styles.headerSub} maxFontSizeMultiplier={1.15}>
            {deliveredErrands.length} delivered · {formatPeso(totalEarnings(deliveredErrands))} earned
          </Text>
        </View>

        <View style={styles.controls}>
          <View style={styles.searchBox}>
            <Search size={16} color={Colors.textGray} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by errand ID, customer, or store"
              placeholderTextColor={Colors.textLight}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search your delivered errands"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                style={styles.clearBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear the search"
              >
                <X size={16} color={Colors.textGray} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setSortOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: sortOpen }}
            accessibilityLabel={`Sort, currently ${activeSort.label}`}
          >
            <ArrowUpDown size={15} color={Colors.textMedium} />
            <Text style={styles.sortBtnText} maxFontSizeMultiplier={1.15}>{activeSort.label}</Text>
          </TouchableOpacity>

          {sortOpen && (
            <View style={styles.sortMenu}>
              {SORTS.map((option) => {
                const isActive = option.key === sort;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.sortOption, isActive && styles.sortOptionActive]}
                    onPress={() => {
                      setSort(option.key);
                      setSortOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`Sort by ${option.label}`}
                  >
                    <Text
                      style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}
                      maxFontSizeMultiplier={1.15}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {/* Independent Scrolling List */}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {phase === 'loading' ? (
          <ActivityIndicator size="large" color={Colors.primary} style={styles.loading} />
        ) : deliveredErrands.length === 0 ? (
          <EmptyState
            Icon={PackageCheck}
            title="Nothing delivered yet"
            hint="Errands you finish will collect here, with the receipts you filed against them."
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            Icon={Search}
            title="No errand matches that"
            hint="Try an errand ID, the customer's name, or a store you went to."
          />
        ) : (
          <>
            {visible.map((errand) => (
              <Card key={errand.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.errandId} maxFontSizeMultiplier={1.15}>{formatErrandId(errand.id)}</Text>
                    <Badge tone="success">Delivered</Badge>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <Text style={styles.amount} maxFontSizeMultiplier={1.2}>{formatEarnings(errand)}</Text>
                    <Text style={styles.amountLabel} maxFontSizeMultiplier={1.15}>your share</Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.customerName} numberOfLines={1} maxFontSizeMultiplier={1.15}>{errand.customer}</Text>
                  <View style={styles.addressRow}>
                    <MapPin size={13} color={Colors.textLight} />
                    <Text style={styles.address} numberOfLines={2} maxFontSizeMultiplier={1.15}>
                      {errand.address}
                    </Text>
                  </View>
                  <Text style={styles.timestamp} maxFontSizeMultiplier={1.15}>{formatTimestamp(errand.updatedAt)}</Text>
                </View>

                <TouchableOpacity
                  style={styles.detailsBtn}
                  onPress={() => navigation.navigate('ErrandDetails', { errandId: errand.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`See details for errand ${formatErrandId(errand.id)}`}
                  testID={`see-details-${errand.id}`}
                >
                  <Text style={styles.detailsBtnText} maxFontSizeMultiplier={1.15}>See Details</Text>
                  <ChevronRight size={16} color={Colors.primary} />
                </TouchableOpacity>
              </Card>
            ))}

            <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  fixedTopSection: {
    backgroundColor: Colors.bgGray,
    zIndex: 10,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  headerTitle: {
    fontSize: scaledFontSize(FontSizes.xl, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  headerSub: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
    marginTop: 2,
  },
  controls: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    zIndex: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textDark,
    paddingVertical: Spacing.xs,
  },
  clearBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortBtnText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
  },
  sortMenu: {
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  sortOption: {
    paddingHorizontal: Spacing.lg,
    minHeight: 48,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  sortOptionActive: {
    backgroundColor: Colors.primarySurface,
  },
  sortOptionText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textMedium,
  },
  sortOptionTextActive: {
    color: Colors.primaryStrong,
    fontWeight: FontWeights.bold as any,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.xs,
    gap: Spacing.md,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: moderateScale(110, 0.20),
  },
  loading: {
    marginTop: Spacing.huge,
  },
  card: {
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardHeaderLeft: {
    gap: Spacing.xs,
    flex: 1,
  },
  errandId: {
    color: Colors.primary,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  amount: {
    color: Colors.success,
    fontSize: scaledFontSize(FontSizes.lg, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  amountLabel: {
    color: Colors.textLight,
    fontSize: scaledFontSize(FontSizes.xxs, 0.20),
  },
  cardBody: {
    gap: Spacing.xs,
  },
  customerName: {
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.semibold as any,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  address: {
    flex: 1,
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
  },
  timestamp: {
    color: Colors.textLight,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primarySurface,
  },
  detailsBtnText: {
    color: Colors.primaryStrong,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.bold as any,
  },
});
