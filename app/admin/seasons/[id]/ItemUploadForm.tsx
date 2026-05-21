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
import { createOutfitItem, deleteOutfitItem, assignItemToOutfit, renameOutfitItem } from './actions';
import { OUTFIT_ITEM_CATEGORY_LABELS } from '@/lib/types-v2';
import type { OutfitItemCategory, OutfitItemWithImages } from '@/lib/types-v2';

const CATEGORIES = Object.entries(OUTFIT_ITEM_CATEGORY_LABELS) as [OutfitItemCategory, string][];
const SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;

interface Props {
  seasonId: string;
  existingItems?: OutfitItemWithImages[];
  // Embedded mode (used from inside a slot): no items grid, no toggle —
  // the form is always shown and onDone closes it from the parent.
  embedded?: boolean;
  // If set, after the item is created it's also assigned to this outfit.
  outfitId?: string;
  onDone?: () => void;
}

export default function ItemUploadForm({
  seasonId,
  existingItems,
  embedded = false,
  outfitId,
  onDone,
}: Props) {
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
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  async function handleDelete(itemId: string, itemName: string) {
    if (!confirm(`Delete "${itemName}"? This can't be undone.`)) return;
    const result = await deleteOutfitItem(itemId, seasonId);
    if (!result.success) alert(`Delete failed: ${result.error}`);
  }

  function startRename(itemId: string, currentName: string) {
    setRenamingId(itemId);
    setRenameValue(currentName);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  async function saveRename(itemId: string) {
    if (!renameValue.trim()) return;
    setRenameSaving(true);
    const result = await renameOutfitItem(itemId, renameValue, seasonId);
    setRenameSaving(false);
    if (!result.success) {
      alert(`Rename failed: ${result.error}`);
      return;
    }
    setRenamingId(null);
    setRenameValue('');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setImageFiles(prev => [...prev, ...files]);
    setPreviewUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function removeImage(idx: number) {
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviewUrls(prev => {
      const url = prev[idx];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function resetForm() {
    setName(''); setCategory(''); setSize(''); setAlsoFits([]); setColor('');
    setBrand(''); setDesc('');
    previewUrls.forEach(URL.revokeObjectURL);
    setImageFiles([]); setPreviewUrls([]);
    if (fileRef.current) fileRef.current.value = '';
    setError(null);
  }

  function toggleAlsoFits(s: string) {
    setAlsoFits(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!category)               { setError('Select a category.'); return; }
    if (!size)                   { setError('Select a size.'); return; }
    if (imageFiles.length === 0) { setError('Upload at least one photo.'); return; }

    setLoading(true);

    // ── Upload all images to storage ─────────────────────────────────────
    const supabase = createClient();
    const publicUrls: string[] = [];

    for (const file of imageFiles) {
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `${seasonId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('outfit-images')
        .upload(path, file, { contentType: file.type });

      if (uploadErr || !uploadData) {
        setError(`Image upload failed: ${uploadErr?.message ?? 'unknown error'}`);
        setLoading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('outfit-images')
        .getPublicUrl(uploadData.path);
      publicUrls.push(publicUrl);
    }

    // ── Create item row ───────────────────────────────────────────────────
    const result = await createOutfitItem(
      seasonId,
      { name, category: category as string, size, alsoFits, color, brand, description: desc },
      publicUrls
    );

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // If launched from a slot, also assign the new item to that outfit
    if (outfitId && result.itemId) {
      const assignResult = await assignItemToOutfit(outfitId, result.itemId, seasonId);
      if (!assignResult.success) {
        setError(`Item created but assignment failed: ${assignResult.error}`);
        setLoading(false);
        return;
      }
    }

    resetForm();
    setOpen(false);
    setLoading(false);
    if (embedded) onDone?.();
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Existing items ─────────────────────────────────────────────── */}
      {!embedded && existingItems && existingItems.length > 0 && (
        <div className="flex flex-col gap-3">
          {existingItems.map(item => {
            const images = item.outfit_item_images ?? [];
            const sortedImages = [...images].sort((a, b) =>
              (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)
            );
            const isRenaming = renamingId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-brand-dark/[0.06] bg-white overflow-hidden"
              >
                {/* Header: name + actions */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  {isRenaming ? (
                    <>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); saveRename(item.id); }
                          else if (e.key === 'Escape') cancelRename();
                        }}
                        autoFocus
                        className="
                          flex-1 min-w-0 rounded-lg border border-brand-dark/15
                          bg-white px-2.5 py-1.5 text-[13px] text-brand-dark
                          focus:outline-none focus:ring-2 focus:ring-brand-accent/40
                        "
                      />
                      <button
                        type="button"
                        onClick={() => saveRename(item.id)}
                        disabled={renameSaving || !renameValue.trim()}
                        className="
                          text-[12px] font-semibold text-brand-accent
                          disabled:opacity-40 active:opacity-70
                        "
                      >
                        {renameSaving ? '…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        className="text-[12px] text-brand-dark/40 active:text-brand-dark/60"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="flex-1 min-w-0 text-[13px] font-semibold text-brand-dark truncate">
                        {item.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => startRename(item.id, item.name)}
                        aria-label={`Rename ${item.name}`}
                        className="
                          shrink-0 w-7 h-7 rounded-full
                          bg-brand-surface text-brand-dark/60 text-[12px]
                          flex items-center justify-center
                          active:bg-brand-dark/10
                        "
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id, item.name)}
                        aria-label={`Delete ${item.name}`}
                        className="
                          shrink-0 w-7 h-7 rounded-full
                          bg-black/55 text-white text-[14px] leading-none
                          flex items-center justify-center
                          active:bg-black/75
                        "
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>

                {/* Photos: horizontal scroll, primary first */}
                {sortedImages.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto px-3 pb-3">
                    {sortedImages.map(img => (
                      <div
                        key={img.id}
                        className="relative shrink-0 w-20 aspect-[3/4] rounded-lg overflow-hidden bg-brand-surface"
                      >
                        <Image
                          src={img.url}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                        {img.is_primary && (
                          <span className="absolute bottom-1 left-1 text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-black/55 text-white">
                            Cover
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 pb-3 text-[11px] text-brand-dark/30">No photos</div>
                )}

                {/* Meta */}
                <div className="border-t border-brand-dark/[0.04] px-3 py-2">
                  <p className="text-[11px] text-brand-dark/50">
                    {OUTFIT_ITEM_CATEGORY_LABELS[item.category as OutfitItemCategory]} · {item.size}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Upload form toggle ────────────────────────────────────────── */}
      {!embedded && !open ? (
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
              onClick={() => {
                resetForm();
                if (embedded) onDone?.();
                else setOpen(false);
              }}
              className="text-brand-dark/35 text-[13px] active:text-brand-dark/60"
            >
              Cancel
            </button>
          </div>

          {/* Image upload — first image is the primary/cover */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              {previewUrls.map((url, idx) => (
                <div
                  key={url}
                  className="relative aspect-square rounded-xl overflow-hidden bg-brand-surface"
                >
                  <Image src={url} alt={`preview ${idx + 1}`} fill className="object-cover" />
                  {idx === 0 && (
                    <span className="absolute bottom-1 left-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/55 text-white">
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    aria-label={`Remove image ${idx + 1}`}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 text-white text-[12px] leading-none flex items-center justify-center active:bg-black/75"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="
                  aspect-square rounded-xl
                  border-2 border-dashed border-brand-dark/15
                  bg-brand-surface text-[11px] text-brand-dark/40
                  active:bg-brand-surface/70 transition-colors
                "
              >
                {previewUrls.length === 0 ? 'Tap to add photos' : '+ Add more'}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
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
