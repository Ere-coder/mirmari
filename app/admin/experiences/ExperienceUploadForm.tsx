'use client';

import { useState, useRef, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createExperience } from './actions';

interface UserOption {
  id:    string;
  label: string;
}

interface SetOption {
  id:   string;
  code: string;
}

interface Props {
  users: UserOption[];
  sets:  SetOption[];
}

export default function ExperienceUploadForm({ users, sets }: Props) {
  const [userId,    setUserId]    = useState('');
  const [setId,     setSetId]     = useState('');
  const [caption,   setCaption]   = useState('');
  const [preview,   setPreview]   = useState<string | null>(null);
  const [file,      setFile]      = useState<File | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setSuccess(false);
    setError(null);
  }

  async function handleSubmit() {
    if (!userId || !file) {
      setError('Choose a user and a photo.');
      return;
    }
    setError(null);

    const supabase = createClient();
    const ext  = file.name.split('.').pop();
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('experience-images')
      .upload(path, file, { upsert: false });

    if (uploadError) { setError(uploadError.message); return; }

    const { data: { publicUrl } } = supabase.storage
      .from('experience-images')
      .getPublicUrl(path);

    startTransition(async () => {
      const result = await createExperience(userId, setId || null, publicUrl, caption);
      if (result.success) {
        setUserId(''); setSetId(''); setCaption('');
        setFile(null); setPreview(null);
        if (inputRef.current) inputRef.current.value = '';
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-2xl bg-white border border-brand-dark/[0.06] p-4 flex flex-col gap-4">
      {/* Photo picker */}
      <div
        onClick={() => inputRef.current?.click()}
        className="
          aspect-square max-h-48 rounded-xl overflow-hidden bg-brand-surface
          flex items-center justify-center cursor-pointer
          active:opacity-80 transition-opacity
        "
      >
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-brand-dark/30">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p className="text-[12px]">Tap to choose photo</p>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {/* User */}
      <select
        value={userId}
        onChange={e => setUserId(e.target.value)}
        className="
          w-full rounded-xl border border-brand-dark/15
          px-3 py-2.5 text-[13px] text-brand-dark
          focus:outline-none focus:border-brand-dark/30
          bg-white
        "
      >
        <option value="">Select user…</option>
        {users.map(u => (
          <option key={u.id} value={u.id}>{u.label}</option>
        ))}
      </select>

      {/* Set (optional) */}
      <select
        value={setId}
        onChange={e => setSetId(e.target.value)}
        className="
          w-full rounded-xl border border-brand-dark/15
          px-3 py-2.5 text-[13px] text-brand-dark
          focus:outline-none focus:border-brand-dark/30
          bg-white
        "
      >
        <option value="">Set (optional)…</option>
        {sets.map(s => (
          <option key={s.id} value={s.id}>Set {s.code}</option>
        ))}
      </select>

      {/* Caption */}
      <input
        type="text"
        value={caption}
        onChange={e => setCaption(e.target.value)}
        placeholder="Caption (optional)"
        className="
          w-full rounded-xl border border-brand-dark/15
          px-3 py-2.5 text-[13px] text-brand-dark
          placeholder:text-brand-dark/30
          focus:outline-none focus:border-brand-dark/30
        "
      />

      {error   && <p className="text-[12px] text-red-500">{error}</p>}
      {success && <p className="text-[12px] text-green-600">Experience uploaded.</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || !userId || isPending}
        className="
          w-full bg-brand-accent text-brand-bg
          rounded-xl py-3 text-[13px] font-semibold
          disabled:opacity-40 active:opacity-80 transition-opacity
        "
      >
        {isPending ? 'Uploading…' : 'Upload experience'}
      </button>
    </div>
  );
}
