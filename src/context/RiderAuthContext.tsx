import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../config/apiConfig";

export interface RiderUser {
  id: number;
  username: string;
  name: string;
  phone: string;
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
            setRider(session.user);
            setToken(session.token);
            setIsOnline(session.user.isOnline ?? true);
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
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        let errorMsg = "Invalid username or password";
        try {
          const errorData = await res.json();
          if (errorData && errorData.error) {
            errorMsg = errorData.error;
          }
        } catch (_) {
          // fallback to default errorMsg
        }
        throw new Error(errorMsg);
      }

      const userData = await res.json();
      const riderUser: RiderUser = {
        id: userData.id ?? 3,
        username: userData.username || username,
        name: userData.name || (userData.firstName ? `${userData.firstName} ${userData.lastName || ""}`.trim() : "Al-Dhen Musali"),
        phone: userData.phone || "09391234567",
        isOnline: true,
        vehicle: userData.vehicle || "Motorcycle (ABC-1234)",
        avatarUrl: userData.avatarUrl,
      };

      const sessionToken = userData.token || `rider-jwt-${userData.id || Date.now()}`;
      const session: AuthSession = { user: riderUser, token: sessionToken };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));

      setRider(riderUser);
      setToken(sessionToken);
      setIsOnline(true);
    } catch (err) {
      console.error("Login error:", err);
      throw err;
    }
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
