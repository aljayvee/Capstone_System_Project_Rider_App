import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import HomeScreen from '../modules/home/HomeScreen';
import TaskScreen from '../modules/task/TaskScreen';
import HistoryScreen from '../modules/history/HistoryScreen';
import ErrandDetailsScreen from '../modules/history/ErrandDetailsScreen';
import ProfileScreen from '../modules/profile/ProfileScreen';
import EditProfileScreen from '../modules/profile/EditProfileScreen';
import GpsCalibrationScreen from '../modules/profile/GpsCalibrationScreen';
import DispatcherChatScreen from '../modules/chat/DispatcherChatScreen';
import { RiderMissionProvider } from '../context/RiderMissionContext';
import { RiderBottomNav } from '../components/RiderBottomNav';

export type AuthedStackParamList = {
  Tabs: undefined;
  Task: undefined;
  ErrandDetails: { errandId: string };
  EditProfile: undefined;
  GpsCalibration: undefined;
  DispatcherChat: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  History: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const AuthedStack = createStackNavigator<AuthedStackParamList>();

// Three persistent tabs: Home (offers, waiting queue), History (completed errands), Profile (duty, earnings).
// The Task screen is a dedicated full-screen stack view opened when an errand is accepted.
function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <RiderBottomNav {...props} />}
      detachInactiveScreens={false}
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
      screenOptions={{ headerShown: false }}
      backBehavior="initialRoute"
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Wraps the authenticated stack in a single RiderMissionProvider instance so
// every screen shares one mission/socket/GPS state rather than each mounting its own.
//
// The Task screen mounts as a full-screen stack route without bottom navigation,
// giving the map and the errand bottom sheet complete viewport focus.
export function AuthedNavigator() {
  return (
    <RiderMissionProvider>
      <AuthedStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthedStack.Screen name="Tabs" component={MainTabNavigator} />
        <AuthedStack.Screen name="Task" component={TaskScreen} />
        <AuthedStack.Screen name="ErrandDetails" component={ErrandDetailsScreen} />
        <AuthedStack.Screen name="EditProfile" component={EditProfileScreen} />
        <AuthedStack.Screen name="GpsCalibration" component={GpsCalibrationScreen} />
        <AuthedStack.Screen name="DispatcherChat" component={DispatcherChatScreen} />
      </AuthedStack.Navigator>
    </RiderMissionProvider>
  );
}
