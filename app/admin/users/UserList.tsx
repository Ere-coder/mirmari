'use client';

import { useState, useTransition } from 'react';
import { updateSubscriptionStatus, createSubscriptionForUser } from './actions';
import type { UserWithSub } from './page';
import type { SubscriptionStatus } from '@/lib/types-v2';

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active:     'Active',
  waitlisted: 'Waitlisted',
  paused:     'Paused',
  cancelled:  'Cancelled',
};

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  active:     'bg-green-50 text-green-700',
  waitlisted: 'bg-yellow-50 text-yellow-700',
  paused:     'bg-brand-surface text-brand-dark/60',
  cancelled:  'bg-red-50 text-red-500',
};

const STATUS_ACTIONS: { from: SubscriptionStatus | null; to: SubscriptionStatus; label: string }[] = [
  { from: null,        to: 'waitlisted', label: 'Add to waitlist'  },
  { from: 'waitlisted', to: 'active',   label: 'Activate'         },
  { from: 'active',    to: 'paused',    label: 'Pause'             },
  { from: 'active',    to: 'cancelled', label: 'Cancel'            },
  { from: 'paused',    to: 'active',    label: 'Reactivate'        },
  { from: 'paused',    to: 'cancelled', label: 'Cancel'            },
  { from: 'cancelled', to: 'waitlisted', label: 'Re-add to waitlist'},
];

export default function UserList({ users }: { users: UserWithSub[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAction(userId: string, currentStatus: SubscriptionStatus | null, targetStatus: SubscriptionStatus) {
    setError(null);
    startTransition(async () => {
      const result = currentStatus === null
        ? await createSubscriptionForUser(userId)
        : await updateSubscriptionStatus(userId, targetStatus);
      if (!result.success) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-[12px] text-red-500 px-1">{error}</p>
      )}

      {users.map(u => {
        const isExpanded = expandedId === u.id;
        const sub = u.subscription;
        const currentStatus = sub?.status ?? null;
        const name = u.display_name ?? u.phone;

        // Which actions are available for this user's current status?
        const availableActions = STATUS_ACTIONS.filter(a => a.from === currentStatus);

        return (
          <div
            key={u.id}
            className="rounded-2xl bg-white border border-brand-dark/[0.06] overflow-hidden"
          >
            {/* Row */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : u.id)}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-brand-surface"
            >
              <div className="text-left flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-brand-dark truncate">
                  {name}
                  {u.is_admin && (
                    <span className="ml-2 text-[10px] font-medium text-brand-plum bg-brand-plum/10 px-1.5 py-0.5 rounded-full">
                      admin
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-brand-dark/40 mt-0.5">
                  {[u.size_preference, u.delivery_zone].filter(Boolean).join(' · ')}
                </p>
              </div>

              {sub ? (
                <span className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full ml-3 ${STATUS_COLORS[sub.status]}`}>
                  {STATUS_LABEL[sub.status]}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-brand-dark/25 ml-3">no sub</span>
              )}
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-brand-dark/[0.05] px-4 py-3 flex flex-col gap-3">

                {/* User details */}
                <div className="flex flex-col gap-1">
                  <Detail label="Phone"    value={u.phone} />
                  <Detail label="Zone"     value={u.delivery_zone ?? '—'} />
                  <Detail label="Size"     value={u.size_preference ?? '—'} />
                  {sub?.started_at && (
                    <Detail
                      label="Since"
                      value={new Date(sub.started_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    />
                  )}
                  {sub?.billing_anchor_day && (
                    <Detail label="Billing day" value={`${sub.billing_anchor_day}th`} />
                  )}
                  {sub?.notes && (
                    <Detail label="Notes" value={sub.notes} />
                  )}
                </div>

                {/* Status actions */}
                {availableActions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {availableActions.map(action => (
                      <button
                        key={action.to}
                        type="button"
                        onClick={() => handleAction(u.id, currentStatus, action.to)}
                        disabled={isPending}
                        className={`
                          px-3.5 py-2 rounded-xl text-[12px] font-semibold
                          disabled:opacity-40 active:opacity-70 transition-opacity
                          ${action.to === 'active'
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : action.to === 'cancelled'
                            ? 'bg-red-50 text-red-500 border border-red-200'
                            : 'bg-brand-surface text-brand-dark/60 border border-brand-dark/10'
                          }
                        `}
                      >
                        {isPending ? '…' : action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] text-brand-dark/35 w-20 shrink-0">{label}</span>
      <span className="text-[13px] text-brand-dark/70">{value}</span>
    </div>
  );
}
