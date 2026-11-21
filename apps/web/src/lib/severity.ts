// Colours and labels for a finding's severity (review findings + document highlights).

export type Severity = 'high' | 'medium' | 'low';

export const severityMeta: Record<
  Severity,
  { label: string; dot: string; badge: string; doc: string; weight: number }
> = {
  high: {
    label: 'Yuqori',
    dot: 'bg-danger',
    badge: 'bg-danger-soft text-danger ring-danger-line',
    doc: 'bg-danger-soft border-danger/50',
    weight: 18,
  },
  medium: {
    label: 'Örta',
    dot: 'bg-warning',
    badge: 'bg-warning-soft text-warning ring-warning-line',
    doc: 'bg-warning-soft border-warning/50',
    weight: 10,
  },
  low: {
    label: 'Past',
    dot: 'bg-info',
    badge: 'bg-info-soft text-info ring-info-line',
    doc: 'bg-info-soft border-info/50',
    weight: 4,
  },
};
