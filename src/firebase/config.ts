import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

declare const process: { env: Record<string, string | undefined> };

const firebaseConfig = {
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || 'https://capstonedata-3589c-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'capstonedata-3589c',
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
