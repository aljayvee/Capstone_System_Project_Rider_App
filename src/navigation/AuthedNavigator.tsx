import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import HomeScreen from '../modules/home/HomeScreen';
import TasksScreen from '../modules/tasks/TasksScreen';
import ProfileScreen from '../modules/profile/ProfileScreen';
import LiveErrandMapScreen from '../screens/LiveErrandMapScreen';
import { RiderMissionProvider } from '../context/RiderMissionContext';
import { RiderBottomNav } from '../components/RiderBottomNav';

export type AuthedStackParamList = {
  Tabs: undefined;
  LiveErrandMap: undefined;
};

const Tab = createBottomTabNavigator();
const AuthedStack = createStackNavigator<AuthedStackParamList>();

function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <RiderBottomNav {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Wraps the authenticated tab stack + the live errand map (a modal screen so
// it can render full-screen outside any tab's ScrollView) in a single
// RiderMissionProvider instance, so both share the same mission/socket/GPS state.
export function AuthedNavigator() {
  return (
    <RiderMissionProvider>
      <AuthedStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthedStack.Screen name="Tabs" component={MainTabNavigator} />
        <AuthedStack.Screen name="LiveErrandMap" component={LiveErrandMapScreen} options={{ presentation: 'modal' }} />
      </AuthedStack.Navigator>
    </RiderMissionProvider>
  );
}
