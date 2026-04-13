/**
 * DamageReportCard — client component for the admin dashboard.
 *
 * Spec §ADMIN DASHBOARD:
 * - Shows damage report info: description, item category, reporter, images, status.
 * - Admin note textarea + two action buttons: Repairable / Irreversible.
 * - Calls classify_repairable or classify_irreversible RPC.
 * - Calls router.refresh() on success to re-fetch the page data.
 *
 * Only shown for reports with status 'submitted' or 'under_review'.
 * Resolved reports (repairable/irreversible) are shown as read-only summary rows.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ClassifyResult } from '@/lib/types';

interface ReportCardProps {
  reportId:      string;
  adminId:       string;
  description:   string;
  status:        string;
  adminNote:     string | null;
  itemCategory:  string;
  reporterName:  string;
  reporterDistrict: string;
  imageUrls:     string[];
  createdAt:     string;
  adminChatId:   string | null;
}

export default function DamageReportCard({
  reportId,
  adminId,
  description,
  status,
  adminNote,
  itemCategory,
  reporterName,
  reporterDistrict,
  imageUrls,
  createdAt,
  adminChatId,
}: ReportCardProps) {
  const router = useRouter();
  const [note, setNote]       = useState(adminNote ?? '');
  const [loading, setLoading] = useState<'repairable' | 'irreversible' | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [done, setDone]       = useState(false);

  const isResolved = status === 'repairable' || status === 'irreversible';

  async function handleClassify(type: 'repairable' | 'irreversible') {
    setError(null);
    setLoading(type);
    const supabase = createClient();
    try {
      const rpcName = type === 'repairable' ? 'classify_repairable' : 'classify_irreversible';
      const { data, error: rpcError } = await supabase.rpc(rpcName, {
        p_report_id: reportId,
        p_admin_id:  adminId,
        p_note:      note.trim(),
      });
      if (rpcError) throw rpcError;
      const result = data as ClassifyResult;
      if (result.success) {
        setDone(true);
        router.refresh();
      } else {
        const messages: Record<string, string> = {
          unauthorized:      'Not authorised.',
          not_admin:         'Admin access required.',
          report_not_found:  'Report not found.',
          already_classified:'This report has already been classified.',
        };
        setError(messages[(result as { success: false; reason: string }).reason] ?? 'Something went wrong.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setLoading(null);
    }
  }

  const statusColors: Record<string, string> = {
    submitted:    'bg-yellow-100 text-yellow-700',
    under_review: 'bg-blue-100 text-blue-700',
    repairable:   'bg-green-100 text-green-700',
    irreversible: 'bg-red-100 text-red-700',
  };

  return (
    <div className="rounded-2xl bg-brand-surface overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-brand-dark/[0.06]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-brand-dark truncate">{itemCategory}</p>
            <p className="text-[12px] text-brand-dark/45 mt-0.5">
              {reporterName} · {reporterDistrict}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${statusColors[status] ?? 'bg-brand-dark/10 text-brand-dark/60'}`}>
              {status.replace('_', ' ')}
            </span>
            {adminChatId && (
              <a
                href={`/chat/${adminChatId}`}
                className="text-[11px] text-brand-accent underline underline-offset-2"
              >
                Chat
              </a>
            )}
          </div>
        </div>
        <p className="text-[11px] text-brand-dark/30 mt-1">
          {new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {/* Description */}
      <div className="px-5 py-3.5 border-b border-brand-dark/[0.06]">
        <p className="text-[13px] text-brand-dark/70 leading-relaxed">{description}</p>
      </div>

      {/* Damage images */}
      {imageUrls.length > 0 && (
        <div className="px-5 py-3.5 border-b border-brand-dark/[0.06]">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {imageUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <div className="w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-brand-dark/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Damage ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Admin note + action buttons (pending reports only) */}
      {!isResolved && !done && (
        <div className="px-5 py-4 flex flex-col gap-3">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Admin note (optional — sent to borrower)"
            className="
              w-full rounded-xl bg-brand-bg px-3.5 py-3
              text-[13px] text-brand-dark placeholder:text-brand-dark/30
              resize-none outline-none border border-brand-dark/10
              focus:border-brand-accent/40
            "
            disabled={loading !== null}
          />

          {error && (
            <p className="text-sm text-red-500" role="alert">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => handleClassify('repairable')}
              className="
                flex-1 rounded-xl py-3
                bg-green-50 text-green-700
                text-[13px] font-semibold
                border border-green-200
                transition-opacity disabled:opacity-40 active:opacity-70
              "
            >
              {loading === 'repairable' ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-green-300 border-t-green-700 rounded-full animate-spin" />
                  Saving…
                </span>
              ) : 'Repairable'}
            </button>
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => handleClassify('irreversible')}
              className="
                flex-1 rounded-xl py-3
                bg-red-50 text-red-600
                text-[13px] font-semibold
                border border-red-200
                transition-opacity disabled:opacity-40 active:opacity-70
              "
            >
              {loading === 'irreversible' ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                  Saving…
                </span>
              ) : 'Irreversible'}
            </button>
          </div>
        </div>
      )}

      {/* Resolved state */}
      {(isResolved || done) && (
        <div className="px-5 py-3.5">
          {adminNote && (
            <p className="text-[12px] text-brand-dark/55 italic">"{adminNote}"</p>
          )}
          {done && !adminNote && (
            <p className="text-[12px] text-brand-dark/40">Classification saved.</p>
          )}
        </div>
      )}
    </div>
  );
}
