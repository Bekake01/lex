import { LogoMark } from './Icons';

/** Logo: brand mark + "lex". */
export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={small ? 'size-8' : 'size-9'} />
      <span className={`font-display font-semibold tracking-tight text-ink ${small ? 'text-xl' : 'text-2xl'}`}>lex</span>
    </span>
  );
}
