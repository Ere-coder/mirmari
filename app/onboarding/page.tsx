/**
 * Onboarding Screen — route: /onboarding
 *
 * Spec §ONBOARDING:
 * - Runs once after first login (when no profile row exists).
 * - Collects phone number and Tbilisi district.
 * - Saves to `profiles` table in Supabase.
 * - Redirects to /home on completion.
 *
 * Tbilisi districts (hardcoded per spec):
 *   Vake, Saburtalo, Didube, Gldani, Isani, Samgori,
 *   Chugureti, Nadzaladevi, Krtsanisi, Mtatsminda
 *
 * City is hardcoded as "Tbilisi" per spec.
 *
 * NOTE on Supabase client instantiation:
 * createClient() must only be called inside useEffect or event handlers —
 * never at the component top level. Client Components still run on the server
 * during SSR pre-render, and createBrowserClient throws if env vars are absent.
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// Tbilisi districts — spec §ONBOARDING (hardcoded, no API)
const TBILISI_DISTRICTS = [
  'Vake',
  'Saburtalo',
  'Didube',
  'Gldani',
  'Isani',
  'Samgori',
  'Chugureti',
  'Nadzaladevi',
  'Krtsanisi',
  'Mtatsminda',
] as const;

type District = (typeof TBILISI_DISTRICTS)[number];

export default function OnboardingPage() {
  const router = useRouter();

  // Supabase client is stored in a ref so it's created once on the client,
  // never during SSR. useRef value persists across re-renders without triggering them.
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState<District | ''>('');
  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Guard: redirect if profile already exists ──────────────────────────
  // This runs only in the browser (useEffect is never called during SSR).
  // Middleware already enforces session auth; this page enforces profile state.
  useEffect(() => {
    // Safe to instantiate the Supabase client here — browser only
    supabaseRef.current = createClient();
    const supabase = supabaseRef.current;

    async function checkProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (profile) {
        // Profile already complete — skip onboarding
        router.replace('/home');
        return;
      }

      setCheckingProfile(false);
    }

    checkProfile();
  }, [router]);

  // ── Form submission: save profile to Supabase ──────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!phone.trim()) {
      setError('Please enter your phone number.');
      return;
    }
    if (!district) {
      setError('Please select your district.');
      return;
    }

    // supabaseRef.current is always set by this point (set in useEffect on mount)
    const supabase = supabaseRef.current!;
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace('/');
      return;
    }

    // Insert profile row — spec §DATABASE
    // city is hardcoded to "Tbilisi" per spec
    // display_name is optional — stored as null if blank (Phase 8: formalised column)
    const { error: insertError } = await supabase.from('profiles').insert({
      id:           user.id,          // references auth.users
      display_name: name.trim() || null,
      phone:        phone.trim(),
      city:         'Tbilisi',        // hardcoded per spec
      district,
    });

    if (insertError) {
      console.error('[Onboarding] profiles insert error:', insertError);
      setError(insertError.message || JSON.stringify(insertError));
      setLoading(false);
      return;
    }

    // Onboarding complete — go to home
    router.push('/home');
  }

  // Show spinner while checking (avoids flash of onboarding form for returning users)
  if (checkingProfile) {
    return (
      <div className="screen-full items-center justify-center">
        <span className="w-8 h-8 border-2 border-brand-plum/30 border-t-brand-plum rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="screen-full px-6 py-10">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        className="mb-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-semibold text-brand-dark mb-1">
          Welcome to MirMari
        </h1>
        <p className="text-sm text-brand-dark/60">
          A few details to get you started.
        </p>
      </motion.div>

      {/* ── Form ───────────────────────────────────────────────────────── */}
      <motion.form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        {/* Display name input — Phase 8 §USER DISPLAY NAMES: optional, falls back to district */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="name"
            className="text-sm font-medium text-brand-dark"
          >
            Your name{' '}
            <span className="font-normal text-brand-dark/40">(optional)</span>
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="
              w-full rounded-xl border border-brand-dark/15
              bg-white px-4 py-3
              text-brand-dark placeholder:text-brand-dark/35
              focus:outline-none focus:ring-2 focus:ring-brand-accent/40
              transition-shadow
            "
          />
        </div>

        {/* Phone number input */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="phone"
            className="text-sm font-medium text-brand-dark"
          >
            Phone number
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+995 5XX XXX XXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="
              w-full rounded-xl border border-brand-dark/15
              bg-white px-4 py-3
              text-brand-dark placeholder:text-brand-dark/35
              focus:outline-none focus:ring-2 focus:ring-brand-accent/40
              transition-shadow
            "
          />
        </div>

        {/* District selector — spec §ONBOARDING */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="district"
            className="text-sm font-medium text-brand-dark"
          >
            District
          </label>
          <select
            id="district"
            value={district}
            onChange={(e) => setDistrict(e.target.value as District)}
            className="
              w-full rounded-xl border border-brand-dark/15
              bg-white px-4 py-3
              text-brand-dark
              focus:outline-none focus:ring-2 focus:ring-brand-accent/40
              transition-shadow
              appearance-none
            "
          >
            <option value="" disabled>
              Select your district
            </option>
            {TBILISI_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* City is hardcoded — shown as informational, not editable */}
        <div className="rounded-xl bg-brand-surface px-4 py-3 text-sm text-brand-dark/70">
          City: <span className="font-medium text-brand-dark">Tbilisi</span>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="
            w-full bg-brand-accent text-brand-bg
            rounded-2xl px-6 py-4
            text-base font-medium
            transition-opacity duration-200
            disabled:opacity-60
            active:opacity-80
            mt-2
          "
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-brand-bg/40 border-t-brand-bg rounded-full animate-spin" />
              Saving…
            </span>
          ) : (
            'Get started'
          )}
        </button>
      </motion.form>
    </main>
  );
}
