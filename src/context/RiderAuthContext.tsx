import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL, fetchWithTimeout } from "../config/apiConfig";
import {
  setRiderToken,
  setRiderRefreshToken,
  getRiderRefreshToken,
  refreshRiderSession,
  setOnSessionExpired,
  SECURE_KEY_RIDER_TOKEN,
  STORAGE_KEY_RIDER_TOKEN_FALLBACK,
} from "../services/apiClient";
import { endRealtimeSession, ensureRealtimeSession } from "../firebase/realtimeSession";
import { WAYBILL_CACHE_KEY } from "../adapters/storageAdapter";
import { forgetAll } from "../services/requestCache";
import { getDeviceHeaders } from "../utils/deviceInfo";
import { Alert, AppState } from "react-native";
import {
  clearShift,
  endShiftAtMidnight,
  onShiftEnded,
  shiftExpired,
  startShift,
} from "../services/riderShift";

/** How often an open app checks whether the shift has run past 12:00 AM. */
const MIDNIGHT_CHECK_MS = 30 * 1000;

export interface RiderUser {
  id: number;
  username: string;
  name: string;
  phone: string;
  role?: string;
  isOnline: boolean;
  vehicle: string;
  avatarUrl?: string;
}

export interface AuthSession {
  user: RiderUser;
  token: string;
}

// The first time a newly created rider account signs in, the server answers
// with a challenge instead of a token: a code is emailed to the address the
// admin registered, and the session only exists once that code is verified.
//
// Held in React state only — never SecureStore or AsyncStorage. It is a
// pre-authentication credential, so killing the app should cancel it.
export interface PendingChallenge {
  step: "PROFILE_SETUP" | "OTP";
  challengeToken: string;
  maskedEmail: string | null;
  // What the rider typed into the sign-in form. Carried through so the
  // post-verification user object has the same username fallback the direct
  // login path uses.
  identifier: string;
}

interface RiderAuthContextType {
  rider: RiderUser | null;
  token: string | null;
  isLoading: boolean;
  isOnline: boolean;
  pendingChallenge: PendingChallenge | null;
  login: (username: string, password?: string) => Promise<void>;
  verifyLoginOtp: (code: string) => Promise<void>;
  resendLoginOtp: () => Promise<void>;
  cancelChallenge: () => void;
  logout: () => Promise<void>;
  toggleShiftStatus: () => Promise<void>;
}

const STORAGE_KEY_USER = "@sugo_rider_user";

const RiderAuthContext = createContext<RiderAuthContextType | undefined>(undefined);

