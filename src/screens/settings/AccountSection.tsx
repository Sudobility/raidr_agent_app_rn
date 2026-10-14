/**
 * The app account (Firebase, through `AuthContext`).
 *
 * **Signed out, this pane is the way in**, and nothing else: the sign-in page
 * (`SignInPage`, building_blocks_rn's `LoginPage`), since this is where
 * somebody goes in order to sign in. A "Sign in" row would be a step before
 * it, and a modal over a pane with nothing else to show would be another. The
 * page scrolls itself, so its hosts drop their own scroll view
 * ({@link useAccountScrollsItself}). Signed in, it shows the account and the
 * way out.
 */

import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import { Button, Spinner, Text } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import SignInPage from '@/components/SignInPage';
import { trackButtonClick, trackEvent } from '@/analytics';
import { SettingsGroup, SettingsRow } from './SettingsRows';

/**
 * Whether the Account section is the sign-in page right now, which brings its
 * own scrolling and heading: its host shows it without either.
 */
export function useAccountScrollsItself(): boolean {
  const { user, isLoading } = useAuth();
  return !isLoading && !user;
}

export default function AccountSection() {
  const { t } = useTranslation();
  const { user, isLoading, signOut } = useAuth();

  const handleSignOut = useCallback(() => {
    trackButtonClick('sign_out');
    Alert.alert(t('auth.signOut'), t('auth.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.signOut'),
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            trackEvent('signed_out');
          } catch (error) {
            console.error('Sign out error:', error);
          }
        },
      },
    ]);
  }, [signOut, t]);

  if (isLoading) {
    return <Spinner size='small' />;
  }

  if (!user) {
    return <SignInPage />;
  }

  return (
    <>
      <SettingsGroup>
        <SettingsRow label={t('settings.accountEmail')}>
          <Text size='base' color='muted'>
            {user.email || t('auth.signedIn')}
          </Text>
        </SettingsRow>
        {user.displayName ? (
          <SettingsRow label={t('settings.accountName')}>
            <Text size='base' color='muted'>
              {user.displayName}
            </Text>
          </SettingsRow>
        ) : null}
      </SettingsGroup>
      <Button
        variant='outline'
        onPress={handleSignOut}
        accessibilityLabel={t('auth.signOut')}
        testID='settings-sign-out'
      >
        {t('auth.signOut')}
      </Button>
    </>
  );
}
