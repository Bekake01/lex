import type { DeliveryChannel } from '@lex/contracts';

/**
 * A share link that opens the sender's own app (we deliver nothing ourselves
 * yet). Null for "Faqat havola": copy only.
 */
export function shareUrl(
  channel: DeliveryChannel,
  contact: string | null,
  link: string,
  title: string,
  message: string | null,
): string | null {
  const text = message?.trim() || `«${title}» hujjatini imzolang`;
  switch (channel) {
    case 'telegram':
      return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    case 'sms':
      return `sms:${contact ?? ''}?body=${encodeURIComponent(`${text} ${link}`)}`;
    case 'email':
      return `mailto:${contact ?? ''}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${link}`)}`;
    case 'link':
      return null;
  }
}

/** Copy to the clipboard; false when the browser refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
