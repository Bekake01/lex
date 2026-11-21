import { LogoMark } from './Icons';

/** Logo: brand mark + "Cralex". */
export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark className={small ? 'h-9 w-14' : 'h-10 w-16'} />
      <span className={`font-display font-semibold tracking-tight text-ink ${small ? 'text-xl' : 'text-2xl'}`}>Cralex</span>
    </span>
  );
}
