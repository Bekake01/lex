import type { FieldType } from '@lex/contracts';
import type { ReactNode } from 'react';
import {
  AtIcon,
  BuildingIcon,
  CalendarIcon,
  CalendarPickIcon,
  CircleDotIcon,
  HashIcon,
  IdCardIcon,
  InitialsIcon,
  ListIcon,
  MapPinIcon,
  PenIcon,
  PhoneIcon,
  SquareCheckIcon,
  StampIcon,
  TypeIcon,
  UserIcon,
} from '@/components/Icons';

/**
 * Everything the editor knows about a field type: its label, palette icon,
 * default size on the page, and its family — which mirrors the server
 * (`apps/api/src/signing/field-values.ts`): `mark` fields take the adopted
 * signature image, the one `auto` field (signing date) is filled by the
 * server, and only `input` fields are typed by the signer.
 */
export type FieldFamily = 'mark' | 'auto' | 'input';

export const FIELD_GROUPS = ['Imzo', 'Şaxsiy maʼlumot', 'Maydonlar'] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

export interface FieldMeta {
  type: FieldType;
  label: string;
  group: FieldGroup;
  family: FieldFamily;
  icon: ReactNode;
  /** Default size, as page fractions. */
  w: number;
  h: number;
  /** Placeholder inside an unfilled box. */
  hint?: string;
}

const ic = 'size-[18px]';

export const FIELD_CATALOG: FieldMeta[] = [
  { type: 'signature', label: 'Imzo', group: 'Imzo', family: 'mark', icon: <PenIcon className={ic} />, w: 0.24, h: 0.055 },
  { type: 'initial', label: 'Paraf', group: 'Imzo', family: 'mark', icon: <InitialsIcon className={ic} />, w: 0.09, h: 0.045 },
  { type: 'stamp', label: 'Muhr', group: 'Imzo', family: 'mark', icon: <StampIcon className={ic} />, w: 0.14, h: 0.1 },
  { type: 'date', label: 'Sana', group: 'Imzo', family: 'auto', icon: <CalendarIcon className={ic} />, w: 0.17, h: 0.028, hint: 'Imzolangan sana' },

  { type: 'name', label: 'F.I.Ş.', group: 'Şaxsiy maʼlumot', family: 'input', icon: <UserIcon className={ic} />, w: 0.26, h: 0.028, hint: 'Familiya Ism Şarif' },
  { type: 'first_name', label: 'Ism', group: 'Şaxsiy maʼlumot', family: 'input', icon: <UserIcon className={ic} />, w: 0.17, h: 0.028, hint: 'Ism' },
  { type: 'last_name', label: 'Familiya', group: 'Şaxsiy maʼlumot', family: 'input', icon: <UserIcon className={ic} />, w: 0.17, h: 0.028, hint: 'Familiya' },
  { type: 'email', label: 'Email', group: 'Şaxsiy maʼlumot', family: 'input', icon: <AtIcon className={ic} />, w: 0.26, h: 0.028, hint: 'Email' },
  { type: 'company', label: 'Taşkilot', group: 'Şaxsiy maʼlumot', family: 'input', icon: <BuildingIcon className={ic} />, w: 0.24, h: 0.028, hint: 'Taşkilot' },
  { type: 'title', label: 'Lavozim', group: 'Şaxsiy maʼlumot', family: 'input', icon: <IdCardIcon className={ic} />, w: 0.2, h: 0.028, hint: 'Lavozim' },
  { type: 'phone', label: 'Telefon', group: 'Şaxsiy maʼlumot', family: 'input', icon: <PhoneIcon className={ic} />, w: 0.2, h: 0.028, hint: '+998' },
  { type: 'address', label: 'Manzil', group: 'Şaxsiy maʼlumot', family: 'input', icon: <MapPinIcon className={ic} />, w: 0.34, h: 0.028, hint: 'Manzil' },

  { type: 'text', label: 'Matn', group: 'Maydonlar', family: 'input', icon: <TypeIcon className={ic} />, w: 0.22, h: 0.028, hint: 'Matn' },
  { type: 'number', label: 'Raqam', group: 'Maydonlar', family: 'input', icon: <HashIcon className={ic} />, w: 0.12, h: 0.028, hint: '0' },
  { type: 'date_input', label: 'Sana tanlaş', group: 'Maydonlar', family: 'input', icon: <CalendarPickIcon className={ic} />, w: 0.14, h: 0.028, hint: 'Sana' },
  { type: 'checkbox', label: 'Belgi', group: 'Maydonlar', family: 'input', icon: <SquareCheckIcon className={ic} />, w: 0.022, h: 0.016 },
  { type: 'dropdown', label: 'Röyxat', group: 'Maydonlar', family: 'input', icon: <ListIcon className={ic} />, w: 0.22, h: 0.028, hint: 'Tanlang…' },
  { type: 'radio', label: 'Tanlov', group: 'Maydonlar', family: 'input', icon: <CircleDotIcon className={ic} />, w: 0.22, h: 0.028, hint: 'Bittasini tanlang' },
];

export const FIELD_META = Object.fromEntries(FIELD_CATALOG.map((f) => [f.type, f])) as Record<FieldType, FieldMeta>;

export function isChoice(type: FieldType): boolean {
  return type === 'dropdown' || type === 'radio';
}

/** The options a freshly dropped choice field starts with. */
export const DEFAULT_OPTIONS = ['1-variant', '2-variant'];
