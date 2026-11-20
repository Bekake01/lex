import type { ReactNode } from 'react';

type P = { className?: string };

function Svg({ className = 'size-4', children }: P & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const ArrowUpIcon = (p: P) => <Svg {...p}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>;
export const CheckIcon = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const XIcon = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const ChevronRightIcon = (p: P) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const ExternalIcon = (p: P) => <Svg {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></Svg>;
export const CopyIcon = (p: P) => <Svg {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></Svg>;
export const PaperclipIcon = (p: P) => <Svg {...p}><path d="M20 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.9-7.9" /></Svg>;
export const FileIcon = (p: P) => <Svg {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Svg>;
export const PanelIcon = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Svg>;
export const FolderIcon = (p: P) => <Svg {...p}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></Svg>;
export const ScaleIcon = (p: P) => <Svg {...p}><path d="M12 4v16M8 20h8M5 8h14M5 8l-3 6a3 3 0 006 0zM19 8l-3 6a3 3 0 006 0z" /></Svg>;
export const AlertIcon = (p: P) => <Svg {...p}><path d="M12 9v4M12 17h.01M10.3 4.2L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z" /></Svg>;
export const SendIcon = (p: P) => <Svg {...p}><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" /></Svg>;
export const ShieldIcon = (p: P) => <Svg {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></Svg>;
export const SparkIcon = (p: P) => <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></Svg>;
export const UploadIcon = (p: P) => <Svg {...p}><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></Svg>;
export const PenIcon = (p: P) => <Svg {...p}><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Svg>;

/**
 * Brand mark: an elegant serif § on a glossy blue → violet tile, with a small coral "seal" dot.
 * Size it with className (e.g. size-7, size-9); the § scales with the font size.
 */
export function LogoMark({ className = 'size-8' }: P) {
  return (
    <span
      className={`${className} relative grid shrink-0 place-items-center overflow-hidden rounded-[30%] bg-[linear-gradient(140deg,#2f83f9_0%,#0767ee_45%,#6c47ff_100%)] shadow-[0_6px_16px_rgb(7_103_238/0.30),inset_0_1px_0_rgb(255_255_255/0.35)]`}
    >
      <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
      <span className="relative -mt-[0.06em] font-doc text-[1.35em] leading-none text-white italic">§</span>
      <span className="absolute right-[14%] bottom-[14%] size-[16%] rounded-full bg-coral ring-1 ring-white/60" />
    </span>
  );
}
export const PhoneIcon = (p: P) => <Svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" /></Svg>;
export const HeartPulseIcon = (p: P) => <Svg {...p}><path d="M20.4 12.6L12 21l-8.4-8.4A5 5 0 0112 6a5 5 0 018.4 6.6z" /><path d="M3 12h4l2-3 3 6 2-3h4" /></Svg>;
export const BuildingIcon = (p: P) => <Svg {...p}><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6M9 11h.01M15 11h.01" /></Svg>;
export const UserIcon = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></Svg>;
export const MessageIcon = (p: P) => <Svg {...p}><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></Svg>;

// Signing editor (field palette + toolbar).
export const UndoIcon = (p: P) => <Svg {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></Svg>;
export const RedoIcon = (p: P) => <Svg {...p}><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 000 11H13" /></Svg>;
export const ZoomInIcon = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></Svg>;
export const ZoomOutIcon = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></Svg>;
export const TrashIcon = (p: P) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></Svg>;
export const ClipboardIcon = (p: P) => <Svg {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></Svg>;
export const ChevronDownIcon = (p: P) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const ChevronLeftIcon = (p: P) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const CalendarIcon = (p: P) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>;
export const CalendarPickIcon = (p: P) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" /></Svg>;
export const HashIcon = (p: P) => <Svg {...p}><path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16" /></Svg>;
export const AtIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-4 8" /></Svg>;
export const IdCardIcon = (p: P) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16a3 3 0 016 0M15 10h3M15 14h3" /></Svg>;
export const MapPinIcon = (p: P) => <Svg {...p}><path d="M12 21s7-6.2 7-12a7 7 0 00-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></Svg>;
export const TypeIcon = (p: P) => <Svg {...p}><path d="M5 6V4h14v2M12 4v16M9 20h6" /></Svg>;
export const SquareCheckIcon = (p: P) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></Svg>;
export const ListIcon = (p: P) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 11l3 3 3-3" /></Svg>;
export const CircleDotIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></Svg>;
export const StampIcon = (p: P) => <Svg {...p}><path d="M9 13V9a3 3 0 116 0v4M5 13h14v4H5zM6 21h12" /></Svg>;
export const InitialsIcon = (p: P) => <Svg {...p}><path d="M4 17c2-6 4-9 5-9s-1 6 1 6 3-5 4-5-1 4 1 4 3-2 5-2M4 21h16" /></Svg>;
export const SearchIcon = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>;
export const LinkIcon = (p: P) => <Svg {...p}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></Svg>;
export const ShareIcon = (p: P) => <Svg {...p}><path d="M12 15V3M8 7l4-4 4 4M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7" /></Svg>;
export const DownloadIcon = (p: P) => <Svg {...p}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Svg>;
export const TelegramIcon = (p: P) => <Svg {...p}><path d="M21 4L3 11l6 2.5M21 4l-3 16-6-6.5M21 4L9 13.5v5.5l3-5" /></Svg>;