export const RiderAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rider, setRider] = useState<RiderUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pendingChallenge, setPendingChallenge] = useState<PendingChallenge | null>(null);
  const loginInFlightRef = useRef<Promise<void> | null>(null);

  // ── the shift clock ─────────────────────────────────────────────────────
  // Going online starts a shift; going offline ends it. The start is kept
  // across relaunches (startShift(false) never overwrites), which is how a
  // shift left running since yesterday is recognised below as expired.
  useEffect(() => {
    if (!rider) return;
    if (isOnline) void startShift(false);
    else void clearShift();
  }, [rider, isOnline]);

  // Every shift ends at 12:00 AM. The background task enforces it while the
  // app is closed and the server enforces it on every beacon; this covers the
  // app sitting open across midnight, and a launch the morning after.
  useEffect(() => {
    if (!rider || !isOnline) return;
    const check = async () => {
      if (await shiftExpired()) await endShiftAtMidnight(rider.id);
    };
    void check();
    const timer = setInterval(() => void check(), MIDNIGHT_CHECK_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [rider, isOnline]);

  // However the shift ended (this screen, the background task, or the server
  // answering a beacon), the switch goes off and the rider is told why once.
  useEffect(() => {
    return onShiftEnded(() => {
      setIsOnline(false);
      setRider((current) => (current ? { ...current, isOnline: false } : current));
      Alert.alert(
        "Your shift has ended",
        "Every shift ends at 12:00 AM, so you are now offline. Go online again to keep receiving errands."
      );
    });
  }, []);

  // Keeps the apiClient singleton's Authorization header in sync with the session token
  useEffect(() => {
    setRiderToken(token);

    // The Firebase identity follows the session token, which is the one place
    // every path already converges on: sign-in, session restore at launch, the
    // 401 expiry handler and sign-out all set this. Hooking the individual call
    // sites instead would have meant four separate edits and one of them
    // eventually being forgotten.
    //
    // Without a Firebase identity the rider's own pin cannot be written at all,
    // so dispatcher and owner tracking simply never see them.
    if (token) {
      void ensureRealtimeSession();
    } else {
      void endRealtimeSession();
    }
  }, [token]);

  // Load session securely on startup
  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedUser = await AsyncStorage.getItem(STORAGE_KEY_USER);
        let storedToken: string | null = null;

        try {
          storedToken = await SecureStore.getItemAsync(SECURE_KEY_RIDER_TOKEN);
        } catch {
          // SecureStore fallback
        }

        if (!storedToken) {
          storedToken = await AsyncStorage.getItem(STORAGE_KEY_RIDER_TOKEN_FALLBACK);
        }

        if (storedUser && storedToken) {
          try {
            const userObj: RiderUser = JSON.parse(storedUser);
            const userRole = String(userObj.role || "").toUpperCase();

            if (userRole && userRole !== "RIDER") {
              await AsyncStorage.removeItem(STORAGE_KEY_USER);
              await AsyncStorage.removeItem(STORAGE_KEY_RIDER_TOKEN_FALLBACK);
              try {
                await SecureStore.deleteItemAsync(SECURE_KEY_RIDER_TOKEN);
              } catch {}
              await setRiderRefreshToken(null);
            } else {
              setRider(userObj);
              setToken(storedToken);
              setRiderToken(storedToken);
              setIsOnline(userObj.isOnline ?? true);

              // Refresh in background so initial UI render is instantaneous
              void getRiderRefreshToken().then((refreshToken) => {
                if (refreshToken) {
                  refreshRiderSession()
                    .then((refreshed) => {
                      if (refreshed) setToken(refreshed);
                    })
                    .catch(() => {});
                }
              });
            }
          } catch {
            // Bad stored JSON, ignore
          }
        }
      } catch (err) {
        console.error("Failed to load secure auth session:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  // Single place that decides what an unrecoverable 401 means for the rider.
  // apiClient has already cleared the stored tokens by the time this runs; this
  // clears React state, which is what actually returns the navigator to Login.
  useEffect(() => {
    setOnSessionExpired(() => {
      setRider(null);
      setToken(null);
      setRiderToken(null);
      setIsOnline(false);
      setPendingChallenge(null);
      void AsyncStorage.removeItem(STORAGE_KEY_USER);
      void AsyncStorage.removeItem(STORAGE_KEY_RIDER_TOKEN_FALLBACK);
      SecureStore.deleteItemAsync(SECURE_KEY_RIDER_TOKEN).catch(() => {});
    });
    return () => setOnSessionExpired(null);
  }, []);

  // Shapes the server's user payload into a RiderUser and enforces the role
  // guard. Shared by the direct-login and post-OTP paths so the two cannot
  // produce different sessions from the same response.
  const toRiderUser = (userPayload: any, fallbackUsername: string): RiderUser => {
    const userRole = String(userPayload.role || "").toUpperCase();
    if (userRole && userRole !== "RIDER") {
      throw new Error(
        "Access denied: Only Rider accounts are permitted to access the Rider Mobile App. Owner and Dispatcher accounts are restricted."
      );
    }

    const fullName =
      userPayload.name ||
      (userPayload.firstName
        ? `${userPayload.firstName} ${userPayload.lastName || ""}`.trim()
        : userPayload.username);

    return {
      id: userPayload.id,
      username: userPayload.username || fallbackUsername,
      name: fullName,
      phone: userPayload.phone || "",
      role: userPayload.role || "RIDER",
      isOnline: userPayload.status ? userPayload.status === "Active" : true,
      vehicle: userPayload.vehicle || "Motorcycle",
      avatarUrl: userPayload.avatarUrl,
    };
  };

  // The single persistence path. Both login() and verifyLoginOtp() end here, so
  // there is exactly one place that writes the session to SecureStore.
  const applySession = async (riderUser: RiderUser, sessionToken: string, refreshToken?: string) => {
    // Set memory token first
    setRiderToken(sessionToken);
    // A sign-in is a new shift, never a continuation of one left behind.
    await startShift(true);
    setRider(riderUser);
    setToken(sessionToken);
    setIsOnline(true);
    setPendingChallenge(null);

    // Securely persist credentials
    await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(riderUser));
    await AsyncStorage.setItem(STORAGE_KEY_RIDER_TOKEN_FALLBACK, sessionToken);
    try {
      await SecureStore.setItemAsync(SECURE_KEY_RIDER_TOKEN, sessionToken);
    } catch {}

    // Through the helper, not SecureStore directly: it also seeds the in-memory
    // copy the 401 interceptor reads, so the very first refresh of a new
    // session does not have to hit disk.
    if (refreshToken) {
      await setRiderRefreshToken(refreshToken);
    }
  };

  // Normalises transport failures into messages worth showing a rider. Shared
  // by every auth call so they all fail the same way.
  const toAuthError = (err: any): Error => {
    if (
      err?.message === "Invalid username or password" ||
      err?.message?.includes("token") ||
      err?.message?.includes("Access denied") ||
      err?.message?.includes("Only Rider")
    ) {
      return err;
    }
    const msg = String(err?.message || "").toLowerCase();
    if (
      err?.name === "AbortError" ||
      msg.includes("canceled") ||
      msg.includes("cancelled") ||
      msg.includes("timeout")
    ) {
      return new Error("Connection timed out or was interrupted. Please check your signal and try again.");
    }
    if (
      msg.includes("network request failed") ||
      msg.includes("fetch failed") ||
      msg.includes("network error")
    ) {
      return new Error(
        "Unable to connect to server. Please check your internet connection and try again."
      );
    }
    return new Error(err?.message || "Unable to connect to authentication server. Please check your network.");
  };

  // Reads an error body the same way for every auth endpoint.
  const readError = async (res: Response, fallback: string): Promise<never> => {
    let errorMsg = fallback;
    try {
      const errorData = await res.json();
      if (errorData && errorData.error) {
        errorMsg = errorData.error;
      }
    } catch (_) {
      // fallback
    }
    throw new Error(errorMsg);
  };

  const login = async (username: string, password?: string) => {
    if (loginInFlightRef.current) {
      return loginInFlightRef.current;
    }

    const runLogin = async () => {
      let riderUser: RiderUser;
      let sessionToken: string;
      let refreshToken: string | undefined;

      try {
        const res = await fetchWithTimeout(
          `${API_BASE_URL}/riders/login`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Lets the server name this device in the sign-in alert email
              // without guessing from a user-agent string.
              ...(await getDeviceHeaders()),
            },
            body: JSON.stringify({ username, password }),
          },
          20000
        );

        if (!res.ok) {
          await readError(res, "Invalid username or password");
        }

        const responseData = await res.json();

        // Checked BEFORE the token check below: a challenge is a successful 200
        // that legitimately carries no token, and the old code treated that as a
        // fatal "server did not return a JWT" error.
        if (responseData.otpRequired || responseData.profileSetupRequired) {
          setPendingChallenge({
            step: responseData.profileSetupRequired ? "PROFILE_SETUP" : "OTP",
            challengeToken: responseData.challengeToken,
            maskedEmail: responseData.maskedEmail ?? null,
            identifier: username,
          });
          return;
        }

        const userPayload = responseData.user || responseData.rider || responseData;

        if (!responseData.token) {
          throw new Error("Server did not return a valid authentication JWT token.");
        }

        riderUser = toRiderUser(userPayload, username);
        sessionToken = responseData.token;
        refreshToken = responseData.refreshToken;
      } catch (err: any) {
        throw toAuthError(err);
      }

      await applySession(riderUser, sessionToken, refreshToken);
    };

    const promise = runLogin();
    loginInFlightRef.current = promise;
    try {
      await promise;
    } finally {
      loginInFlightRef.current = null;
    }
  };

  const verifyLoginOtp = async (code: string) => {
    if (!pendingChallenge) {
      throw new Error("Your sign-in session expired. Please sign in again.");
    }

    let riderUser: RiderUser;
    let sessionToken: string;
    let refreshToken: string | undefined;

    try {
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/auth/verify-login-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await getDeviceHeaders()),
          },
          body: JSON.stringify({ challengeToken: pendingChallenge.challengeToken, code }),
        },
        20000
      );

      if (!res.ok) {
        await readError(res, "Incorrect verification code.");
      }

      const responseData = await res.json();
      const userPayload = responseData.user || responseData.rider || responseData;

      if (!responseData.token) {
        throw new Error("Server did not return a valid authentication JWT token.");
      }

      riderUser = toRiderUser(userPayload, pendingChallenge.identifier);
      sessionToken = responseData.token;
      refreshToken = responseData.refreshToken;
    } catch (err: any) {
      throw toAuthError(err);
    }

    await applySession(riderUser, sessionToken, refreshToken);
  };

  const resendLoginOtp = async () => {
    if (!pendingChallenge) {
      throw new Error("Your sign-in session expired. Please sign in again.");
    }

    try {
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/auth/resend-login-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeToken: pendingChallenge.challengeToken }),
        },
        20000
      );

      if (!res.ok) {
        await readError(res, "Could not send a new code. Please try again.");
      }

      const responseData = await res.json();
      // The server re-mints the token so the sign-in window restarts with the
      // new code; keeping the old one would fail on the next submit.
      setPendingChallenge({
        step: "OTP",
        challengeToken: responseData.challengeToken,
        maskedEmail: responseData.maskedEmail ?? null,
        identifier: pendingChallenge.identifier,
      });
    } catch (err: any) {
      throw toAuthError(err);
    }
  };

  const cancelChallenge = () => setPendingChallenge(null);

  const logout = async () => {
    try {
      const currentToken =
        token ||
        (await SecureStore.getItemAsync(SECURE_KEY_RIDER_TOKEN).catch(() => null)) ||
        (await AsyncStorage.getItem(STORAGE_KEY_RIDER_TOKEN_FALLBACK));
      // Sent alongside the access token so the server can close the
      // `user_sessions` row, not merely blocklist the bearer token. Without it
      // the session would sit there looking live until it aged out 30 days
      // later, and would still be spendable by anyone holding a copy.
      const currentRefreshToken = await getRiderRefreshToken().catch(() => null);
      if (currentToken) {
        await fetchWithTimeout(
          `${API_BASE_URL}/auth/logout`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${currentToken}`,
            },
            body: JSON.stringify(
              currentRefreshToken ? { refreshToken: currentRefreshToken } : {}
            ),
          },
          5000
        ).catch(() => {});
      }

      await AsyncStorage.removeItem(STORAGE_KEY_USER);
      await AsyncStorage.removeItem(STORAGE_KEY_RIDER_TOKEN_FALLBACK);
      await AsyncStorage.removeItem(WAYBILL_CACHE_KEY);
      // The session's remembered answers (notifications, the waybill) were
      // this rider's; the next one to sign in on this phone must not see them.
      forgetAll();
      try {
        await SecureStore.deleteItemAsync(SECURE_KEY_RIDER_TOKEN);
      } catch {}
      await setRiderRefreshToken(null);
      // Signed out is offline. Cleared here, not by the shift effect, which
      // cannot run once the rider is gone.
      await clearShift();
    } catch (err) {
      console.error("Logout persistence error:", err);
    } finally {
      setRider(null);
      setToken(null);
      setRiderToken(null);
      setIsOnline(false);
      setPendingChallenge(null);
    }
  };

  const toggleShiftStatus = async () => {
    const nextStatus = !isOnline;
    // A fresh shift clock on every "go online", written before the switch
    // flips so the first beacon of the new shift already carries it.
    if (nextStatus) await startShift(true);
    setIsOnline(nextStatus);

    if (rider) {
      const updatedUser = { ...rider, isOnline: nextStatus };
      setRider(updatedUser);
      try {
        await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updatedUser));
      } catch (err) {
        console.error("Failed to update shift status in storage:", err);
      }
    }
  };

  return (
    <RiderAuthContext.Provider
      value={{
        rider,
        token,
        isLoading,
        isOnline,
        pendingChallenge,
        login,
        verifyLoginOtp,
        resendLoginOtp,
        cancelChallenge,
        logout,
        toggleShiftStatus,
      }}
    >
      {children}
    </RiderAuthContext.Provider>
  );
};

export const useRiderAuth = () => {
  const context = useContext(RiderAuthContext);
  if (!context) {
    throw new Error("useRiderAuth must be used within a RiderAuthProvider");
  }
  return context;
};
