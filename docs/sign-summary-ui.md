# Sign app: show the new AI summary sections

For the frontend team (`apps/sign`). Written 2026-11-21.

## What this is

Before someone signs, the sign app shows an AI summary of the contract (the
**Xulosa** step). The backend now writes **five new sections** into that
summary. The API already sends them; the screen doesn't show them yet.

Your job: show these five sections in the Xulosa step.

| New field   | Show it as                      | Example                                             |
| ----------- | ------------------------------- | --------------------------------------------------- |
| `youGet`    | **Siz nima olasiz**             | "Ikki xonali kvartirada bir yil yashaş huquqi"      |
| `youGive`   | **Siz nima berasiz**            | "Har oy 5 000 000 söm ijara haqi"                   |
| `deadlines` | **Muddatlar**                   | "har oyning 5-sanasi — Ijara haqini tölaş — Siz"    |
| `watchOut`  | **Ehtiyot böling**              | "Depozitingiz hech qaçon qaytarilmaydi" (high)      |
| `howToEnd`  | **Şartnomani qanday tugatiş mumkin** | "Muddatidan oldin bekor qiliş tartibi yozilmagan." |

Nothing else changes: same route, same step, same order of steps.

## Where

- Screen: `apps/sign/src/components/sign/SummaryStep.tsx`. It already shows
  the overview, key conditions and both sides' obligations; add the new
  sections there.
- Data: `GET /api/sign/:token/summary` (the sign app's pass-through to
  `GET /sign/:token/summary`). `SigningFlow.tsx` already loads it and passes
  it to `<SummaryStep summary={…} />`. **No new request is needed.**
- Types: `RecipientSummaryWire` from `@lex/contracts`
  (`packages/contracts/src/ai.ts`).

## The data

All five fields are **optional**. Summaries written before 2026-11-21 don't
have them, so the screen must work with or without them.

```ts
// from @lex/contracts
interface RecipientSummaryWire {
  // already shown today
  language: 'uz' | 'ru' | 'en';
  partyName: string;
  overview: string;
  yourObligations: ObligationWire[];
  otherObligations: ObligationWire[];
  keyConditions: { label: string; value: string }[];
  flaggedIssues?: IssueWire[]; // old field: do NOT show it, `watchOut` replaces it

  // NEW
  youGet?: SummaryPointWire[];     // what the signer receives
  youGive?: SummaryPointWire[];    // what the signer pays or hands over
  deadlines?: SummaryDeadlineWire[]; // every date, already in time order
  watchOut?: SummaryWarningWire[]; // terms that can hurt the signer, most serious first
  howToEnd?: SummaryPointWire[];   // how either side can end it early, and what it costs
}

interface SummaryPointWire {
  text: string;
  clauseRef: string; // e.g. "4", "4.2"; "" when the point is about something the contract leaves out
}

interface SummaryDeadlineWire {
  when: string;  // "har oyning 5-sanasi", "1-fevral", "ketişdan 30 kun oldin"
  what: string;
  who: 'you' | 'other' | 'both';
  clauseRef: string;
}

interface SummaryWarningWire {
  text: string;
  severity: 'high' | 'medium' | 'low';
  clauseRef: string;
}
```

Import the types, don't copy them: `SummaryPointWire`, `SummaryDeadlineWire`,
`SummaryWarningWire`, `SummaryWho` are all exported from `@lex/contracts`.

## How each section should look

Suggested order on the screen (top to bottom):

1. Overview + key conditions (as today)
2. **Ehtiyot böling** (`watchOut`), the most important thing before signing
3. **Siz nima olasiz** / **Siz nima berasiz** (`youGet` / `youGive`), side by side on desktop, stacked on mobile
4. **Muddatlar** (`deadlines`)
5. Both sides' obligations (as today)
6. **Şartnomani qanday tugatiş mumkin** (`howToEnd`)
7. The footer note (as today)

