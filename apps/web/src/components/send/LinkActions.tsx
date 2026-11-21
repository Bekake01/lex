'use client';

import type { DeliveryChannel } from '@lex/contracts';
import { useState } from 'react';
import { copyText, shareUrl } from '@/lib/share';
import { CheckIcon, CopyIcon, ShareIcon } from '../Icons';

/** "Nusxa" + a share button that opens the sender's own app for this channel. */
export function LinkActions({
  channel,
  contact,
  link,
  title,
  message,
}: {
  channel: DeliveryChannel;
  contact: string | null;
  link: string;
  title: string;
  message: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const share = shareUrl(channel, contact, link, title, message);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={async () => {
          if (await copyText(link)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="btn btn-secondary btn-sm"
      >
        {copied ? <CheckIcon className="size-4 text-success" /> : <CopyIcon className="size-4" />}
        {copied ? 'Nusxalandi' : 'Nusxa'}
      </button>
      {share && (
        <a href={share} target="_blank" rel="noreferrer" className="btn btn-soft btn-sm" title="Ulaşiş">
          <ShareIcon className="size-4" />
          <span className="hidden sm:inline">Ulaşiş</span>
        </a>
      )}
    </div>
  );
}
