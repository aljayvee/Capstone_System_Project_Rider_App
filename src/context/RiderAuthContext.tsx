import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, fetchWithTimeout } from "../config/apiConfig";

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

interface RiderAuthContextType {
  rider: RiderUser | null;
  token: string | null;
  isLoading: boolean;
  isOnline: boolean;
  login: (username: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  toggleShiftStatus: () => Promise<void>;
}

const STORAGE_KEY = "@sugo_rider_auth_session";

const RiderAuthContext = createContext<RiderAuthContextType | undefined>(undefined);

export const RiderAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rider, setRider] = useState<RiderUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load session from AsyncStorage on startup
  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedSession = await AsyncStorage.getItem(STORAGE_KEY);
        if (storedSession) {
          const session: AuthSession = JSON.parse(storedSession);
          if (session && session.user && session.token) {
            const userRole = String(session.user.role || "").toUpperCase();
            if (userRole && userRole !== "RIDER") {
              await AsyncStorage.removeItem(STORAGE_KEY);
            } else {
              setRider(session.user);
              setToken(session.token);
              setIsOnline(session.user.isOnline ?? true);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load auth session from AsyncStorage:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  const login = async (username: string, password?: string) => {
    let riderUser: RiderUser;
    let sessionToken: string;

    try {
      let res = await fetchWithTimeout(`${API_BASE_URL}/riders/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      }, 10000);

      if (!res.ok && res.status === 404) {
        res = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        }, 10000);
      }

      if (!res.ok && res.status === 404) {
        res = await fetchWithTimeout(`${API_BASE_URL.replace(/\/api$/, "")}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        }, 10000);
      }

      if (!res.ok) {
        let errorMsg = "Invalid username or password";
        try {
          const errorData = await res.json();
          if (errorData && errorData.error) {
            errorMsg = errorData.error;
          }
        } catch (_) {
          // fallback
        }
        throw new Error(errorMsg);
      }

      const responseData = await res.json();
      const userPayload = responseData.user || responseData.rider || responseData;

      if (!responseData.token) {
        throw new Error("Server did not return a valid authentication JWT token.");
      }

      const userRole = String(userPayload.role || "").toUpperCase();
      if (userRole && userRole !== "RIDER") {
        throw new Error("Access denied: Only Rider accounts are permitted to access the Rider Mobile App. Owner and Dispatcher accounts are restricted.");
      }

      const fullName = userPayload.name || 
        (userPayload.firstName ? `${userPayload.firstName} ${userPayload.lastName || ""}`.trim() : userPayload.username);

      riderUser = {
        id: userPayload.id,
        username: userPayload.username || username,
        name: fullName,
        phone: userPayload.phone || "",
        role: userPayload.role || "RIDER",
        isOnline: userPayload.status ? userPayload.status === "Active" : true,
        vehicle: userPayload.vehicle || "Motorcycle",
        avatarUrl: userPayload.avatarUrl,
      };
      sessionToken = responseData.token;
    } catch (err: any) {
      if (err?.message === "Invalid username or password" || err?.message?.includes("token") || err?.message?.includes("Access denied")) {
        throw err;
      }
      if (err?.name === "AbortError") {
        throw new Error("Connection timed out while contacting authentication server.");
      }
      if (err?.message?.includes("Network request failed")) {
        throw new Error(`Unable to connect to server at ${API_BASE_URL}. Ensure backend server is running and reachable.`);
      }
      throw new Error(err?.message || "Unable to connect to authentication server. Please check your network.");
    }

    const session: AuthSession = { user: riderUser, token: sessionToken };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));

    setRider(riderUser);
    setToken(sessionToken);
    setIsOnline(true);
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Logout persistence error:", err);
    } finally {
      setRider(null);
      setToken(null);
      setIsOnline(false);
    }
  };

  const toggleShiftStatus = async () => {
    const nextStatus = !isOnline;
    setIsOnline(nextStatus);

    if (rider) {
      const updatedUser = { ...rider, isOnline: nextStatus };
      setRider(updatedUser);
      if (token) {
        try {
          const session: AuthSession = { user: updatedUser, token };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } catch (err) {
          console.error("Failed to update shift status in storage:", err);
        }
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
        login,
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
