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
export const DownloadIcon = (p: P) => <Svg {...p}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Svg>;
export const LockIcon = (p: P) => <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></Svg>;
export const TypeIcon = (p: P) => <Svg {...p}><path d="M5 7V5h14v2M12 5v14M9 19h6" /></Svg>;
export const ChevronLeftIcon = (p: P) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const ArrowDownIcon = (p: P) => <Svg {...p}><path d="M12 5v14M5 12l7 7 7-7" /></Svg>;
export const LinkOffIcon = (p: P) => <Svg {...p}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1M3 3l18 18" /></Svg>;
export const PenIcon = (p: P) => <Svg {...p}><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Svg>;

/**
 * Brand mark: the scales-and-book logo (`public/logo-mark.png`), transparent, no
 * tile. Size it with className; the logo keeps its shape inside the box.
 */
export function LogoMark({ className = 'size-8' }: P) {
  return (
    <span
      className={`${className} grid shrink-0 place-items-center`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo, no optimisation needed */}
      <img src="/logo-mark.png" alt="" draggable={false} className="size-full object-contain" />
    </span>
  );
}
