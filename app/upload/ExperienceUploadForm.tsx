/**
 * ExperienceUploadForm — client component for uploading experience-layer photos.
 *
 * Spec §BORROWER UPLOAD PERMISSIONS:
 * - After borrows.status = 'active' (handover confirmed), the borrower can add
 *   photos to the item's experience layer.
 * - Images are stored with:
 *     layer:    'experience'
 *     item_id:  the borrowed item
 *     owner_id: the borrower's user id (not the item owner's)
 *     is_forward: false (experience images never replace the primary view)
 *
 * Storage path: {userId}/{itemId}/exp/{timestamp}_{index}
 * (Follows the existing storage RLS — first folder must equal the user's uid.)
 *
 * This form is only rendered by /upload when the user has ≥1 active borrow.
 * If preselectedItemId is provided (from the ?exp= query param on /item/[id]),
 * that item is pre-selected in the dropdown.
 *
 * Connects to: Supabase Storage (item-images bucket) + item_images table.
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ItemCategory } from '@/lib/types';

interface BorrowedItem {
  borrowId: string;
  itemId: string;
  category: ItemCategory;
  categoryLabel: string;
  forwardImageUrl: string | null;
}

interface Props {
  userId: string;
  /** Active borrows the current user can upload experience photos for. */
  borrowedItems: BorrowedItem[];
  /** Item pre-selected from the ?exp= query param on /item/[id]. */
  preselectedItemId?: string;
}

export default function ExperienceUploadForm({ userId, borrowedItems, preselectedItemId }: Props) {
  const router = useRouter();

  // ── Selected item ──────────────────────────────────────────────────────────
  const [selectedItemId, setSelectedItemId] = useState<string>(
    preselectedItemId ?? borrowedItems[0]?.itemId ?? ''
  );

  // ── File selection ────────────────────────────────────────────────────────
  const [files, setFiles]         = useState<File[]>([]);
  const [previews, setPreviews]   = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload state ──────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [done, setDone]           = useState(false);

  // ── Keep preselectedItemId in sync if it changes (URL param) ─────────────
  useEffect(() => {
    if (preselectedItemId) setSelectedItemId(preselectedItemId);
  }, [preselectedItemId]);

  // ── Generate object URL previews for selected files ───────────────────────
  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => { urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [files]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles(selected);
    setDone(false);
    setError(null);
  }

  // ── Upload handler ─────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!selectedItemId || files.length === 0) return;

    setError(null);
    setUploading(true);
    const supabase = createClient();
    const ts = Date.now();

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Storage path: {userId}/{itemId}/exp/{timestamp}_{index}
        // Must start with userId to satisfy storage RLS ("first folder = uid").
        const storagePath = `${userId}/${selectedItemId}/exp/${ts}_${i}`;

        // ── Step 1: Upload to storage ─────────────────────────────────────
        const { error: storageError } = await supabase.storage
          .from('item-images')
          .upload(storagePath, file, { upsert: false });

        if (storageError) throw new Error(`Upload failed: ${storageError.message}`);

        // ── Step 2: Get public URL ────────────────────────────────────────
        const { data: urlData } = supabase.storage
          .from('item-images')
          .getPublicUrl(storagePath);

        // ── Step 3: Insert item_images row with layer='experience' ────────
        // owner_id = borrower's user id (not the item owner), so the borrower
        // can manage their own uploads and RLS allows the write.
        const { error: dbError } = await supabase
          .from('item_images')
          .insert({
            item_id:    selectedItemId,
            owner_id:   userId,   // borrower is the uploader
            url:        urlData.publicUrl,
            layer:      'experience',
            is_forward: false,    // experience images never replace the primary view
          });

        if (dbError) throw new Error(`DB insert failed: ${dbError.message}`);
      }

      // ── Success ────────────────────────────────────────────────────────────
      setDone(true);
      setFiles([]);
      setPreviews([]);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Refresh the page the user came from (if they navigated via ?exp=) so
      // the new photos appear in the "Borrower content" section.
      if (preselectedItemId) {
        router.push(`/item/${selectedItemId}`);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setUploading(false);
    }
  }

  const selectedItem = borrowedItems.find(b => b.itemId === selectedItemId);

  // ── Success state ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="rounded-2xl bg-brand-surface px-5 py-5 text-center">
        <p className="text-[15px] font-semibold text-brand-dark mb-1">Photos added!</p>
        <p className="text-[13px] text-brand-dark/45">
          Your photos are now visible on the item page.
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-3 text-[13px] text-brand-accent underline underline-offset-2"
        >
          Add more
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Item selector ────────────────────────────────────────────────────── */}
      {borrowedItems.length > 1 ? (
        // Multiple active borrows: show a dropdown
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-semibold text-brand-dark/50 uppercase tracking-[0.1em]">
            Item
          </label>
          <select
            value={selectedItemId}
            onChange={e => setSelectedItemId(e.target.value)}
            className="
              w-full bg-brand-surface text-brand-dark
              rounded-xl px-4 py-3.5
              text-[14px]
              appearance-none
              outline-none
            "
          >
            {borrowedItems.map(item => (
              <option key={item.itemId} value={item.itemId}>
                {item.categoryLabel}
              </option>
            ))}
          </select>
        </div>
      ) : (
        // Single active borrow: show a static card with thumbnail
        <div className="flex items-center gap-3 rounded-xl bg-brand-surface px-4 py-3">
          {selectedItem?.forwardImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedItem.forwardImageUrl}
              alt={selectedItem.categoryLabel}
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-brand-dark/10 flex-shrink-0" />
          )}
          <div>
            <p className="text-[14px] font-semibold text-brand-dark">
              {selectedItem?.categoryLabel}
            </p>
            <p className="text-[12px] text-brand-dark/40 mt-0.5">Active borrow</p>
          </div>
        </div>
      )}

      {/* ── Photo picker ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <label className="text-[12px] font-semibold text-brand-dark/50 uppercase tracking-[0.1em]">
          Photos
        </label>

        {/* Hidden file input — triggered by the styled button below */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
          id="exp-photos"
        />

        {/* Styled "pick photos" area */}
        {previews.length === 0 ? (
          <label
            htmlFor="exp-photos"
            className="
              flex flex-col items-center justify-center
              rounded-2xl border-2 border-dashed border-brand-dark/15
              bg-brand-surface
              py-10
              cursor-pointer active:opacity-70 transition-opacity
            "
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className="text-brand-dark/30 mb-2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-[14px] text-brand-dark/40">Tap to choose photos</span>
          </label>
        ) : (
          // Preview grid with re-pick option
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {previews.map((url, i) => (
                <div key={i} className="aspect-square rounded-xl overflow-hidden bg-brand-dark/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            <label
              htmlFor="exp-photos"
              className="text-[13px] text-brand-accent text-center cursor-pointer active:opacity-70"
            >
              Choose different photos
            </label>
          </div>
        )}
      </div>

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-500 px-1" role="alert">{error}</p>
      )}

      {/* ── Upload button ─────────────────────────────────────────────────────── */}
      <button
        type="button"
        disabled={files.length === 0 || uploading}
        onClick={handleUpload}
        className="
          w-full bg-brand-accent text-white
          rounded-2xl py-[18px]
          text-base font-semibold tracking-wide
          transition-opacity duration-200
          disabled:opacity-40
          active:opacity-75
        "
      >
        {uploading ? (
          <span className="inline-flex items-center justify-center gap-2.5">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Uploading…
          </span>
        ) : (
          `Add ${files.length > 0 ? files.length : ''} photo${files.length !== 1 ? 's' : ''}`
        )}
      </button>
    </div>
  );
}
