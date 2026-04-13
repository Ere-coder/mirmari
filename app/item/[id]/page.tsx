/**
 * Item Detail Page — route: /item/[id]
 *
 * Spec §ITEM PROFILE PAGE:
 * - Full-screen image viewer (main image + thumbnails)
 * - Item details: category, size, fit description, fit tags, credit value, district
 * - Owner info: district, link to /profile/[owner_id]
 * - Action section (see routing logic below)
 * - Borrow history: show past borrowers (returned borrows)
 *
 * Phase 4 additions:
 * - Fetch queue state for this item (length + viewer's entry)
 * - Compute effectiveBalance = credits.balance − reserved credits in other queues
 * - Render QueuePanel instead of "Currently borrowed" when item.status === 'borrowed'
 * - Pass effectiveBalance to ClaimButton so credit checks are accurate
 *
 * Phase 5 additions:
 * - Fetch item.reclaiming column
 * - Detect active borrower (borrows with status IN ('pending','active'))
 * - Render ReturnButton if current user is the active borrower
 * - Render ReclaimButton in owner section when item is borrowed
 * - Pass reclaiming to QueuePanel so join is hidden during reclaim
 * - Show "Being reclaimed" state for non-queue users when available+reclaiming
 *
 * Action section routing logic (mutually exclusive, checked in order):
 *   1. isActiveBorrower                 → ReturnButton
 *   2. isOwner + borrowed               → "This is your item" + ReclaimButton
 *   3. isOwner + any other state        → "This is your item"
 *   4. available + !reclaiming          → ClaimButton
 *   5. available + reclaiming           → "Being reclaimed" notice
 *   6. borrowed                         → QueuePanel (with reclaiming prop)
 *   7. unavailable                      → "Not available"
 *
 * Phase 6 additions:
 * - Filter experience layer images out of ImageViewer (shown separately below)
 * - Detect isConfirmedBorrower (borrow.status = 'active') for upload CTA
 * - Fetch experience image owner profiles (for district labels)
 * - Render "Borrower content" section with experience images
 * - Show "Add your photos" link for confirmed borrowers
 *
 * Phase 7 additions:
 * - viewerImages = original layer only (condition images shown separately)
 * - Condition images section ("Excellent condition" placeholder when none)
 * - Report Damage button for confirmed borrowers (links to /report/[borrowId])
 * - Unavailable state for owner shows reimbursement notice if one exists
 *
 * Server Component: fetches all data, passes to Client sub-components.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import ImageViewer from './ImageViewer';
import ClaimButton from './ClaimButton';
import QueuePanel from './QueuePanel';
import ReturnButton from './ReturnButton';
import ReclaimButton from './ReclaimButton';
import {
  CATEGORY_LABELS,
  type ItemCategory,
  type PrimarySize,
  type ImageLayer,
  type QueueEntry,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function ItemPage({ params }: PageProps) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  // ── Fetch item with images, owner profile, and Phase 5 reclaiming flag ─────
  const { data: item, error: itemError } = await supabase
    .from('items')
    .select(`
      id,
      owner_id,
      category,
      credit_value,
      primary_size,
      numeric_size,
      fit_description,
      fit_tags,
      status,
      reclaiming,
      profiles!owner_id ( district, display_name ),
      item_images ( id, url, is_forward, layer, owner_id )
    `)
    .eq('id', params.id)
    .single();

  if (itemError || !item) notFound();

  // Phase 8 §USER DISPLAY NAMES: Supabase may return the FK join as array or object
  const profiles = item.profiles as { district: string; display_name: string | null } | { district: string; display_name: string | null }[] | null;
  const ownerProfile = Array.isArray(profiles) ? profiles[0] : profiles;
  const district     = ownerProfile?.district ?? 'Tbilisi';
  const ownerName    = ownerProfile?.display_name ?? null;

  const images = (item.item_images ?? []) as {
    id: string; url: string; is_forward: boolean; layer: ImageLayer; owner_id: string;
  }[];

  // Phase 7: ImageViewer shows only original layer images.
  // Condition images have their own section; experience images go in "Borrower content".
  const viewerImages     = images.filter(img => img.layer === 'original');
  const conditionImages  = images.filter(img => img.layer === 'condition');
  const experienceImages = images.filter(img => img.layer === 'experience');

  const forwardImage = viewerImages.find(img => img.is_forward);
  const allImages    = forwardImage
    ? [forwardImage, ...viewerImages.filter(img => !img.is_forward)]
    : viewerImages;

  const isOwner    = item.owner_id === user.id;
  const reclaiming = (item as unknown as { reclaiming: boolean }).reclaiming ?? false;

  // ── Parallel data fetches ─────────────────────────────────────────────────
  // Credits, item count, reserved queue credits, and (when borrowed) the
  // viewer's active borrow + queue state are all fetched in one go.
  const [
    { data: credits },
    { count: itemCount },
    { data: reservedRows },
  ] = await Promise.all([
    supabase
      .from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id),
    // Spec §AVAILABLE CREDIT CHECK: sum reserved_credits across all active queue
    // entries for this user to compute the effective spendable balance.
    supabase
      .from('queue')
      .select('reserved_credits')
      .eq('user_id', user.id)
      .eq('status', 'waiting'),
  ]);

  const rawBalance      = credits?.balance ?? 0;
  const viewerItemCount = itemCount ?? 0;
  const totalReserved   = (reservedRows ?? []).reduce((sum, r) => sum + (r.reserved_credits ?? 0), 0);
  // Effective balance = what the user can actually spend (soft-locked credits excluded).
  const effectiveBalance = rawBalance - totalReserved;

  // ── Phase 5+6: Detect active borrower ────────────────────────────────────
  // isActiveBorrower: borrower sees ReturnButton instead of the queue panel.
  //   Includes 'pending' (pre-handover confirmation) and 'active' (post-handover).
  // isConfirmedBorrower (Phase 6): borrow.status = 'active' specifically.
  //   Used to show "Add your photos" upload CTA after handover is confirmed.
  let isActiveBorrower    = false;
  let isConfirmedBorrower = false;
  let activeBorrowId: string | null = null;

  if (item.status === 'borrowed' && !isOwner) {
    const { data: activeBorrow } = await supabase
      .from('borrows')
      .select('id, status')
      .eq('item_id', params.id)
      .eq('borrower_id', user.id)
      .in('status', ['pending', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    isActiveBorrower    = activeBorrow !== null;
    // Only 'active' borrows (handover confirmed) unlock experience uploads + damage report
    isConfirmedBorrower = activeBorrow?.status === 'active';
    activeBorrowId      = activeBorrow?.id ?? null;
  }

  // ── Phase 4: Fetch queue data (only when borrowed and not the borrower) ───
  // Skipped for the active borrower since they see ReturnButton, not QueuePanel.
  let queueLength  = 0;
  let userEntry: QueueEntry | null = null;

  if (item.status === 'borrowed' && !isOwner && !isActiveBorrower) {
    const [{ data: waitingEntries }, { data: myEntry }] = await Promise.all([
      // Total waiting entries for queue-length display
      supabase
        .from('queue')
        .select('id')
        .eq('item_id', params.id)
        .eq('status', 'waiting'),
      // Viewer's own waiting entry (for position + turn state display)
      supabase
        .from('queue')
        .select('id, item_id, user_id, position, status, reserved_credits, turn_offered_at, confirmation_deadline, created_at')
        .eq('item_id', params.id)
        .eq('user_id', user.id)
        .eq('status', 'waiting')
        .maybeSingle(),
    ]);

    queueLength = (waitingEntries ?? []).length;
    userEntry   = myEntry as QueueEntry | null;
  }

  // ── Fetch borrow history (returned borrows) ───────────────────────────────
  // Phase 8 §USER DISPLAY NAMES: join profiles to show borrower name in history
  const { data: borrowHistory } = await supabase
    .from('borrows')
    .select('id, created_at, status, profiles!borrower_id ( display_name, district )')
    .eq('item_id', params.id)
    .eq('status', 'returned')
    .order('created_at', { ascending: false })
    .limit(10);

  // ── Phase 7: Fetch reimbursement for owner of an unavailable (retired) item ─
  let reimbursement: { total_credits: number; queue_snapshot: number } | null = null;
  if (isOwner && item.status === 'unavailable') {
    const { data: reimb } = await supabase
      .from('reimbursements')
      .select('total_credits, queue_snapshot')
      .eq('item_id', params.id)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    reimbursement = reimb ?? null;
  }

  // ── Phase 6: Fetch experience image owner profiles (for district labels) ──
  // Experience images have owner_id = the borrower who uploaded them.
  // We fetch their district to display below each image in the "Borrower content" section.
  let experienceOwnerMap: Record<string, string> = {};
  if (experienceImages.length > 0) {
    const ownerIds = Array.from(new Set(experienceImages.map(img => img.owner_id)));
    const { data: expOwners } = await supabase
      .from('profiles')
      .select('id, district')
      .in('id', ownerIds);
    experienceOwnerMap = Object.fromEntries(
      (expOwners ?? []).map(p => [p.id, p.district ?? 'Tbilisi'])
    );
  }

  return (
    <main className="min-h-screen bg-brand-bg pb-8">

      {/* Back navigation */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-app z-30 flex items-center px-4" style={{ paddingTop: 'calc(0.75rem + var(--sat, 0px))' }}>
        <Link
          href="/home"
          className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-brand-dark/60 backdrop-blur-sm text-brand-bg text-[13px] font-medium active:opacity-70 transition-opacity"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </Link>
      </div>

      {/* ── Image viewer ────────────────────────────────────────────────────── */}
      <ImageViewer images={allImages} category={item.category as ItemCategory} />

      {/* ── Item details ────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5">
        {/* Category + size */}
        <div className="flex items-baseline gap-2 mb-1.5">
          <h1 className="text-[22px] font-semibold text-brand-dark tracking-tight">
            {CATEGORY_LABELS[item.category as ItemCategory]}
          </h1>
          <span className="text-brand-dark/50 text-[15px]">
            {item.primary_size as PrimarySize}
            {item.numeric_size != null ? ` · EU ${item.numeric_size}` : ''}
          </span>
        </div>

        {/* Fit description */}
        {item.fit_description && (
          <p className="text-brand-dark/65 text-[14px] leading-relaxed mb-3">
            {item.fit_description}
          </p>
        )}

        {/* Fit tags */}
        {item.fit_tags && item.fit_tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {(item.fit_tags as string[]).map(tag => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-full bg-brand-surface text-brand-dark/60 text-[12px]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Credits + owner info row */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-brand-dark text-[16px] font-semibold">
            {item.credit_value} credits
          </span>
          {!isOwner && (
            <Link
              href={`/profile/${item.owner_id}`}
              className="text-brand-dark/40 text-[13px] active:text-brand-dark/70 transition-colors"
            >
              {ownerName ? `${ownerName} · ${district}` : district} ›
            </Link>
          )}
        </div>

        {/* ── Action section ───────────────────────────────────────────────── */}
        {/*
          Priority routing (checked top to bottom):
          1. Active borrower → ReturnButton (Phase 5)
          2. Owner + borrowed → owner note + ReclaimButton (Phase 5)
          3. Owner + other state → owner note (+ reclaiming notice if active)
          4. Non-owner, available, not reclaiming → ClaimButton (Phase 3)
          5. Non-owner, available, reclaiming → "Being reclaimed" notice (Phase 5)
          6. Non-owner, borrowed → QueuePanel with reclaiming prop (Phase 4+5)
          7. Unavailable → static notice
        */}

        {/* ── Case 1: Active borrower — show Return button + upload CTA ───── */}
        {isActiveBorrower && (
          <div className="flex flex-col gap-3">
            <ReturnButton
              itemId={params.id}
              borrowerId={user.id}
            />

            {/* Phase 6: "Add your photos" — visible only after handover is confirmed
                (borrow.status = 'active'). Links to /upload?exp=ITEM_ID so the
                ExperienceUploadForm pre-selects this item. */}
            {isConfirmedBorrower && (
              <Link
                href={`/upload?exp=${params.id}`}
                className="
                  w-full bg-brand-surface text-brand-dark/65
                  rounded-2xl py-4
                  text-[14px] font-medium text-center
                  border border-brand-dark/10
                  active:opacity-70 transition-opacity
                "
              >
                Add your photos
              </Link>
            )}

            {/* Phase 7: Report Damage button — only for confirmed borrowers.
                Links to /report/[borrowId] where the damage report form lives. */}
            {isConfirmedBorrower && activeBorrowId && (
              <Link
                href={`/report/${activeBorrowId}`}
                className="
                  w-full bg-brand-surface text-red-400
                  rounded-2xl py-4
                  text-[14px] font-medium text-center
                  border border-red-200
                  active:opacity-70 transition-opacity
                "
              >
                Report damage
              </Link>
            )}
          </div>
        )}

        {/* ── Case 2 + 3: Owner view ──────────────────────────────────────────── */}
        {isOwner && (
          <div className="flex flex-col gap-3">
            {/* Static ownership note */}
            <div className="rounded-2xl bg-brand-surface px-5 py-4 text-center">
              <p className="text-[14px] text-brand-dark/45">This is your item.</p>
            </div>

            {/* Phase 5: Reclaim button — shown when item is borrowed */}
            {/* Spec §ITEM PROFILE PAGE UPDATES:
                "If current user is the owner: if item is borrowed or has a queue:
                 show Reclaim Item button / if reclaiming = true: show in-progress." */}
            {item.status === 'borrowed' && (
              <ReclaimButton
                itemId={params.id}
                ownerId={user.id}
                isReclaiming={reclaiming}
              />
            )}

            {/* Phase 5: Reclaiming notice when item is available but reclaiming flag is still set
                (edge case: owner reclaimed an available item with no active borrow) */}
            {item.status === 'available' && reclaiming && (
              <div className="rounded-2xl bg-brand-surface px-5 py-4">
                <p className="text-[13px] text-brand-dark/55 leading-relaxed">
                  Reclaim in progress — waiting for circulation to complete.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Cases 4–7: Non-owner, non-borrower ────────────────────────────── */}
        {!isOwner && !isActiveBorrower && (
          <>
            {/* Case 4: Available + not reclaiming → claim flow (Phase 3, unchanged) */}
            {item.status === 'available' && !reclaiming && (
              <ClaimButton
                itemId={params.id}
                borrowerId={user.id}
                itemStatus={item.status}
                creditValue={item.credit_value}
                isOwner={isOwner}
                viewerBalance={effectiveBalance}
                viewerItemCount={viewerItemCount}
              />
            )}

            {/* Case 5: Available + reclaiming → item is locked by owner, no new claims */}
            {item.status === 'available' && reclaiming && (
              <div className="rounded-2xl bg-brand-surface px-5 py-4">
                <p className="text-[14px] text-brand-dark/65 leading-relaxed">
                  This item is being reclaimed by the owner.
                </p>
              </div>
            )}

            {/* Case 6: Borrowed → queue panel (Phase 4); passes reclaiming so join
                button is hidden when owner has triggered a reclaim (Phase 5) */}
            {item.status === 'borrowed' && (
              <QueuePanel
                itemId={params.id}
                userId={user.id}
                creditValue={item.credit_value}
                queueLength={queueLength}
                userEntry={userEntry}
                effectiveBalance={effectiveBalance}
                viewerItemCount={viewerItemCount}
                reclaiming={reclaiming}
              />
            )}

            {/* Case 7: Permanently retired (Phase 7 classify_irreversible) */}
            {item.status === 'unavailable' && (
              <div className="rounded-2xl bg-brand-surface px-5 py-4 text-center">
                <p className="text-[14px] text-brand-dark/45">Not available.</p>
              </div>
            )}
          </>
        )}

        {/* ── Phase 7: Owner view of a retired (unavailable) item ─────────── */}
        {isOwner && item.status === 'unavailable' && (
          <div className="rounded-2xl bg-brand-surface px-5 py-4 flex flex-col gap-1.5">
            <p className="text-[14px] font-semibold text-brand-dark">
              This item has been retired
            </p>
            <p className="text-[13px] text-brand-dark/50 leading-relaxed">
              An irreversible damage report was filed. This item is no longer in circulation.
            </p>
            {reimbursement && (
              <p className="text-[12px] text-brand-accent mt-1">
                You were reimbursed {reimbursement.total_credits} credits
                ({reimbursement.queue_snapshot} {reimbursement.queue_snapshot === 1 ? 'person' : 'people'} were in the queue).
              </p>
            )}
          </div>
        )}

        {/* ── Phase 7: Condition images ────────────────────────────────────── */}
        {/* Spec §CONDITION IMAGES: show condition-layer images in their own section.
            If none exist, show an "Excellent condition" placeholder. */}
        <div className="mt-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40 mb-3">
            Condition
          </p>
          {conditionImages.length === 0 ? (
            <div className="rounded-2xl bg-brand-surface px-5 py-4 text-center">
              <p className="text-[14px] text-brand-dark/50">Excellent condition</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {conditionImages.map(img => (
                <a
                  key={img.id}
                  href={img.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl overflow-hidden bg-brand-surface aspect-square active:opacity-80"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt="Condition"
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── Borrow history ───────────────────────────────────────────────── */}
        {borrowHistory && borrowHistory.length > 0 && (
          <div className="mt-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40 mb-3">
              Borrow history
            </p>
            <div className="bg-brand-surface rounded-2xl overflow-hidden">
              {borrowHistory.map((borrow, i) => {
                // Phase 8 §USER DISPLAY NAMES: show borrower name from joined profiles
                const borrowerProf = (borrow as unknown as {
                  profiles?: { display_name: string | null; district: string } | null
                }).profiles;
                const borrowerLabel = borrowerProf?.display_name ?? borrowerProf?.district ?? 'Tbilisi';
                return (
                <div
                  key={borrow.id}
                  className={`px-5 py-3.5 flex items-center justify-between ${
                    i < borrowHistory.length - 1 ? 'border-b border-brand-dark/5' : ''
                  }`}
                >
                  <span className="text-[13px] text-brand-dark/60">{borrowerLabel}</span>
                  <span className="text-[12px] text-brand-dark/30">
                    {new Date(borrow.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </span>
                </div>
                );
              })}
            </div>
          </div>
        )}
        {/* ── Phase 6: Borrower content (experience layer images) ──────────── */}
        {/* Spec §ITEM PAGE UPDATES: show images uploaded by past + current
            borrowers with layer='experience'. Each shows the uploader's district.
            Tapping opens the image full-screen in the browser. */}
        {experienceImages.length > 0 && (
          <div className="mt-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40 mb-3">
              Borrower content
            </p>
            <div className="grid grid-cols-2 gap-2">
              {experienceImages.map(img => (
                <a
                  key={img.id}
                  href={img.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block rounded-xl overflow-hidden bg-brand-surface aspect-square active:opacity-80"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt="Borrower experience"
                    className="w-full h-full object-cover"
                  />
                  {/* District label overlay */}
                  <span className="
                    absolute bottom-0 left-0 right-0
                    px-2 py-1.5
                    bg-gradient-to-t from-black/50 to-transparent
                    text-[11px] text-white/80 font-medium
                  ">
                    {experienceOwnerMap[img.owner_id] ?? 'Tbilisi'}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
