/**
 * ReportForm — client component for submitting a damage report.
 *
 * Spec §DAMAGE REPORTING SYSTEM:
 * - Available to confirmed borrowers (borrow.status = 'active').
 * - Required: text description of the damage.
 * - Optional: up to 6 photos uploaded to storage at {userId}/{itemId}/dmg/{timestamp}_{i}.
 * - Calls submit_damage_report RPC (atomic: creates damage_report row + condition images
 *   + admin support chat + system message).
 * - On success, navigates to /chat/[adminChatId] (the MirMari Support chat).
 *
 * Connects to: submit_damage_report(p_borrow_id, p_reporter_id, p_description, p_image_urls) RPC.
 */
'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SubmitDamageReportResult } from '@/lib/types';
// Phase 8 §PUSH NOTIFICATIONS
import { notifyAdminsOfDamageReport } from './actions';

interface Props {
  borrowId: string;
  itemId:   string;
  userId:   string;
}

const MAX_IMAGES = 6;

export default function ReportForm({ borrowId, itemId, userId }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState('');
  const [files, setFiles]             = useState<File[]>([]);
  const [previews, setPreviews]       = useState<string[]>([]);
  const [uploading, setUploading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const combined = [...files, ...selected].slice(0, MAX_IMAGES);
    setFiles(combined);
    // Revoke old previews to avoid memory leaks
    previews.forEach(URL.revokeObjectURL);
    setPreviews(combined.map(f => URL.createObjectURL(f)));
    // Reset input so the same file can be re-added if removed
    e.target.value = '';
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(previews[index]);
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please describe the damage before submitting.');
      return;
    }

    setError(null);
    setUploading(true);

    const supabase = createClient();

    try {
      // ── Upload images to storage ────────────────────────────────────────────
      const timestamp  = Date.now();
      const imageUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `${userId}/${itemId}/dmg/${timestamp}_${i}`;
        const { error: uploadError } = await supabase.storage
          .from('item-images')
          .upload(path, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('item-images')
          .getPublicUrl(path);

        imageUrls.push(publicUrl);
      }

      // ── Call submit_damage_report RPC ──────────────────────────────────────
      const { data, error: rpcError } = await supabase.rpc('submit_damage_report', {
        p_borrow_id:   borrowId,
        p_reporter_id: userId,
        p_description: description.trim(),
        p_image_urls:  imageUrls,
      });

      if (rpcError) throw rpcError;

      const result = data as SubmitDamageReportResult;

      if (result.success) {
        // Phase 8 §PUSH NOTIFICATIONS: notify all admins about the damage report.
        // Fire-and-forget — notification failure must not block navigation.
        notifyAdminsOfDamageReport({ itemId }).catch(() => {});

        // Navigate to the MirMari Support chat
        router.push(`/chat/${result.admin_chat_id}`);
      } else {
        const messages: Record<string, string> = {
          unauthorized:    'Something went wrong. Please try again.',
          borrow_not_found:'Borrow record not found.',
          not_participant: 'You are not a participant in this borrow.',
          already_reported:'A damage report has already been submitted for this borrow.',
          admin_not_found: 'Could not reach support. Please try again later.',
        };
        setError(messages[result.reason] ?? 'Something went wrong.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setUploading(false);
    }
  }

  const canSubmit = description.trim().length > 0 && !uploading;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-brand-dark/45 uppercase tracking-wide">
          Describe the damage
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          placeholder="What happened? When did you notice it?"
          className="
            w-full rounded-2xl bg-brand-surface px-4 py-3.5
            text-[14px] text-brand-dark placeholder:text-brand-dark/30
            resize-none outline-none
            focus:ring-1 focus:ring-brand-accent/40
          "
          disabled={uploading}
        />
      </div>

      {/* Image upload */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-[12px] font-medium text-brand-dark/45 uppercase tracking-wide">
            Photos
          </label>
          <span className="text-[11px] text-brand-dark/30">
            {files.length}/{MAX_IMAGES}
          </span>
        </div>

        {/* Preview grid */}
        {previews.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-brand-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Damage photo ${i + 1}`} className="w-full h-full object-cover" />
                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  disabled={uploading}
                  className="
                    absolute top-1 right-1
                    w-5 h-5 rounded-full
                    bg-black/50 text-white
                    flex items-center justify-center
                    text-[11px] font-bold
                    active:opacity-70
                  "
                  aria-label={`Remove photo ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add photos button */}
        {files.length < MAX_IMAGES && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="
                w-full rounded-2xl bg-brand-surface
                py-4 text-[14px] font-medium text-brand-dark/55
                border-2 border-dashed border-brand-dark/15
                active:bg-brand-dark/5 transition-colors
                disabled:opacity-40
              "
            >
              Add photos
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-500 px-1" role="alert">{error}</p>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="
          w-full bg-red-500 text-white
          rounded-2xl py-4
          text-[15px] font-semibold
          transition-opacity duration-200
          disabled:opacity-40
          active:opacity-75
        "
      >
        {uploading ? (
          <span className="inline-flex items-center justify-center gap-2.5">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Submitting…
          </span>
        ) : (
          'Submit report'
        )}
      </button>

      <p className="text-[11px] text-brand-dark/30 text-center leading-relaxed px-2">
        Our team will review your report and follow up in the support chat.
      </p>
    </form>
  );
}
