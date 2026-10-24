/**
 * All results — every result of a `single` / `best` run, opened from the
 * best result's "See all N results". A list when the window is narrow, tiles
 * when wide; merged duplicates show once ({@link ResultList}).
 *
 * Typed with a decoupled route prop so it serves both the Ask stack (a live
 * run) and the History stack (a saved one).
 */

import React, { useEffect } from 'react';
import { useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import Screen from '@/components/layout/Screen';
import ResultList from '@/components/ResultList';
import LocationResultsMap from '@/components/LocationResultsMap';
import { useRunFlowStore } from '@/stores/runFlowStore';
import { trackScreenView } from '@/analytics';
import type { AllResultsParams, ResultDetailParams } from '@/navigation/types';

type ResultNavigation = NativeStackNavigationProp<{ ResultDetail: ResultDetailParams }>;

interface AllResultsScreenProps {
  route: RouteProp<{ AllResults: AllResultsParams }, 'AllResults'>;
}

export default function AllResultsScreen({ route }: AllResultsScreenProps) {
  const { results, groups, best, locationRequest } = route.params;
  const navigation = useNavigation<ResultNavigation>();
  const userLocation = useRunFlowStore(s => s.location);
  const { t } = useTranslation();

  useEffect(() => {
    trackScreenView('AllResults');
  }, []);

  return (
    <Screen
      title={t('results.allTitle', { count: results.length })}
      layout='list'
    >
      {locationRequest && results.length > 0 ? (
        <LocationResultsMap
          items={results}
          userLocation={userLocation}
          onSelect={item => navigation.navigate('ResultDetail', { item, locationRequest })}
        />
      ) : null}
      <ResultList
        results={results}
        groups={groups ?? null}
        best={best ?? null}
        locationRequest={locationRequest}
      />
    </Screen>
  );
}
