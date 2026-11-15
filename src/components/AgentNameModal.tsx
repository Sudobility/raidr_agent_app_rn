/**
 * A small modal that asks for an agent name — used by "Save as agent" on a
 * finished run and by "Rename" on an agent's detail. Renders through the
 * shared PortalHost so it works on macOS and Windows too.
 */

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Modal, Input, Button } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';

export default function AgentNameModal({
  visible,
  title,
  initialName = '',
  submitLabel,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  initialName?: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);

  // Reset the field each time the modal opens.
  useEffect(() => {
    if (visible) {
      setName(initialName);
    }
  }, [visible, initialName]);

  const trimmed = name.trim();

  return (
    <Modal isOpen={visible} onClose={onClose} title={title}>
      <View className='gap-4'>
        <Input
          value={name}
          onChangeText={setName}
          placeholder={t('agents.namePlaceholder')}
          autoFocus
          returnKeyType='done'
          onSubmitEditing={() => trimmed && onSubmit(trimmed)}
          accessibilityLabel={t('agents.namePlaceholder')}
        />
        <View className='flex-row justify-end gap-2'>
          <Button variant='outline' size='sm' onPress={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            size='sm'
            disabled={!trimmed}
            onPress={() => trimmed && onSubmit(trimmed)}
          >
            {submitLabel}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
