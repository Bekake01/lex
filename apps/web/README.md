# apps/web — sender dashboard

Next.js app on port 3000: sign up or sign in, ask a legal question, upload a
contract and read its AI review, chat about changes and accept them, then place
signature fields on the PDF and send it.

```bash
cp .env.example .env.local   # from apps/web
pnpm dev:web                 # from the repo root
```

It talks to `apps/api` (`API_URL` / `NEXT_PUBLIC_API_URL`, default
`http://localhost:5000`). The request and response shapes come from
`@lex/contracts`.

| Route                      | What                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `/`                        | Home: ask a question, check a contract, send for signature |
| `/ask`                     | Legal Q&A chat (`?chat=<id>` reopens one)                  |
| `/contracts`               | Documents: incoming, sent, my files                        |
| `/review?doc=<id>`         | AI review, correction chat, versions                       |
| `/documents/send/[id]`     | Field editor and people for a new send                     |
| `/documents/sends/[id]`    | A send: who signed, downloads, add people, cancel          |
| `/pricing`, `/billing`, `/team` | Plans (test payments), billing, company team          |
