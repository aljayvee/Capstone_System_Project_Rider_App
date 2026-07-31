import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from "react-native";
import { AlertCircle, ShieldAlert } from "lucide-react-native";
import { useRiderAuth } from "../../context/RiderAuthContext";
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from "../../config/theme";

export const LoginScreen = () => {
  const { login } = useRiderAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRestrictedModal, setShowRestrictedModal] = useState(false);
  const [restrictedMessage, setRestrictedMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMessage(null);
    if (!username.trim() || !password.trim()) {
      setErrorMessage("Please enter both Username and Password.");
      return;
    }

    setIsLoading(true);
    try {
      await login(username.trim(), password.trim());
    } catch (err: any) {
      const msg = err?.message || "Invalid username or password";
      if (
        msg.includes("Access denied") ||
        msg.includes("permitted") ||
        msg.includes("restricted") ||
        msg.includes("Only Rider")
      ) {
        setRestrictedMessage(
          "Notice for Owner & Dispatcher Accounts:\n\nThis application is strictly reserved for active Rider accounts. Please use the Web Management Portal for Owner and Dispatcher operations."
        );
        setShowRestrictedModal(true);
      } else {
        setErrorMessage(msg);
      }
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

        <Text style={styles.inputLabel}>USERNAME</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={(val) => {
            setUsername(val);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="Enter your username"
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
          placeholder="Enter your password"
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
      </View>

      {/* Access Restriction Modal for Owner and Dispatcher Accounts */}
      <Modal
        visible={showRestrictedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRestrictedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBadge}>
              <ShieldAlert size={36} color={Colors.primary} />
            </View>

            <Text style={styles.modalTitle}>Access Restricted</Text>
            <Text style={styles.modalSubtitle}>Rider Portal Access Only</Text>

            <Text style={styles.modalBodyText}>
              {restrictedMessage}
            </Text>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowRestrictedModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  modalIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryLight || "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.black,
    color: Colors.textDark,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    letterSpacing: 1,
    marginTop: Spacing.xxs,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
  },
  modalBodyText: {
    fontSize: FontSizes.sm,
    color: Colors.textMedium,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.xxl,
  },
  modalCloseBtn: {
    width: "100%",
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  modalCloseBtnText: {
    color: Colors.textWhite,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.extrabold,
    letterSpacing: 0.5,
  },
});
