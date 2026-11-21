# apps/web — sender dashboard

Next.js app on port 3000: sign in, upload a contract, read the AI review,
chat about changes, then place signature fields and send it.

```bash
cp .env.example .env.local   # from apps/web
pnpm dev:web                 # from the repo root
```

It talks to `apps/api` (`API_URL`, default `http://localhost:5000`). With
`NEXT_PUBLIC_DEMO_LOGIN=1` it runs offline on the mocks in
`packages/contracts/mocks/`.
