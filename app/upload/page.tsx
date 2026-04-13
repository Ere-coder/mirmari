/**
 * Upload Page — route: /upload
 *
 * Spec §UPLOAD:
 * "only authenticated users / only users with a completed profile"
 *
 * This Server Component:
 *   1. Checks that the user is authenticated (redirect to / if not).
 *   2. Checks that the user has a completed profile (redirect to /onboarding if not).
 *   3. Renders the UploadForm client component for listing new items.
 *
 * Phase 6 additions:
 *   4. Reads optional ?exp=ITEM_ID query parameter (set by the "Add your photos"
 *      link on /item/[id]) to pre-select an item in ExperienceUploadForm.
 *   5. Fetches all active borrows (status='active') for the current user.
 *      An 'active' borrow means handover was confirmed — the borrower may now
 *      upload experience-layer photos.
 *   6. If the user has active borrows, renders ExperienceUploadForm below the
 *      regular UploadForm.
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import UploadForm from './UploadForm';
import ExperienceUploadForm from './ExperienceUploadForm';
import BottomNav from '@/components/BottomNav';
import { CATEGORY_LABELS, type ItemCategory } from '@/lib/types';

// force-dynamic: page depends on the current user session at request time.
export const dynamic = 'force-dynamic';

interface PageProps {
  // searchParams.exp: item ID pre-selected for experience upload (from item page CTA)
  searchParams: { exp?: string };
}

export default async function UploadPage({ searchParams }: PageProps) {
  const supabase = createClient();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Profile guard ──────────────────────────────────────────────────────────
  // Upload is only available to users who have completed onboarding.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/onboarding');

  // ── Phase 6: Fetch active borrows for the current user ────────────────────
  // 'active' = handover confirmed by both sides (borrows.status set by confirm_handover).
  // Only these borrows unlock the experience layer upload.
  const { data: activeBorrows } = await supabase
    .from('borrows')
    .select('id, item_id, created_at')
    .eq('borrower_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  // ── Phase 6: Fetch item info for active borrows ────────────────────────────
  // We need category (for display label) and forward image (for thumbnail).
  let borrowedItems: {
    borrowId: string;
    itemId: string;
    category: ItemCategory;
    categoryLabel: string;
    forwardImageUrl: string | null;
  }[] = [];

  if (activeBorrows && activeBorrows.length > 0) {
    const itemIds = activeBorrows.map(b => b.item_id);

    const [{ data: items }, { data: forwardImages }] = await Promise.all([
      supabase
        .from('items')
        .select('id, category')
        .in('id', itemIds),
      supabase
        .from('item_images')
        .select('item_id, url')
        .in('item_id', itemIds)
        .eq('is_forward', true),
    ]);

    const categoryById  = Object.fromEntries(
      (items ?? []).map(i => [i.id, i.category as ItemCategory])
    );
    const imageByItemId = Object.fromEntries(
      (forwardImages ?? []).map(img => [img.item_id, img.url])
    );

    borrowedItems = activeBorrows.map(borrow => {
      const category = (categoryById[borrow.item_id as string] ?? 'tshirt_top') as ItemCategory;
      return {
        borrowId:        borrow.id,
        itemId:          borrow.item_id,
        category,
        categoryLabel:   CATEGORY_LABELS[category],
        forwardImageUrl: imageByItemId[borrow.item_id] ?? null,
      };
    });
  }

  // ── Pre-selected item from ?exp= query param ──────────────────────────────
  // Validate that the pre-selected item is actually one of the user's active borrows.
  const preselectedItemId = searchParams.exp
    ? (borrowedItems.some(b => b.itemId === searchParams.exp) ? searchParams.exp : undefined)
    : undefined;

  return (
    <>
      <main className="min-h-screen px-5 pb-32 pt-12">
        {/* ── Section 1: List a new item ────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-[26px] font-semibold text-brand-dark tracking-tight leading-tight">
            List an item
          </h1>
          <p className="text-[15px] text-brand-dark/45 mt-2 leading-relaxed">
            Add photos and describe how it fits.
          </p>
        </div>

        {/* UploadForm handles all form state, image upload, and DB writes. */}
        <UploadForm userId={user.id} />

        {/* ── Section 2: Add experience photos (Phase 6) ────────────────────── */}
        {/* Only shown when the user has at least one active borrow.
            Spec §BORROWER UPLOAD PERMISSIONS: after borrows.status = 'active',
            the borrower can upload experience-layer images to that item. */}
        {borrowedItems.length > 0 && (
          <div className="mt-14">
            <div className="mb-6">
              <h2 className="text-[20px] font-semibold text-brand-dark tracking-tight leading-tight">
                Add to a borrow
              </h2>
              <p className="text-[14px] text-brand-dark/45 mt-1.5 leading-relaxed">
                Share how the item fits you.
              </p>
            </div>

            <ExperienceUploadForm
              userId={user.id}
              borrowedItems={borrowedItems}
              preselectedItemId={preselectedItemId}
            />
          </div>
        )}
      </main>

      <BottomNav />
    </>
  );
}
