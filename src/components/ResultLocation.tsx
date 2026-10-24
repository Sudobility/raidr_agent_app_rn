import React from 'react';
import { View } from 'react-native';
import { Text } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import type { ResultItem } from '@sudobility/raidr_agent_types';
import { hasResultCoordinates, resultLocationText } from '@/lib/resultLocation';
import ResultsMap from './ResultsMap';

/** A place answer always states what location evidence it has. */
export default function ResultLocation({ item }: { item: ResultItem }) {
  const { t } = useTranslation();
  const location = resultLocationText(item);
  return (
    <View className='mb-4'>
      <Text size='sm' weight='semibold' color='muted' transform='uppercase' className='mb-2 tracking-wide'>
        {t('resultDetail.location')}
      </Text>
      <Text size='base' className='mb-3'>
        {location ?? t('resultDetail.locationUnavailable')}
      </Text>
      {hasResultCoordinates(item) ? (
        <ResultsMap items={[item]} userLocation={null} onSelect={() => {}} />
      ) : (
        <Text size='sm' color='muted'>{t('results.noMapResults')}</Text>
      )}
    </View>
  );
}
