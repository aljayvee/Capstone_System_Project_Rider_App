import React, { createContext, useContext, useState, useEffect } from "react";
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
import { WAYBILL_CACHE_KEY } from "../adapters/storageAdapter";
import { getDeviceHeaders } from "../utils/deviceInfo";

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

  // Keeps the apiClient singleton's Authorization header in sync with the session token
  useEffect(() => {
    setRiderToken(token);
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

        // Via the shared helper so the AsyncStorage fallback is consulted as
        // well — a device where SecureStore is unavailable used to restore its
        // access token but never its refresh token.
        const refreshToken = await getRiderRefreshToken();

        if (storedUser && storedToken) {
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

            // Refresh at launch so the first screen does not open with an
            // access token that expired while the app was closed.
            //
            // Delegated to apiClient rather than re-implemented here: the old
            // inline version read only `refreshData.token` and threw away the
            // rotated refresh token that comes back with it. Under rotation
            // that left the device holding a retired credential, which the
            // server's replay detection would treat as theft and answer by
            // revoking the session — turning a silent refresh into a forced
            // logout. One implementation, one place that persists a rotation.
            if (refreshToken) {
              try {
                const refreshed = await refreshRiderSession();
                setToken(refreshed);
              } catch (_) {
                // Offline, or the session is genuinely gone. Keep the stored
                // token: if it is merely stale the first 401 will refresh it,
                // and if the session is dead that same 401 signs the rider out
                // with a message. Bouncing to Login here would log out every
                // rider who opens the app with no signal.
              }
            }
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
      err?.message?.includes("Access denied")
    ) {
      return err;
    }
    if (err?.name === "AbortError") {
      return new Error("Connection timed out while contacting authentication server.");
    }
    if (err?.message?.includes("Network request failed")) {
      return new Error(
        `Unable to connect to server at ${API_BASE_URL}. Ensure backend server is running and reachable.`
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
        15000
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
        15000
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
        15000
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
      try {
        await SecureStore.deleteItemAsync(SECURE_KEY_RIDER_TOKEN);
      } catch {}
      await setRiderRefreshToken(null);
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
