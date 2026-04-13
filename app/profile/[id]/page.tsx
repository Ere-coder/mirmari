/**
 * Owner Profile Page — route: /profile/[id]
 *
 * Spec §OWNER PROFILE PAGE:
 * - Shows the owner's district.
 * - Grid of their currently available items (with forward images).
 * - Tapping an item navigates to /item/[id].
 * - If viewing your own profile, shows a sign-out option.
 *
 * Server Component: all data fetched server-side.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import SignOutButton from '@/components/SignOutButton';
import { CATEGORY_LABELS, type ItemCategory, type PrimarySize } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function ProfileDetailPage({ params }: PageProps) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Fetch profile ──────────────────────────────────────────────────────────
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, district, display_name')
    .eq('id', params.id)
    .single();

  if (profileError || !profile) notFound();

  const isOwnProfile = profile.id === user.id;
  // Phase 8 §USER DISPLAY NAMES: display_name is optional; falls back to district
  const profileName  = (profile as unknown as { display_name?: string | null }).display_name ?? null;

  // ── Fetch owner's available items with forward images ──────────────────────
  const { data: rawItems } = await supabase
    .from('items')
    .select(`
      id,
      category,
      primary_size,
      numeric_size,
      credit_value,
      item_images ( id, url, is_forward )
    `)
    .eq('owner_id', params.id)
    .eq('status', 'available')
    .order('created_at', { ascending: false });

  const items = (rawItems ?? []).map(item => {
    const images = (item.item_images ?? []) as { id: string; url: string; is_forward: boolean }[];
    const forwardImage = images.find(img => img.is_forward) ?? images[0] ?? null;
    return {
      id:          item.id,
      category:    item.category as ItemCategory,
      primarySize: item.primary_size as PrimarySize,
      creditValue: item.credit_value,
      imageUrl:    forwardImage?.url ?? null,
    };
  });

  return (
    <>
      <main className="min-h-screen pb-32">
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="px-5 pt-12 pb-6">
          {/* Back button */}
          <Link
            href="/home"
            className="
              inline-flex items-center gap-1 mb-6
              text-brand-dark/40 text-[13px]
              active:text-brand-dark/70 transition-colors
            "
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </Link>

          {/* Avatar placeholder + display_name + district */}
          {/* Phase 8 §USER DISPLAY NAMES: display_name shown when set, district always shown */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-surface flex items-center justify-center flex-none">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="text-brand-dark/30">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" />
              </svg>
            </div>
            <div>
              {profileName && (
                <p className="text-[19px] font-semibold text-brand-dark leading-tight mb-0.5">
                  {profileName}
                </p>
              )}
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-dark/35 mb-0.5">
                {profileName ? 'Location' : 'District'}
              </p>
              <p className={`font-semibold text-brand-dark ${profileName ? 'text-[15px]' : 'text-[17px]'}`}>
                {profile.district}
              </p>
            </div>
          </div>

          {/* Own profile sign out */}
          {isOwnProfile && (
            <div className="mt-5">
              <SignOutButton />
            </div>
          )}
        </div>

        {/* ── Items grid ────────────────────────────────────────────────────── */}
        <div className="px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40 mb-4">
            {isOwnProfile ? 'Your items' : 'Available items'} · {items.length}
          </p>

          {items.length === 0 ? (
            <div className="bg-brand-surface rounded-2xl px-5 py-10 text-center">
              <p className="text-[14px] text-brand-dark/40">
                {isOwnProfile ? 'You haven\'t listed any items yet.' : 'No items available.'}
              </p>
              {isOwnProfile && (
                <Link
                  href="/upload"
                  className="inline-block mt-4 text-[13px] text-brand-accent font-medium"
                >
                  List your first item →
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {items.map(item => (
                <Link
                  key={item.id}
                  href={`/item/${item.id}`}
                  className="block bg-brand-surface rounded-2xl overflow-hidden active:opacity-75 transition-opacity"
                >
                  {/* Item image */}
                  <div className="aspect-square">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={CATEGORY_LABELS[item.category]}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-brand-bg">
                        <span className="text-brand-dark/20 text-xs">No photo</span>
                      </div>
                    )}
                  </div>

                  {/* Item info */}
                  <div className="px-3 py-2.5">
                    <p className="text-[13px] font-medium text-brand-dark leading-tight">
                      {CATEGORY_LABELS[item.category]}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-brand-dark/40">{item.primarySize}</span>
                      <span className="text-[11px] font-semibold text-brand-accent">
                        {item.creditValue}cr
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </>
  );
}
