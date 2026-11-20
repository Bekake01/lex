import { MARK_FIELD_TYPES, fieldValueProblem, type Field, type FieldType } from '@lex/contracts';

/**
 * What each field means to the SIGNER — which they must act on, which the
 * server fills, which they type. Ported from tech award; same families as
 * `apps/api/src/signing/field-values.ts`.
 */
export type FieldKind = 'mark' | 'auto' | 'input';

const MARKS = new Set<string>(MARK_FIELD_TYPES);

export function fieldKind(field: Field): FieldKind {
  if (MARKS.has(field.type)) return 'mark';
  if (field.type === 'date') return 'auto';
  return 'input';
}

const LABELS: Record<FieldType, string> = {
  signature: 'Imzo',
  initial: 'Paraf',
  stamp: 'Muhr',
  date: 'Imzolangan sana',
  name: 'F.I.Ş.',
  first_name: 'Ism',
  last_name: 'Familiya',
  email: 'Email',
  company: 'Taşkilot',
  title: 'Lavozim',
  text: 'Matn',
  number: 'Raqam',
  phone: 'Telefon',
  address: 'Manzil',
  checkbox: 'Belgi',
  dropdown: 'Röyxat',
  radio: 'Tanlov',
  date_input: 'Sana',
};

export function fieldLabel(field: Field): string {
  return field.label?.trim() || LABELS[field.type];
}

/**
 * Why this box's value cannot be submitted — or null. The SAME rules the API
 * applies on submit, plus the sender's option list for choices. The API answers
 * a bad value with the uniform 404, so the browser must catch it first.
 */
export function fieldProblem(field: Field, value: string): string | null {
  if (fieldKind(field) !== 'input') return null;
  const v = value.trim();
  if (!v) return null;
  if ((field.type === 'dropdown' || field.type === 'radio') && !(field.options ?? []).includes(v)) {
    return 'Taklif qilingan variantlardan birini tanlang';
  }
  return fieldValueProblem(field.type, v);
}

/** Done = filled (after trimming) and acceptable. Marks count once the signature is adopted. */
export function fieldDone(field: Field, values: Record<string, string>, hasSignature: boolean): boolean {
  const kind = fieldKind(field);
  if (kind === 'auto') return true;
  if (kind === 'mark') return hasSignature;
  const v = values[field.id] ?? '';
  return v.trim() !== '' && fieldProblem(field, v) === null;
}

/** Everything standing between the signer and "Davom etiş", in document order. */
export function blockingFields(
  fields: Field[],
  values: Record<string, string>,
  hasSignature: boolean,
): Field[] {
  return sortFields(fields).filter((f) => {
    const kind = fieldKind(f);
    if (kind === 'auto') return false;
    if (kind === 'mark') return f.required && !hasSignature;
    const v = values[f.id] ?? '';
    if (fieldProblem(f, v)) return true;
    return f.required && v.trim() === '';
  });
}

/** Page, then top to bottom, then left to right. */
export function sortFields(fields: Field[]): Field[] {
  return [...fields].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
}

/** The typed values to submit: input fields only, trimmed, empty ones left out. */
export function submittedValues(fields: Field[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (fieldKind(f) !== 'input') continue;
    const v = values[f.id]?.trim();
    if (v) out[f.id] = v;
  }
  return out;
}
