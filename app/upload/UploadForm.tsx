/**
 * UploadForm — client-side form for listing a new item.
 *
 * Upload flow (unchanged):
 *   1. Insert item row → DB trigger sets credit_value automatically.
 *   2. For each image: upload to storage, get URL, insert item_images row.
 *      First image → is_forward: true. Rest → is_forward: false.
 *   3. Redirect to /home.
 *
 * NOTE: credit_value is intentionally omitted from the insert payload.
 * The database trigger (schema-phase2.sql) sets it based on category.
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import {
  ItemCategory,
  PrimarySize,
  FIT_TAGS,
  CATEGORY_LABELS,
} from '@/lib/types';

const CATEGORIES: ItemCategory[] = [
  'tank_top', 'tshirt_top', 'shirt_blouse', 'shorts', 'skirt', 'pants_jeans',
];
const SIZES: PrimarySize[] = ['XS', 'S', 'M', 'L', 'XL'];

const SECTION_LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40 mb-3';

interface Props {
  userId: string;
}

export default function UploadForm({ userId }: Props) {
  const router = useRouter();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [category, setCategory]             = useState<ItemCategory | ''>('');
  const [primarySize, setPrimarySize]       = useState<PrimarySize | ''>('');
  const [fitDescription, setFitDescription] = useState('');
  const [fitTags, setFitTags]               = useState<string[]>([]);
  const [files, setFiles]                   = useState<File[]>([]);
  const [previews, setPreviews]             = useState<string[]>([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  // Revoke object URLs on unmount to prevent memory leaks.
  useEffect(() => {
    return () => { previews.forEach(url => URL.revokeObjectURL(url)); };
  }, [previews]);

  // ── Handlers (logic unchanged) ─────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    previews.forEach(url => URL.revokeObjectURL(url));
    setFiles(selected);
    setPreviews(selected.map(f => URL.createObjectURL(f)));
  }

  function toggleFitTag(tag: string) {
    setFitTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // fit_description is now optional — only category, size, and photos are required.
    if (!category)          { setError('Please select a category.');      return; }
    if (!primarySize)       { setError('Please select a size.');          return; }
    if (files.length === 0) { setError('Please add at least one photo.'); return; }

    setLoading(true);

    // Create client inside handler — safe from SSR. See Phase 1 architecture note.
    const supabase = createClient();

    try {
      // Step 1: Insert item — credit_value is set by DB trigger, not provided here.
      // numeric_size is not collected in the UI; stored as null.
      const { data: newItem, error: itemError } = await supabase
        .from('items')
        .insert({
          owner_id:        userId,
          category,
          primary_size:    primarySize,
          numeric_size:    null,
          fit_description: fitDescription.trim() || '',
          fit_tags:        fitTags.length > 0 ? fitTags : null,
        })
        .select('id')
        .single();

      if (itemError) throw itemError;

      // Step 2: Upload each image and insert item_images rows.
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Storage path: {userId}/{itemId}/{index} — first folder = uid for RLS.
        const storagePath = `${userId}/${newItem.id}/${i}`;

        const { error: uploadError } = await supabase.storage
          .from('item-images')
          .upload(storagePath, file, { contentType: file.type });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('item-images')
          .getPublicUrl(storagePath);

        const { error: imageError } = await supabase
          .from('item_images')
          .insert({
            item_id:    newItem.id,
            owner_id:   userId,
            url:        urlData.publicUrl,
            layer:      'original',
            is_forward: i === 0, // first image = main browse image
          });

        if (imageError) throw imageError;
      }

      router.push('/home');
    } catch (err) {
      console.error('[UploadForm] upload error:', err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setError(`Upload failed: ${msg}`);
      setLoading(false);
    }
  }

  // ── Shared chip style helper ───────────────────────────────────────────────
  const chip = (selected: boolean) =>
    `px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-150 active:scale-95 ` +
    (selected ? 'bg-brand-plum text-white' : 'bg-brand-bg text-brand-dark/70');

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <motion.form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >

      {/* ── Category chips ──────────────────────────────────────────────────── */}
      <div className="bg-brand-surface rounded-2xl px-5 py-5">
        <p className={SECTION_LABEL}>Category</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={chip(category === c)}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Size chips ──────────────────────────────────────────────────────── */}
      <div className="bg-brand-surface rounded-2xl px-5 py-5">
        <p className={SECTION_LABEL}>Size</p>
        <div className="flex gap-2">
          {SIZES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setPrimarySize(s)}
              className={`flex-1 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-150 active:scale-95 ${
                primarySize === s ? 'bg-brand-plum text-white' : 'bg-brand-bg text-brand-dark/70'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Fit description (optional) ──────────────────────────────────────── */}
      <div className="bg-brand-surface rounded-2xl px-5 py-5">
        <p className={SECTION_LABEL}>
          Fit description{' '}
          <span className="normal-case tracking-normal font-normal opacity-60">(optional)</span>
        </p>
        <textarea
          id="fitDescription"
          placeholder="e.g. fits like S, oversized M, runs small in the shoulders"
          value={fitDescription}
          onChange={e => setFitDescription(e.target.value)}
          rows={3}
          className="w-full bg-transparent focus:outline-none resize-none text-[15px] text-brand-dark placeholder:text-brand-dark/35 leading-relaxed"
        />
      </div>

      {/* ── Fit tags ────────────────────────────────────────────────────────── */}
      {/* Selected state uses brand-plum (#7B5EA7) per design system */}
      <div className="bg-brand-surface rounded-2xl px-5 py-5">
        <p className={SECTION_LABEL}>
          Fit tags{' '}
          <span className="normal-case tracking-normal font-normal opacity-60">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {FIT_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleFitTag(tag)}
              className={chip(fitTags.includes(tag))}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* ── Photo upload ─────────────────────────────────────────────────────── */}
      {/* First image → is_forward: true (main browse image).
          Remaining  → is_forward: false (deep images on swipe-right). */}
      {previews.length > 0 ? (
        <div className="bg-brand-surface rounded-2xl px-4 py-4">
          <p className={SECTION_LABEL}>Photos</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {previews.map((src, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden">
                <img
                  src={src}
                  alt={`Photo ${i + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                {i === 0 && (
                  <span className="
                    absolute bottom-1.5 left-1.5 right-1.5 text-center
                    text-[9px] font-semibold uppercase tracking-wide
                    bg-brand-dark/55 text-white rounded-lg py-1
                  ">
                    Main
                  </span>
                )}
              </div>
            ))}
          </div>
          <label className="flex justify-center cursor-pointer py-1 active:opacity-60 transition-opacity">
            <span className="text-sm text-brand-accent font-medium">Change photos</span>
            <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
          </label>
        </div>
      ) : (
        <label className="block bg-brand-surface rounded-2xl cursor-pointer active:opacity-75 transition-opacity">
          <div className="flex flex-col items-center gap-3 px-5 py-12">
            <div className="w-14 h-14 rounded-full bg-brand-bg flex items-center justify-center">
              <svg
                width="24" height="24" viewBox="0 0 24 24"
                fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="text-brand-dark/40"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-[15px] font-medium text-brand-dark">Tap to add photos</p>
              <p className="text-[13px] text-brand-dark/40 mt-1">First photo will be shown in browse</p>
            </div>
          </div>
          <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        </label>
      )}

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-500 px-1" role="alert">{error}</p>
      )}

      {/* ── Submit ──────────────────────────────────────────────────────────── */}
      <div className="pt-3 pb-2">
        <button
          type="submit"
          disabled={loading}
          className="
            w-full bg-brand-accent text-white
            rounded-2xl py-[18px]
            text-base font-semibold tracking-wide
            transition-opacity duration-200
            disabled:opacity-50
            active:opacity-75
          "
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2.5">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Uploading…
            </span>
          ) : (
            'List item'
          )}
        </button>
      </div>
    </motion.form>
  );
}
