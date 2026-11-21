import { SIGN_TICKET_HEADER } from '@lex/contracts';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Pass-through to the API for the signing pages. The browser only ever calls
 * `/api/sign/...` here; this forwards it to `API_URL` and streams the answer
 * back. No signing logic lives here — tokens, passwords and checks are all the
 * API's. Only `sign/...` paths, GET + POST. Relay secret and edge rate limit
 * are "Later" (ROADMAP).
 */
const API_URL = (process.env.API_URL ?? 'http://localhost:5000').replace(/\/+$/, '');
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const SEGMENT = /^[A-Za-z0-9_-]{1,200}$/;
const PASSED_RESPONSE_HEADERS = ['content-type', 'content-disposition'];

function notFound(): NextResponse {
  return NextResponse.json(
    { message: 'Not found' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** First hop of x-forwarded-for, or nothing (the API then uses the socket address). */
function clientIp(req: NextRequest): string | null {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first && first.length <= 45 ? first : null;
}

async function forward(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;
  if (path[0] !== 'sign' || path.length < 2 || path.length > 4) return notFound();
  if (!path.every((p) => SEGMENT.test(p))) return notFound();

  const headers = new Headers({ accept: req.headers.get('accept') ?? '*/*' });
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const ticket = req.headers.get(SIGN_TICKET_HEADER);
  if (ticket) headers.set(SIGN_TICKET_HEADER, ticket.slice(0, 1000));
  const ip = clientIp(req);
  if (ip) headers.set('x-client-ip', ip);
  const ua = req.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);

  let body: ArrayBuffer | undefined;
  if (req.method === 'POST') {
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return notFound();
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/${path.join('/')}`, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { message: 'Server bilan aloqa yöq' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const out = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of PASSED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}

export const GET = forward;
export const POST = forward;
