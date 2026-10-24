import React from 'react';
import { View } from 'react-native';
import { Text } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import type { ResultItem } from '@sudobility/raidr_agent_types';
import type { Coordinates } from '@/stores/runFlowStore';
import { hasResultCoordinates } from '@/lib/resultLocation';
import ResultsMap from './ResultsMap';

interface Props {
  items: ResultItem[];
  userLocation: Coordinates | null;
  onSelect: (item: ResultItem) => void;
}

/** Map is part of place answers, rather than a view that hides the results. */
export default function LocationResultsMap({ items, userLocation, onSelect }: Props) {
  const { t } = useTranslation();
  const located = items.filter(hasResultCoordinates);
  return (
    <View className='mb-5'>
      <Text size='sm' weight='semibold' color='muted' transform='uppercase' className='mb-2 tracking-wide'>
        {t('results.map')}
      </Text>
      {located.length > 0 ? (
        <ResultsMap items={located} userLocation={userLocation} onSelect={onSelect} />
      ) : (
        <Text size='sm' color='muted'>{t('results.noMapResults')}</Text>
      )}
    </View>
  );
}
