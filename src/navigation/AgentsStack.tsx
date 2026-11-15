import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { AgentsStackParamList } from './types';
import AgentsScreen from '@/screens/AgentsScreen';
import AgentDetailScreen from '@/screens/AgentDetailScreen';
import SessionScreen from '@/screens/SessionScreen';

const Stack = createNativeStackNavigator<AgentsStackParamList>();

export function AgentsStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator
      // Every screen draws its own iOS-style NavBar (src/components/layout):
      // native headers do not render on macOS / Windows.
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen
        name='Agents'
        component={AgentsScreen}
        options={{ title: t('agents.title') }}
      />
      <Stack.Screen
        name='AgentDetail'
        component={AgentDetailScreen}
        options={{ title: t('agents.detailTitle') }}
      />
      <Stack.Screen
        name='Session'
        component={SessionScreen}
        options={{ title: t('session.title') }}
      />
    </Stack.Navigator>
  );
}
