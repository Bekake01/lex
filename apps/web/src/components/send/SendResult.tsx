'use client';

import type { SendSigningResponse } from '@lex/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { CHANNELS } from '@/lib/people';
import { copyText } from '@/lib/share';
import { CheckIcon, LinkIcon } from '../Icons';
import { LinkActions } from './LinkActions';
import { CHANNEL_ICON } from './PeopleEditor';

/**
 * After send (and after "Odam qöşiş"): every person's own link, to copy or
 * share from the sender's own apps — we deliver nothing ourselves yet.
 */
export function SendResult({
  result,
  title,
  message,
  heading = 'Yuborişga tayyor',
  detailHref,
}: {
  result: SendSigningResponse;
  title: string;
  message: string | null;
  heading?: string;
  detailHref?: string;
}) {
  const [copiedAll, setCopiedAll] = useState(false);
  const allText = [
    ...result.recipients.map((r) => `${r.name ?? r.contact ?? 'Odam'}: ${r.signUrl}`),
    ...(result.openLinkUrl ? [`Oçiq havola: ${result.openLinkUrl}`] : []),
  ].join('\n');

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-success-soft text-success">
          <CheckIcon className="size-5" />
        </span>
        <div>
          <h2 className="text-xl font-medium">{heading}</h2>
          <p className="text-sm text-muted">Har bir odamga öz havolasini yuboring — u öz nusxasini imzolaydi.</p>
        </div>
      </div>

      {result.openLinkUrl && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4">
          <LinkIcon className="size-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Oçiq havola</div>
            <div className="truncate text-sm text-muted">{result.openLinkUrl}</div>
          </div>
          <LinkActions channel="telegram" contact={null} link={result.openLinkUrl} title={title} message={message} />
        </div>
      )}

      {result.recipients.length > 0 && (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {result.recipients.map((r) => {
            const Icon = CHANNEL_ICON[r.channel];
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted" title={CHANNELS.find((c) => c.id === r.channel)?.label}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.name ?? r.contact ?? 'Ismsiz'}</div>
                  <div className="truncate text-sm text-muted">{r.name && r.contact ? r.contact : r.signUrl}</div>
                </div>
                <LinkActions channel={r.channel} contact={r.contact} link={r.signUrl} title={title} message={message} />
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            if (await copyText(allText)) {
              setCopiedAll(true);
              setTimeout(() => setCopiedAll(false), 1500);
            }
          }}
          className="btn btn-secondary"
        >
          {copiedAll ? 'Nusxalandi' : 'Hammasini nusxalaş'}
        </button>
        {detailHref && (
          <Link href={detailHref} className="btn btn-primary ml-auto">
            Hujjatga ötiş
          </Link>
        )}
      </div>
    </div>
  );
}