### Ehtiyot böling (`watchOut`)

- One row per item, in the order given (the API sorts it most serious first).
- Each row has a severity mark. Use the theme tokens, no hex or Tailwind palette colors:

  | `severity` | Label    | Classes                                    |
  | ---------- | -------- | ------------------------------------------ |
  | `high`     | Jiddiy   | `bg-danger-soft text-danger` + `border-danger-line` |
  | `medium`   | Örtaça   | `bg-warning-soft text-warning` + `border-warning-line` |
  | `low`      | Past     | `bg-info-soft text-info` + `border-info-line` |

- Don't rely on color alone: show the label text ("Jiddiy" …) too.
- **Empty array** (`watchOut: []`): show one calm line, "Xavfli şartlar topilmadi." A small success tone is fine.
- **Field missing** (old summary): hide the whole section.

### Siz nima olasiz / Siz nima berasiz (`youGet`, `youGive`)

- Plain bullet lists, the same style as the obligations lists.
- Empty or missing: hide that card. If both are missing, hide the row.

### Muddatlar (`deadlines`)

- A list (or a simple timeline), **keep the API's order**; it is already in time order.
- Each row: `when` (bold) · `what` · a small "who" chip:

  | `who`   | Chip text     | Style                  |
  | ------- | ------------- | ---------------------- |
  | `you`   | Siz           | `bg-accent-soft text-accent` |
  | `other` | Boşqa tomon   | `bg-subtle text-muted` |
  | `both`  | Ikkala tomon  | `bg-subtle text-ink`   |

- Empty or missing: hide the section.

### Şartnomani qanday tugatiş mumkin (`howToEnd`)

- Bullet list.
- An item with `clauseRef: ""` means the contract **doesn't say**. That is
  useful information, so show it like any other item (the text already says
  so, e.g. "Şartnomada muddatidan oldin bekor qiliş tartibi yozilmagan.").
- Missing: hide the section.

### Clause references (all sections)

- Show `clauseRef` as a small muted tag after the text: `"3"` → **3-band**,
  `"4.2"` → **4.2-band**. If it isn't plain digits and dots (for example
  "7-modda"), show it as is.
- `clauseRef: ""` → no tag.
- The tag is just text for now. Jumping to the clause in the PDF is not part
  of this task.

## Rules

- **Mobile first.** Most signers open the link on a phone. Everything
  stacks to one column under `sm`.
- **Colors:** only `@lex/theme` tokens (`packages/theme/theme.css`). Check
  light and dark mode.
- **Buttons:** the shared `btn …` classes if you add any (you probably don't need any).
- **UI text** is Uzbek in the new Latin alphabet (ş ç ğ ö). The summary
  text itself comes from the AI: show it exactly as it arrives, don't edit
  or shorten it.
- **Don't invent content.** If a section is empty or missing, hide it or use
  the empty line above. Never fill it with placeholder examples.
- Keep the existing footer: the summary was written at send time and only the
  document itself is legally binding.
- No API or contracts change is needed. If you think one is, talk to the
  backend first (`packages/contracts` is add-only).

## Test data

- **Mock:** `packages/contracts/mocks/recipient-summary.json` has every new
  section filled in (rental contract: 2 warnings, 2 deadlines, a `howToEnd`
  item with an empty `clauseRef`).
- **Real API:** `cd apps/api && pnpm seed:demo`, then open the signing link it
  prints (`http://localhost:3001/sign/<token>`).
- **Old summary:** delete the five new keys from a copy of the mock and check
  that the screen looks like it does today.

## Done when

- [ ] All five sections show on the mock, in the order above.
- [ ] A summary without the new fields looks exactly like today.
- [ ] `watchOut: []` shows "Xavfli şartlar topilmadi."
- [ ] Severity and "who" show as text, not only color.
- [ ] Looks right at 375 px wide and on desktop, in light and dark mode.
- [ ] `flaggedIssues` is not shown anywhere.
