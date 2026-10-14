/**
 * SignInPage — `LoginPage` from `@sudobility/building_blocks_rn`, wired to
 * this app's auth: the app's name, a heading that follows the form's mode,
 * the shared form, and its own scrolling and keyboard avoidance.
 *
 * Use it where somebody goes *in order to* sign in — Settings' Account pane
 * while signed out. Where signing in interrupts something else (Go on Ask),
 * `SignInModal` opens over that screen instead. Both take everything from
 * `useSignInForm()`.
 */

import React from 'react';
import { LoginPage } from '@sudobility/building_blocks_rn';
import { APP_NAME } from '@/config/constants';
import { useSignInForm } from '@/hooks/useSignInForm';

export interface SignInPageProps {
  /**
   * Somebody signed in or made their account. Optional: where the page sits
   * re-renders on its own once `useAuth` reports a user.
   */
  onSuccess?: () => void;
}

export default function SignInPage({ onSuccess }: SignInPageProps) {
  const form = useSignInForm();
  return (
    <LoginPage
      appName={APP_NAME}
      onEmailSignIn={form.onEmailSignIn}
      onEmailSignUp={form.onEmailSignUp}
      onPasswordReset={form.onPasswordReset}
      onGoogleSignIn={form.onGoogleSignIn}
      onAppleSignIn={form.onAppleSignIn}
      showGoogleSignIn={form.showGoogleSignIn}
      showAppleSignIn={form.showAppleSignIn}
      appleLogoTone={form.appleLogoTone}
      onSuccess={onSuccess ?? noop}
      text={form.text}
    />
  );
}

function noop() {}
