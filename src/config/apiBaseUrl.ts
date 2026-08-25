import { Platform } from "react-native";
import Constants from "expo-constants";

declare const process: { env: { [key: string]: string | undefined } };

const getDynamicHostIp = (): string | null => {
  try {
    const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.debuggerHost || (Constants as any).manifest2?.extra?.expoGo?.developer?.tool;
    if (hostUri) {
      const ip = hostUri.split(":")[0];
      if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
        return `http://${ip}:5000/api`;
      }
    }
  } catch (e) {
    // Ignore error
  }
  return null;
};

const rawUrl =
  (typeof process !== "undefined" && process.env && process.env.EXPO_PUBLIC_API_BASE_URL) ||
  getDynamicHostIp() ||
  (Platform.OS === "android" ? "http://10.0.2.2:5000/api" : "http://localhost:5000/api");

export const API_BASE_URL = rawUrl.replace(/\/+$/, "");
