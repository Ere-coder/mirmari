'use client';

/**
 * SeasonActions — admin controls for season status transitions.
 *
 * planning      → Mark as Ready (all sets configured)
 * pending_launch → Generate Rotation & Launch (waitlist ≥ min_users)
 * active/closed  → hidden (controlled in page.tsx)
 */

import { useState, useTransition } from 'react';
import { updateSeasonStatus, generateRotation } from './actions';
import type { SeasonStatus } from '@/lib/types-v2';

interface Props {
  seasonId:       string;
  currentStatus:  SeasonStatus;
  totalSets:      number;
  configuredSets: number;
  minUsers:       number;
  waitlistCount:  number;
}

export default function SeasonActions({
  seasonId,
  currentStatus,
  totalSets,
  configuredSets,
  minUsers,
  waitlistCount,
}: Props) {
  const [error, setError]   = useState<string | null>(null);
  const [launched, setLaunched] = useState<{ setCount: number; usersPromoted: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  const canMarkReady = currentStatus === 'planning' && totalSets > 0 && configuredSets === totalSets;

  const setsOk  = totalSets > 0 && configuredSets === totalSets;
  const usersOk = waitlistCount >= minUsers;
  const canLaunch = setsOk && usersOk;

  function handleMarkReady() {
    setError(null);
    startTransition(async () => {
      const result = await updateSeasonStatus(seasonId, 'pending_launch');
      if (!result.success) setError(result.error);
    });
  }

  function handleRevertToPlanning() {
    setError(null);
    startTransition(async () => {
      const result = await updateSeasonStatus(seasonId, 'planning');
      if (!result.success) setError(result.error);
    });
  }

  function handleGenerateRotation() {
    setError(null);
    startTransition(async () => {
      const result = await generateRotation(seasonId);
      if (!result.success) {
        setError(result.error);
      } else {
        setLaunched({ setCount: result.set_count, usersPromoted: result.users_promoted });
      }
    });
  }

  return (
    <div className="rounded-2xl bg-white border border-brand-dark/[0.06] p-4 flex flex-col gap-3">

      {/* ── Planning checklist ──────────────────────────────────────────── */}
      {currentStatus === 'planning' && (
        <>
          <div className="flex flex-col gap-2">
            <CheckItem
              done={totalSets > 0}
              label={`At least one set created (${totalSets} set${totalSets === 1 ? '' : 's'})`}
            />
            <CheckItem
              done={configuredSets === totalSets && totalSets > 0}
              label={`All sets fully configured (${configuredSets}/${totalSets})`}
            />
            <CheckItem
              done={false}
              pending
              label={`${minUsers} users subscribed — checked at launch time`}
            />
          </div>

          {error && <p className="text-[12px] text-red-500">{error}</p>}

          <button
            type="button"
            onClick={handleMarkReady}
            disabled={!canMarkReady || isPending}
            className="
              w-full bg-brand-accent text-brand-bg
              rounded-xl py-3 text-[13px] font-semibold
              disabled:opacity-40 active:opacity-80 transition-opacity
            "
          >
            {isPending ? 'Saving…' : 'Mark as Ready to Launch'}
          </button>
        </>
      )}

      {/* ── Pending launch: rotation generation ─────────────────────────── */}
      {currentStatus === 'pending_launch' && !launched && (
        <>
          <div className="flex flex-col gap-2">
            <CheckItem
              done={setsOk}
              label={`All ${totalSets} sets fully configured`}
            />
            <CheckItem
              done={usersOk}
              label={`Waitlist meets minimum: ${waitlistCount} / ${minUsers} users`}
            />
          </div>

          {!canLaunch && (
            <p className="text-[12px] text-brand-dark/40 leading-relaxed">
              {!setsOk
                ? 'Configure all outfit sets before launching.'
                : `Waiting for ${minUsers - waitlistCount} more user${minUsers - waitlistCount === 1 ? '' : 's'} to join the waitlist.`
              }
            </p>
          )}

          {error && <p className="text-[12px] text-red-500">{error}</p>}

          <button
            type="button"
            onClick={handleGenerateRotation}
            disabled={!canLaunch || isPending}
            className="
              w-full bg-brand-accent text-brand-bg
              rounded-xl py-3 text-[13px] font-semibold
              disabled:opacity-40 active:opacity-80 transition-opacity
            "
          >
            {isPending ? 'Launching…' : 'Generate Rotation & Launch'}
          </button>

          <button
            type="button"
            onClick={handleRevertToPlanning}
            disabled={isPending}
            className="
              w-full border border-brand-dark/20
              rounded-xl py-2.5 text-[13px] font-medium text-brand-dark/60
              disabled:opacity-40 active:bg-brand-surface transition-colors
            "
          >
            Revert to Planning
          </button>
        </>
      )}

      {/* ── Success state ────────────────────────────────────────────────── */}
      {currentStatus === 'pending_launch' && launched && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-green-700">Rotation launched</p>
          <p className="text-[12px] text-green-600">
            {launched.setCount} outfit set{launched.setCount === 1 ? '' : 's'} ·{' '}
            {launched.usersPromoted} user{launched.usersPromoted === 1 ? '' : 's'} promoted to active
          </p>
          <p className="text-[11px] text-green-500 mt-0.5">
            Refresh the page to see the updated season status.
          </p>
        </div>
      )}
    </div>
  );
}

function CheckItem({
  done,
  label,
  pending,
}: {
  done:     boolean;
  label:    string;
  pending?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`
        w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold
        ${done
          ? 'bg-green-100 text-green-600'
          : pending
          ? 'bg-brand-surface text-brand-dark/30'
          : 'bg-red-50 text-red-400'
        }
      `}>
        {done ? '✓' : '○'}
      </span>
      <span className={`text-[13px] ${done ? 'text-brand-dark/70' : 'text-brand-dark/40'}`}>
        {label}
      </span>
    </div>
  );
}
