import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
// Auth screens (kept for navigation)
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

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

// Claim screens
import ClaimItemScreen from '../screens/claims/ClaimItemScreen';
import MyClaimsScreen from '../screens/claims/MyClaimsScreen';
import ClaimDetailScreen from '../screens/claims/ClaimDetailScreen';
import VerificationQAScreen from '../screens/claims/VerificationQAScreen';
import ReviewClaimsScreen from '../screens/claims/ReviewClaimsScreen';

// Chat screens
import ChatScreen from '../screens/chat/ChatScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';

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
          } else if (route.name === 'MessagesTab') {
            iconName = focused ? 'chat' : 'chat-outline';
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
        name="MessagesTab"
        component={ChatListScreen}
        options={{ tabBarLabel: 'Messages' }}
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
  // Skip auth for now - go directly to main app
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Main App Stack */}
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      <Stack.Screen name="CaseDetail" component={CaseDetailScreen} />
      <Stack.Screen name="CreateCase" component={CreateCaseScreen} />
      <Stack.Screen name="ReportFound" component={ReportFoundScreen} />
      <Stack.Screen name="SubmitTip" component={SubmitTipScreen} />
      <Stack.Screen name="MyCases" component={MyCasesScreen} />
      <Stack.Screen name="MySubmissions" component={MySubmissionsScreen} />
      <Stack.Screen name="PaymentHistory" component={PaymentHistoryScreen} />
      {/* Claim screens */}
      <Stack.Screen name="ClaimItem" component={ClaimItemScreen} />
      <Stack.Screen name="MyClaims" component={MyClaimsScreen} />
      <Stack.Screen name="ClaimDetail" component={ClaimDetailScreen} />
      <Stack.Screen name="VerificationQA" component={VerificationQAScreen} />
      <Stack.Screen name="ReviewClaims" component={ReviewClaimsScreen} />
      {/* Chat screens */}
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      {/* Map screen */}
      <Stack.Screen name="MapView" component={MapViewScreen} />
      {/* Auth screens (can navigate to later) */}
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
};

export default AppNavigator;
