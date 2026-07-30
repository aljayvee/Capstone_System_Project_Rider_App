import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

interface CashCollectionInputProps {
  value?: string;
  amount?: string;
  onChange: (value: string) => void;
  visible?: boolean;
}

export function CashCollectionInput({ value: propVal, amount: propAmount, onChange, visible = true }: CashCollectionInputProps) {
  const value = propVal !== undefined ? propVal : propAmount ?? "";
  if (!visible) return null;


  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>ENTER COLLECTED AMOUNT (₱)</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder="0.00"
          keyboardType="numeric"
          placeholderTextColor={Colors.textLight}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.bgWhite,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: '#FCE7F3', // pink-100 equivalent
  },
  label: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
    color: Colors.textGray,
    marginBottom: Spacing.xs,
  },
  input: {
    width: '100%',
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold as any,
    color: '#DB2777', // pink-600
    borderBottomWidth: 2,
    borderBottomColor: '#EC4899', // pink-500
    paddingBottom: Spacing.xxs,
  },
});
