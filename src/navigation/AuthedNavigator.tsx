import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import HomeScreen from '../modules/home/HomeScreen';
import TaskScreen from '../modules/task/TaskScreen';
import HistoryScreen from '../modules/history/HistoryScreen';
import ErrandDetailsScreen from '../modules/history/ErrandDetailsScreen';
import ProfileScreen from '../modules/profile/ProfileScreen';
import EditProfileScreen from '../modules/profile/EditProfileScreen';
import { RiderMissionProvider } from '../context/RiderMissionContext';
import { RiderBottomNav } from '../components/RiderBottomNav';

export type AuthedStackParamList = {
  Tabs: undefined;
  ErrandDetails: { errandId: string };
  EditProfile: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Task: undefined;
  History: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const AuthedStack = createStackNavigator<AuthedStackParamList>();

// Four tabs for the four things a rider does: decide, execute, review, manage.
//
// These were three, and one of them did two jobs — "Tasks" listed only DELIVERED
// errands, so it was the history screen wearing the name of the work in hand.
// Everything a rider did while actually running an errand lived on Home, stacked
// underneath the accept/decline card for a different errand entirely.
function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <RiderBottomNav {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Task" component={TaskScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Wraps the authenticated tab stack in a single RiderMissionProvider instance so
// every tab shares one mission/socket/GPS state rather than each mounting its own.
//
// The LiveErrandMap modal route that used to live here is gone: the Task tab now
// renders the map itself. It was a modal only because a MapView cannot sit inside
// a ScrollView, and Task solves that by making the map a sibling of its sheet
// rather than a child of a scrolling container.
export function AuthedNavigator() {
  return (
    <RiderMissionProvider>
      <AuthedStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthedStack.Screen name="Tabs" component={MainTabNavigator} />
        <AuthedStack.Screen name="ErrandDetails" component={ErrandDetailsScreen} />
        <AuthedStack.Screen name="EditProfile" component={EditProfileScreen} />
      </AuthedStack.Navigator>
    </RiderMissionProvider>
  );
}
