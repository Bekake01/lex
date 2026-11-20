import { ContractList } from '@/components/ContractList';

export default function ContractsPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 pt-10 pb-12">
        <h1 className="text-[2.5rem] leading-tight font-medium tracking-tight">Şartnomalar</h1>
        <p className="mt-2 text-lg text-ink/70">Sizga imzolaş uçun yuborilganlar</p>
        <ContractList />
      </div>
    </div>
  );
}
