import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { AlertCircle } from "lucide-react-native";
import { useRiderAuth } from "../../context/RiderAuthContext";
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from "../../config/theme";

export const LoginScreen = () => {
  const { login } = useRiderAuth();
  const [username, setUsername] = useState("rider01");
  const [password, setPassword] = useState("password123");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMessage(null);
    if (!username.trim() || !password.trim()) {
      setErrorMessage("Please enter both Rider Username and Password.");
      return;
    }

    setIsLoading(true);
    try {
      await login(username.trim(), password.trim());
    } catch (err: any) {
      setErrorMessage(err?.message || "Invalid username or password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async () => {
    setUsername("rider01");
    setPassword("password123");
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await login("rider01", "password123");
    } catch (err: any) {
      setErrorMessage(err?.message || "Quick login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBox}>
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarText}>RDR</Text>
        </View>
        <Text style={styles.appName}>SUGO EXPRESS</Text>
        <Text style={styles.portalTitle}>Rider Delivery Portal</Text>
        <Text style={styles.tagline}>Tacurong City Logistics Fleet</Text>
      </View>

      <View style={styles.card}>
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={FontSizes.lg} color={Colors.primaryDark} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <Text style={styles.inputLabel}>RIDER USERNAME / ID</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={(val) => {
            setUsername(val);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="e.g. rider01 or RDR-001"
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
        />

        <Text style={[styles.inputLabel, { marginTop: Spacing.lg }]}>PASSWORD</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={(val) => {
            setPassword(val);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="••••••••"
          placeholderTextColor={Colors.textLight}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.textWhite} size="small" />
          ) : (
            <Text style={styles.loginBtnText}>SIGN IN TO ON-DUTY RIDER</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.demoQuickBtn}
          onPress={handleQuickLogin}
          disabled={isLoading}
        >
          <Text style={styles.demoQuickText}>Quick Login as Al-Dhen Musali (RDR-001)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
    justifyContent: "center",
    padding: Spacing.xxl,
  },
  headerBox: {
    alignItems: "center",
    marginBottom: Spacing.xxxl,
  },
  avatarBadge: {
    width: Spacing.huge * 2,
    height: Spacing.huge * 2,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: Spacing.md,
    elevation: 4,
  },
  avatarText: {
    color: Colors.textWhite,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.black,
  },
  appName: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.extrabold,
    color: Colors.primary,
    letterSpacing: 1.5,
  },
  portalTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.black,
    color: Colors.textDark,
    marginTop: Spacing.xxs,
  },
  tagline: {
    fontSize: FontSizes.sm,
    color: Colors.textGray,
    marginTop: Spacing.xxs,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: Colors.primaryDark,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.md,
    flex: 1,
  },
  card: {
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.textDark,
    shadowOpacity: 0.05,
    shadowRadius: Spacing.huge - Spacing.xxl,
    elevation: 2,
  },
  inputLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.extrabold,
    color: Colors.textMedium,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.bgLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg + Spacing.xxs,
    paddingVertical: Spacing.lg,
    fontSize: FontSizes.md,
    color: Colors.textDark,
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg + Spacing.xxs,
    alignItems: "center",
    marginTop: Spacing.xxl,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.black,
    fontSize: FontSizes.md,
    letterSpacing: 0.5,
  },
  demoQuickBtn: {
    marginTop: Spacing.lg + Spacing.xxs,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  demoQuickText: {
    color: Colors.blue,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
});
