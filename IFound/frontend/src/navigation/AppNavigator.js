import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';

// Main screens
import HomeScreen from '../screens/home/HomeScreen';
import CaseDetailScreen from '../screens/case/CaseDetailScreen';
import CreateCaseScreen from '../screens/case/CreateCaseScreen';
import ReportFoundScreen from '../screens/found/ReportFoundScreen';
import SubmitTipScreen from '../screens/submission/SubmitTipScreen';
import SearchScreen from '../screens/search/SearchScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import MapViewScreen from '../screens/map/MapViewScreen';
import MySubmissionsScreen from '../screens/profile/MySubmissionsScreen';
import MyCasesScreen from '../screens/profile/MyCasesScreen';
import PaymentHistoryScreen from '../screens/payment/PaymentHistoryScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'HomeTab') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'SearchTab') {
            iconName = focused ? 'magnify' : 'magnify';
          } else if (route.name === 'PostTab') {
            iconName = focused ? 'plus-circle' : 'plus-circle-outline';
          } else if (route.name === 'MapTab') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'ProfileTab') {
            iconName = focused ? 'account' : 'account-outline';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchScreen}
        options={{ tabBarLabel: 'Search' }}
      />
      <Tab.Screen
        name="PostTab"
        component={CreateCaseScreen}
        options={{ tabBarLabel: 'Post' }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapViewScreen}
        options={{ tabBarLabel: 'Map' }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return null; // Or loading screen
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        // Auth Stack
        <>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : (
        // Main App Stack
        <>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen name="CaseDetail" component={CaseDetailScreen} />
          <Stack.Screen name="CreateCase" component={CreateCaseScreen} />
          <Stack.Screen name="ReportFound" component={ReportFoundScreen} />
          <Stack.Screen name="SubmitTip" component={SubmitTipScreen} />
          <Stack.Screen name="MyCases" component={MyCasesScreen} />
          <Stack.Screen name="MySubmissions" component={MySubmissionsScreen} />
          <Stack.Screen name="PaymentHistory" component={PaymentHistoryScreen} />
        </>
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
