'use client';

/**
 * SetBuilderForm — admin outfit set configuration.
 *
 * Allows the admin to:
 *   1. Create a new outfit set (A–O) for this season
 *   2. Expand a set to view and configure its 3 outfit slots
 *   3. Assign / remove items from each slot
 */

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { createOutfitSet, assignItemToOutfit, removeItemFromOutfit } from './actions';
import { ALL_SET_CODES, OUTFIT_ITEM_CATEGORY_LABELS, SLOT_LABELS } from '@/lib/types-v2';
import type {
  OutfitItemCategory,
  OutfitItemWithImages,
  OutfitSetWithOutfits,
} from '@/lib/types-v2';
import ItemUploadForm from './ItemUploadForm';

interface Props {
  seasonId: string;
  seasonItems: OutfitItemWithImages[];
  sets: OutfitSetWithOutfits[];
}

export default function SetBuilderForm({ seasonId, seasonItems, sets }: Props) {
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<1 | 2 | 3>(1);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showUploadInSlot, setShowUploadInSlot] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const usedCodes = new Set(sets.map(s => s.code));
  const availableCodes = ALL_SET_CODES.filter(c => !usedCodes.has(c));

  // ── Helpers ────────────────────────────────────────────────────────────────

  const expandedSet = sets.find(s => s.id === expandedSetId) ?? null;

  const activeOutfit = expandedSet?.outfits
    ?.sort((a, b) => a.slot - b.slot)
    .find(o => o.slot === activeSlot) ?? null;

  const assignedItemIds = new Set(
    (activeOutfit?.outfit_composition ?? []).map(c => c.outfit_items?.id).filter(Boolean)
  );

  const unassignedItems = seasonItems.filter(i => !assignedItemIds.has(i.id));

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleCreateSet() {
    if (!newCode) return;
    setActionError(null);
    startTransition(async () => {
      const result = await createOutfitSet(seasonId, newCode);
      if (!result.success) { setActionError(result.error); return; }
      setShowCreateForm(false);
      setNewCode('');
    });
  }

  function handleAssign(itemId: string) {
    if (!activeOutfit) return;
    setActionError(null);
    startTransition(async () => {
      const result = await assignItemToOutfit(activeOutfit.id, itemId, seasonId);
      if (!result.success) setActionError(result.error);
    });
  }

  function handleRemove(itemId: string) {
    if (!activeOutfit) return;
    setActionError(null);
    startTransition(async () => {
      const result = await removeItemFromOutfit(activeOutfit.id, itemId, seasonId);
      if (!result.success) setActionError(result.error);
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">

      {/* ── Existing sets ─────────────────────────────────────────────────── */}
      {sets.map(set => {
        const isExpanded = expandedSetId === set.id;
        const totalSlots = 3;
        const configuredSlots = (set.outfits ?? []).filter(
          o => (o.outfit_composition ?? []).length > 0
        ).length;

        return (
          <div
            key={set.id}
            className="rounded-2xl bg-white border border-brand-dark/[0.06] overflow-hidden"
          >
            {/* Set header */}
            <button
              type="button"
              onClick={() => {
                setExpandedSetId(isExpanded ? null : set.id);
                setActiveSlot(1);
                setShowItemPicker(false);
                setActionError(null);
              }}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-brand-surface"
            >
              <div className="flex items-center gap-3">
                <span className="
                  w-8 h-8 rounded-full bg-brand-plum/10 text-brand-plum
                  flex items-center justify-center
                  text-[14px] font-bold
                ">
                  {set.code}
                </span>
                <div className="text-left">
                  <p className="text-[14px] font-semibold text-brand-dark">Set {set.code}</p>
                  <p className="text-[11px] text-brand-dark/40 mt-0.5">
                    {configuredSlots}/{totalSlots} outfits configured
                  </p>
                </div>
              </div>
              <span className="text-brand-dark/30 text-[16px]">{isExpanded ? '−' : '+'}</span>
            </button>

            {/* Expanded set detail */}
            {isExpanded && (
              <div className="border-t border-brand-dark/[0.05]">
                {/* Slot tabs */}
                <div className="flex border-b border-brand-dark/[0.05]">
                  {([1, 2, 3] as const).map(slot => {
                    const outfit = set.outfits?.find(o => o.slot === slot);
                    const count  = (outfit?.outfit_composition ?? []).length;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => { setActiveSlot(slot); setShowItemPicker(false); }}
                        className={`
                          flex-1 py-2.5 text-[11px] font-semibold transition-colors
                          ${activeSlot === slot
                            ? 'text-brand-accent border-b-2 border-brand-accent bg-brand-surface/50'
                            : 'text-brand-dark/40'
                          }
                        `}
                      >
                        {slot === 1 ? 'Mon–Tue' : slot === 2 ? 'Wed–Thu' : 'Fri–Sat'}
                        {count > 0 && (
                          <span className="ml-1 text-[10px] opacity-70">({count})</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Slot content */}
                <div className="p-4 flex flex-col gap-3">
                  <p className="text-[11px] text-brand-dark/40">{SLOT_LABELS[activeSlot]}</p>

                  {/* Assigned items */}
                  {(activeOutfit?.outfit_composition ?? []).map(comp => {
                    const item = comp.outfit_items;
                    if (!item) return null;
                    const img = item.outfit_item_images?.find(i => i.is_primary) ?? item.outfit_item_images?.[0];
                    return (
                      <div
                        key={comp.id}
                        className="flex items-center gap-3 rounded-xl bg-brand-surface px-3 py-2.5"
                      >
                        {img && (
                          <div className="relative w-9 h-12 rounded-lg overflow-hidden shrink-0">
                            <Image src={img.url} alt={item.name} fill className="object-cover" sizes="36px" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-brand-dark truncate">{item.name}</p>
                          <p className="text-[11px] text-brand-dark/45">
                            {OUTFIT_ITEM_CATEGORY_LABELS[item.category as OutfitItemCategory]} · {item.size}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemove(item.id)}
                          disabled={isPending}
                          className="text-brand-dark/30 text-[18px] active:text-red-400 disabled:opacity-40"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}

                  {/* Inline upload form — creates item + auto-assigns to this slot */}
                  {showUploadInSlot && activeOutfit && (
                    <ItemUploadForm
                      seasonId={seasonId}
                      embedded
                      outfitId={activeOutfit.id}
                      onDone={() => setShowUploadInSlot(false)}
                    />
                  )}

                  {/* Add items */}
                  {!showUploadInSlot && !showItemPicker && (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setShowUploadInSlot(true)}
                        disabled={isPending}
                        className="
                          w-full rounded-xl border border-dashed border-brand-dark/20
                          py-2.5 text-[12px] font-medium text-brand-dark/50
                          active:bg-brand-surface disabled:opacity-40 transition-colors
                        "
                      >
                        + Upload new item
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowItemPicker(true)}
                        disabled={isPending || seasonItems.length === 0}
                        className="
                          w-full rounded-xl border border-dashed border-brand-dark/20
                          py-2.5 text-[12px] font-medium text-brand-dark/50
                          active:bg-brand-surface disabled:opacity-40 transition-colors
                        "
                      >
                        {seasonItems.length === 0
                          ? 'No existing season items yet'
                          : '+ Pick from season items'
                        }
                      </button>
                    </div>
                  )}
                  {showItemPicker && (
                    <div className="rounded-xl border border-brand-dark/[0.08] overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-brand-surface border-b border-brand-dark/[0.06]">
                        <p className="text-[12px] font-semibold text-brand-dark">Season items</p>
                        <button
                          type="button"
                          onClick={() => setShowItemPicker(false)}
                          className="text-[12px] text-brand-dark/40 active:text-brand-dark/70"
                        >
                          Done
                        </button>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {unassignedItems.length === 0 ? (
                          <p className="px-3 py-4 text-[12px] text-brand-dark/40 text-center">
                            All items are assigned to this outfit.
                          </p>
                        ) : (
                          unassignedItems.map(item => {
                            const img = item.outfit_item_images?.find(i => i.is_primary) ?? item.outfit_item_images?.[0];
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleAssign(item.id)}
                                disabled={isPending}
                                className="
                                  w-full flex items-center gap-3 px-3 py-2.5
                                  border-b border-brand-dark/[0.04] last:border-0
                                  active:bg-brand-surface disabled:opacity-40 transition-colors
                                "
                              >
                                {img ? (
                                  <div className="relative w-8 h-10 rounded-lg overflow-hidden shrink-0">
                                    <Image src={img.url} alt={item.name} fill className="object-cover" sizes="32px" />
                                  </div>
                                ) : (
                                  <div className="w-8 h-10 rounded-lg bg-brand-surface shrink-0" />
                                )}
                                <div className="flex-1 text-left min-w-0">
                                  <p className="text-[13px] font-medium text-brand-dark truncate">{item.name}</p>
                                  <p className="text-[11px] text-brand-dark/45">
                                    {OUTFIT_ITEM_CATEGORY_LABELS[item.category as OutfitItemCategory]} · {item.size}
                                  </p>
                                </div>
                                <span className="text-brand-accent text-[13px] font-semibold shrink-0">+</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Create set ────────────────────────────────────────────────────── */}
      {availableCodes.length > 0 && !showCreateForm && (
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="
            w-full rounded-2xl border-2 border-dashed border-brand-dark/15
            py-4 text-[13px] font-medium text-brand-dark/50
            active:bg-brand-surface transition-colors
          "
        >
          + New outfit set
        </button>
      )}

      {showCreateForm && (
        <div className="rounded-2xl bg-white border border-brand-dark/[0.06] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-brand-dark">New set</p>
            <button
              type="button"
              onClick={() => { setShowCreateForm(false); setNewCode(''); setActionError(null); }}
              className="text-[13px] text-brand-dark/35 active:text-brand-dark/60"
            >
              Cancel
            </button>
          </div>

          <div>
            <label className="text-[12px] font-medium text-brand-dark/60 mb-2 block">
              Set code
            </label>
            <div className="flex flex-wrap gap-2">
              {availableCodes.map(code => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setNewCode(code)}
                  className={`
                    w-10 h-10 rounded-xl border text-[14px] font-bold transition-all
                    ${newCode === code
                      ? 'bg-brand-plum text-white border-brand-plum'
                      : 'bg-white text-brand-dark border-brand-dark/15'}
                  `}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          {actionError && (
            <p className="text-[12px] text-red-500">{actionError}</p>
          )}

          <button
            type="button"
            onClick={handleCreateSet}
            disabled={!newCode || isPending}
            className="
              w-full bg-brand-accent text-brand-bg
              rounded-xl py-3 text-[13px] font-semibold
              disabled:opacity-60 active:opacity-80 transition-opacity
            "
          >
            {isPending ? 'Creating…' : `Create Set ${newCode || '—'}`}
          </button>
        </div>
      )}

      {availableCodes.length === 0 && sets.length > 0 && (
        <p className="text-[12px] text-brand-dark/35 text-center py-2">
          All 15 set codes are in use.
        </p>
      )}
    </div>
  );
}
