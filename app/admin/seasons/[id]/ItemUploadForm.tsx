'use client';

/**
 * ItemUploadForm — admin outfit item upload.
 *
 * Client component: handles file selection, uploads image to the
 * `outfit-images` Supabase storage bucket, then calls the createOutfitItem
 * server action with the resulting URL.
 */

import { useState, useRef } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { createOutfitItem, deleteOutfitItem } from './actions';
import { OUTFIT_ITEM_CATEGORY_LABELS } from '@/lib/types-v2';
import type { OutfitItemCategory, OutfitItemWithImages } from '@/lib/types-v2';

const CATEGORIES = Object.entries(OUTFIT_ITEM_CATEGORY_LABELS) as [OutfitItemCategory, string][];
const SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;

interface Props {
  seasonId: string;
  existingItems: OutfitItemWithImages[];
}

export default function ItemUploadForm({ seasonId, existingItems }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName]           = useState('');
  const [category, setCategory]   = useState<OutfitItemCategory | ''>('');
  const [size, setSize]           = useState('');
  const [alsoFits, setAlsoFits]   = useState<string[]>([]);
  const [color, setColor]         = useState('');
  const [brand, setBrand]         = useState('');
  const [desc, setDesc]           = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  async function handleDelete(itemId: string, itemName: string) {
    if (!confirm(`Delete "${itemName}"? This can't be undone.`)) return;
    const result = await deleteOutfitItem(itemId, seasonId);
    if (!result.success) alert(`Delete failed: ${result.error}`);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function resetForm() {
    setName(''); setCategory(''); setSize(''); setAlsoFits([]); setColor('');
    setBrand(''); setDesc(''); setImageFile(null); setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = '';
    setError(null);
  }

  function toggleAlsoFits(s: string) {
    setAlsoFits(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!category) { setError('Select a category.'); return; }
    if (!size)     { setError('Select a size.'); return; }
    if (!imageFile){ setError('Upload a photo.'); return; }

    setLoading(true);

    // ── Upload image to storage ──────────────────────────────────────────
    const supabase = createClient();
    const ext  = imageFile.name.split('.').pop() ?? 'jpg';
    const path = `${seasonId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('outfit-images')
      .upload(path, imageFile, { contentType: imageFile.type });

    if (uploadErr || !uploadData) {
      setError(`Image upload failed: ${uploadErr?.message ?? 'unknown error'}`);
      setLoading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('outfit-images')
      .getPublicUrl(uploadData.path);

    // ── Create item row ───────────────────────────────────────────────────
    const result = await createOutfitItem(
      seasonId,
      { name, category: category as string, size, alsoFits, color, brand, description: desc },
      publicUrl
    );

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    resetForm();
    setOpen(false);
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Existing items ─────────────────────────────────────────────── */}
      {existingItems.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {existingItems.map(item => {
            const primaryImg = item.outfit_item_images?.find(i => i.is_primary) ?? item.outfit_item_images?.[0];
            return (
              <div
                key={item.id}
                className="relative rounded-xl overflow-hidden border border-brand-dark/[0.06] bg-white"
              >
                <button
                  type="button"
                  onClick={() => handleDelete(item.id, item.name)}
                  aria-label={`Delete ${item.name}`}
                  className="
                    absolute top-1.5 right-1.5 z-10
                    w-6 h-6 rounded-full
                    bg-black/55 text-white text-[14px] leading-none
                    flex items-center justify-center
                    active:bg-black/75
                  "
                >
                  ×
                </button>
                {primaryImg ? (
                  <div className="relative w-full aspect-[3/4]">
                    <Image
                      src={primaryImg.url}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="120px"
                    />
                  </div>
                ) : (
                  <div className="w-full aspect-[3/4] bg-brand-surface flex items-center justify-center">
                    <span className="text-brand-dark/20 text-[11px]">No photo</span>
                  </div>
                )}
                <div className="px-2 py-2">
                  <p className="text-[11px] font-semibold text-brand-dark truncate">{item.name}</p>
                  <p className="text-[10px] text-brand-dark/45 mt-0.5">
                    {OUTFIT_ITEM_CATEGORY_LABELS[item.category as OutfitItemCategory]} · {item.size}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Upload form toggle ────────────────────────────────────────── */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="
            w-full rounded-2xl border-2 border-dashed border-brand-dark/15
            py-4 text-[13px] font-medium text-brand-dark/50
            active:bg-brand-surface transition-colors
          "
        >
          + Add outfit item
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white border border-brand-dark/[0.06] p-4 flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-brand-dark">New item</p>
            <button
              type="button"
              onClick={() => { setOpen(false); resetForm(); }}
              className="text-brand-dark/35 text-[13px] active:text-brand-dark/60"
            >
              Cancel
            </button>
          </div>

          {/* Image upload */}
          <div
            className="
              relative w-full aspect-video rounded-xl
              border-2 border-dashed border-brand-dark/15
              bg-brand-surface flex items-center justify-center
              cursor-pointer overflow-hidden
            "
            onClick={() => fileRef.current?.click()}
          >
            {previewUrl ? (
              <Image src={previewUrl} alt="preview" fill className="object-cover" />
            ) : (
              <p className="text-[12px] text-brand-dark/40">Tap to add photo</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Name */}
          <input
            type="text"
            placeholder="Item name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className={inputCls}
          />

          {/* Category */}
          <select
            value={category}
            onChange={e => setCategory(e.target.value as OutfitItemCategory)}
            className={inputCls}
            required
          >
            <option value="" disabled>Category</option>
            {CATEGORIES.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          {/* Size */}
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-medium text-brand-dark">Size purchased</p>
            <div className="flex gap-2">
              {SIZES.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`
                    flex-1 py-2.5 rounded-xl border text-[12px] font-medium transition-all
                    ${size === s
                      ? 'bg-brand-accent text-brand-bg border-brand-accent'
                      : 'bg-white text-brand-dark border-brand-dark/15'}
                  `}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Also fits */}
          {size && (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] font-medium text-brand-dark">
                Also fits
                <span className="font-normal text-brand-dark/40 ml-1">— optional, for flexible pieces</span>
              </p>
              <div className="flex gap-2 flex-wrap">
                {SIZES.filter(s => s !== size).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleAlsoFits(s)}
                    className={`
                      px-3 py-2 rounded-xl border text-[12px] font-medium transition-all
                      ${alsoFits.includes(s)
                        ? 'bg-brand-dark text-brand-bg border-brand-dark'
                        : 'bg-white text-brand-dark border-brand-dark/15'}
                    `}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color */}
          <input
            type="text"
            placeholder="Color"
            value={color}
            onChange={e => setColor(e.target.value)}
            required
            className={inputCls}
          />

          {/* Brand (optional) */}
          <input
            type="text"
            placeholder="Brand (optional)"
            value={brand}
            onChange={e => setBrand(e.target.value)}
            className={inputCls}
          />

          {/* Description (optional) */}
          <textarea
            placeholder="Description (optional)"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
          />

          {error && (
            <p className="text-[12px] text-red-500" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="
              w-full bg-brand-accent text-brand-bg
              rounded-xl py-3 text-[13px] font-semibold
              disabled:opacity-60 active:opacity-80 transition-opacity
            "
          >
            {loading ? 'Saving…' : 'Save item'}
          </button>
        </form>
      )}
    </div>
  );
}

const inputCls = `
  w-full rounded-xl border border-brand-dark/15
  bg-white px-3.5 py-3
  text-[14px] text-brand-dark placeholder:text-brand-dark/35
  focus:outline-none focus:ring-2 focus:ring-brand-accent/40
  transition-shadow
`;
