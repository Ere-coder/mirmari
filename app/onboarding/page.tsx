'use client';

/**
 * Onboarding Screen — route: /onboarding
 *
 * Runs once after first login (no profile row exists yet).
 * Middleware enforces auth; if no session, user never reaches this route.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const DELIVERY_ZONES = [
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

const SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;

type DeliveryZone = (typeof DELIVERY_ZONES)[number];
type Size = (typeof SIZES)[number];

export default function OnboardingPage() {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [zone, setZone] = useState<DeliveryZone | ''>('');
  const [size, setSize] = useState<Size | ''>('');
  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guard: redirect if profile already exists
  useEffect(() => {
    supabaseRef.current = createClient();
    const supabase = supabaseRef.current;

    async function checkProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCheckingProfile(false); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (profile) { router.replace('/wardrobe'); return; }

      setCheckingProfile(false);
    }

    checkProfile();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!phone.trim()) { setError('Please enter your phone number.'); return; }
    if (!zone) { setError('Please select your delivery zone.'); return; }
    if (!size) { setError('Please select your size.'); return; }

    const supabase = supabaseRef.current!;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Session expired. Please sign in again.');
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from('profiles').insert({
      id:              user.id,
      display_name:    name.trim() || null,
      phone:           phone.trim(),
      delivery_zone:   zone,
      size_preference: size,
    });

    if (insertError) {
      console.error('[Onboarding] insert error:', insertError);
      setError(insertError.message || JSON.stringify(insertError));
      setLoading(false);
      return;
    }

    router.push('/subscribe');
  }

  if (checkingProfile) {
    return (
      <div className="screen-full items-center justify-center">
        <span className="w-8 h-8 border-2 border-brand-plum/30 border-t-brand-plum rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="screen-full px-6 py-10">
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
          A few details to set up your wardrobe.
        </p>
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        {/* Name — optional */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-brand-dark">
            Your name{' '}
            <span className="font-normal text-brand-dark/40">(optional)</span>
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
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

        {/* Phone */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-brand-dark">
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

        {/* Size preference */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-brand-dark">
            Your size
          </label>
          <div className="flex gap-2">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`
                  flex-1 py-3 rounded-xl border text-sm font-medium
                  transition-all duration-150
                  ${size === s
                    ? 'bg-brand-accent text-brand-bg border-brand-accent'
                    : 'bg-white text-brand-dark border-brand-dark/15 active:bg-brand-surface'
                  }
                `}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Delivery zone */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="zone" className="text-sm font-medium text-brand-dark">
            Delivery zone
          </label>
          <select
            id="zone"
            value={zone}
            onChange={(e) => setZone(e.target.value as DeliveryZone)}
            className="
              w-full rounded-xl border border-brand-dark/15
              bg-white px-4 py-3
              text-brand-dark
              focus:outline-none focus:ring-2 focus:ring-brand-accent/40
              transition-shadow appearance-none
            "
          >
            <option value="" disabled>Select your district</option>
            {DELIVERY_ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-sm text-red-500" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="
            w-full bg-brand-accent text-brand-bg
            rounded-2xl px-6 py-4
            text-base font-medium
            transition-opacity duration-200
            disabled:opacity-60 active:opacity-80 mt-2
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
