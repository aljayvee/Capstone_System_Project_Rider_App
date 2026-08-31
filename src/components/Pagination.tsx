import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../config/theme';

interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** Most numbered buttons to show at once before windowing. */
  maxButtons?: number;
}

/**
 * The page numbers themselves, not just next/previous.
 *
 * A rider looking for an errand from last Tuesday knows roughly how far back it
 * is. Next-only paging makes them tap through everything in between and gives
 * them no way to tell how much is left.
 */
export function Pagination({ page, pageCount, onChange, maxButtons = 10 }: PaginationProps) {
  if (pageCount <= 1) return null;

  // A window that keeps the current page in view without ever showing more
  // buttons than fit across a phone.
  const span = Math.min(maxButtons, pageCount);
  let start = Math.max(1, page - Math.floor(span / 2));
  const end = Math.min(pageCount, start + span - 1);
  start = Math.max(1, end - span + 1);

  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), pageCount);
    if (clamped !== page) onChange(clamped);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.arrow, page === 1 && styles.disabled]}
        disabled={page === 1}
        onPress={() => go(page - 1)}
        accessibilityRole="button"
        accessibilityState={{ disabled: page === 1 }}
        accessibilityLabel="Previous page"
      >
        <ChevronLeft size={18} color={page === 1 ? Colors.textLight : Colors.textMedium} />
      </TouchableOpacity>

      {pages.map((p) => {
        const isCurrent = p === page;
        return (
          <TouchableOpacity
            key={p}
            style={[styles.pageBtn, isCurrent && styles.pageBtnActive]}
            onPress={() => go(p)}
            accessibilityRole="button"
            accessibilityState={{ selected: isCurrent }}
            accessibilityLabel={`Page ${p} of ${pageCount}`}
          >
            <Text style={[styles.pageText, isCurrent && styles.pageTextActive]}>{p}</Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[styles.arrow, page === pageCount && styles.disabled]}
        disabled={page === pageCount}
        onPress={() => go(page + 1)}
        accessibilityRole="button"
        accessibilityState={{ disabled: page === pageCount }}
        accessibilityLabel="Next page"
      >
        <ChevronRight size={18} color={page === pageCount ? Colors.textLight : Colors.textMedium} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  arrow: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
  },
  disabled: {
    opacity: 0.4,
  },
  pageBtn: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pageBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pageText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
  },
  pageTextActive: {
    color: Colors.onPrimary,
    fontWeight: FontWeights.bold as any,
  },
});

export default Pagination;
