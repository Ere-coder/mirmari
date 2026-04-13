/**
 * Auth Screen — route: /
 *
 * - Full screen, centered layout.
 * - Icon mark (icon.svg) above the wordmark (wordmark.svg).
 * - Single "Continue with Google" button via Supabase Google OAuth.
 *
 * If the user is already logged in, middleware.ts redirects them to /home
 * before this page renders, so no explicit session check is needed here.
 */
'use client';

// Force dynamic rendering — this page reads auth state at request time
// and must never be statically pre-rendered without env vars.
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

export default function AuthPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Google OAuth sign-in ────────────────────────────────────────────────
  // Supabase handles the OAuth flow. After Google approves the user,
  // it redirects to /auth/callback which exchanges the code for a session,
  // then sends the user to /home (or /onboarding if no profile yet).
  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    // Create client inside the handler — not at module level — so it
    // never runs during SSR / static pre-render (env vars not available there).
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError('Sign in failed. Please try again.');
      setLoading(false);
    }
    // On success, the browser navigates away — no need to reset loading state.
  }

  return (
    <main className="screen-full items-center px-8 bg-brand-dark">
      {/*
        Layout matches reference image proportions:
        - Logo block centered at ~43% from top (slightly above mathematical center)
        - Button anchored independently near the bottom
        - flex-[5] top / flex-[6] between logo and button / flex-[1] bottom
          gives: logo center ≈ 43%, button sits at ~85% — large open space between them
      */}
      <div className="flex-[8]" />

      {/* ── Logo: icon mark + wordmark ────────────────────────────────────
          Sizes matched to reference:
          - icon:     ~45% of usable width → w-48 (192px on 416px usable)
          - wordmark: ~68% of usable width → w-72 (288px on 416px usable)
          - gap: 10px (tight, matching reference)
          ─────────────────────────────────────────────────────────────── */}
      <motion.div
        className="flex flex-col items-center gap-[4px]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <img
          src="/assets/icon.svg"
          alt=""
          className="w-48 h-auto"
          draggable={false}
          aria-hidden="true"
        />
        {/*
          wordmark.png is a square with dark padding baked in.
          -mt-8 pulls it up to close the visual gap caused by that internal whitespace.
          w-80 makes it slightly wider so the text reads at a good size.
        */}
        <img
          src="/assets/wordmark.png"
          alt="MirMari"
          className="w-80 h-auto -mt-8"
          draggable={false}
        />
      </motion.div>

      {/* Spacer between logo and button — pushes button toward the bottom */}
      <div className="flex-[6]" />

      {/* ── Sign-in button — anchored near the bottom of the screen ───────── */}
      <motion.div
        className="w-full max-w-xs flex flex-col items-center gap-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
      >
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="
            w-full flex items-center justify-center gap-3
            bg-brand-accent text-brand-bg
            rounded-2xl px-6 py-4
            text-base font-medium
            transition-opacity duration-200
            disabled:opacity-60
            active:opacity-80
          "
          aria-label="Continue with Google"
        >
          {/* Google logo mark — inline SVG so no extra asset needed */}
          {!loading && (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}

          {loading ? (
            // [ADDED: loading spinner] Simple spinner so user knows auth is in progress
            <span className="w-5 h-5 border-2 border-brand-bg/40 border-t-brand-bg rounded-full animate-spin" />
          ) : (
            'Continue with Google'
          )}
        </button>

        {/* Error feedback */}
        {error && (
          <p className="text-sm text-red-500 text-center" role="alert">
            {error}
          </p>
        )}
      </motion.div>

      <div className="flex-[4]" />
    </main>
  );
}
