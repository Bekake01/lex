'use client';

import { FIELD_VALUE_RULES } from '@lex/contracts';
import { FIELD_META, isChoice } from '@/lib/field-catalog';
import { PlusIcon, TrashIcon, XIcon } from '../Icons';
import type { EditorField } from './FieldEditor';

/**
 * Properties of the selected field. Which controls show depends on the field's
 * family, because that decides who supplies its value: the signing date is
 * filled by the server, the signature image by the signer's adopted mark.
 */
export function FieldProperties({
  field,
  onChange,
  onDelete,
  onClose,
}: {
  field: EditorField;
  onChange: (patch: Partial<EditorField>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const meta = FIELD_META[field.type];
  const options = field.options ?? [];
  // What the person may enter, as the signing app will enforce it.
  const accepts =
    !isChoice(field.type) && field.type !== 'checkbox' ? FIELD_VALUE_RULES[field.type]?.hint : null;

  function setOption(i: number, value: string) {
    onChange({ options: options.map((o, idx) => (idx === i ? value : o)) });
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Maydon</h2>
        <button type="button" onClick={onClose} aria-label="Yopiş" className="btn btn-ghost btn-icon btn-sm">
          <XIcon className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
        <span className="text-accent">{meta.icon}</span>
        <span className="font-medium">{meta.label}</span>
        <span className="ml-auto text-xs text-muted">{field.page}-sahifa</span>
      </div>

      {meta.family === 'auto' ? (
        <p className="mt-4 rounded-xl bg-subtle p-3 text-sm text-muted">
          Imzolangan kun avtomatik qöyiladi — imzolovçi uni özgartira olmaydi.
        </p>
      ) : meta.family === 'mark' ? (
        <p className="mt-4 rounded-xl bg-subtle p-3 text-sm text-muted">
          Bu yerga imzolovçining imzosi qöyiladi, şaklini buzmasdan sigdiriladi.
        </p>
      ) : (
        <>
          <label className="mt-4 flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ required: e.target.checked })}
              className="size-4 accent-[var(--accent)]"
            />
            <span className="text-sm">Majburiy — töldirmasdan imzolab bölmaydi</span>
          </label>
          {accepts && <p className="mt-2 text-xs text-muted">Nima kiritiş mumkin: {accepts}</p>}
        </>
      )}

      {isChoice(field.type) && (
        <div className="mt-4">
          <p className="text-sm font-medium">Variantlar</p>
          <p className="mt-1 text-xs text-muted">Server faqat şu röyxatdagi javobni qabul qiladi.</p>
          <div className="mt-2.5 flex flex-col gap-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  maxLength={120}
                  onChange={(e) => setOption(i, e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => onChange({ options: options.filter((_, idx) => idx !== i) })}
                  disabled={options.length <= 1}
                  aria-label={`${i + 1}-variantni öçiriş`}
                  className="btn btn-ghost btn-icon btn-sm"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange({ options: [...options, `${options.length + 1}-variant`] })}
            disabled={options.length >= 30}
            className="btn btn-ghost btn-sm mt-2"
          >
            <PlusIcon className="size-4" />
            Variant qöşiş
          </button>
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <button type="button" onClick={onDelete} className="btn btn-secondary btn-sm w-full text-danger">
          <TrashIcon className="size-4" />
          Maydonni öçiriş
        </button>
      </div>
    </div>
  );
}
