import { PenIcon } from '@/components/Icons';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <PenIcon className="size-7" />
      </span>
      <h1 className="text-3xl font-semibold">Şartnomani imzolaş</h1>
      <p className="max-w-sm text-muted">
        Imzolaş uçun sizga yuborilgan havolani email yoki SMS orqali oçing.
      </p>
    </div>
  );
}
