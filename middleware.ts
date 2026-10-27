import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_PR, DURATA_COOKIE_PR, SEGMENTI_RISERVATI } from './lib/costanti';
import { COOKIE_CANALE, canaleDaReferer, canaleDaUserAgent, normalizzaCanale } from './lib/canali';

// Attribuzione, ricordata 3 giorni nel browser. Vince l'ultimo arrivo:
// - PR: chi apre un link PR finisce nella sua lista anche se torna dopo senza link;
// - canale: da dove arriva (link ?da=instagram, pagina di provenienza, browser interno dei social).

const HANDLE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COOKIE = { maxAge: DURATA_COOKIE_PR, sameSite: 'lax' as const, path: '/' };

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const res = NextResponse.next();

  let handle: string | null = null;
  const evento = pathname.match(/^\/e\/[^/]+\/([^/]+)\/?$/);
  if (evento && !SEGMENTI_RISERVATI.includes(evento[1])) handle = evento[1];
  else if (evento && evento[1] === 'prevendita') handle = searchParams.get('pr');
  const generico = pathname.match(/^\/pr\/([^/]+)\/?$/);
  if (generico) handle = generico[1];
  // Link dei tavoli del PR (/tavoli/[serata]?pr=…): come quello della lista, il sito lo ricorda per qualche giorno.
  if (/^\/tavoli\/[^/]+\/?$/.test(pathname) && searchParams.get('pr')) handle = searchParams.get('pr');
  if (handle && HANDLE.test(handle.toLowerCase())) res.cookies.set(COOKIE_PR, handle.toLowerCase(), COOKIE);

  // Solo sulle pagine pubbliche: le aree di lavoro non contano come arrivi.
  if (!/^\/(admin|door|gestione|accedi|dev|api)(\/|$)/.test(pathname)) {
    const canale =
      normalizzaCanale(searchParams.get('da') ?? searchParams.get('utm_source')) ??
      canaleDaReferer(req.headers.get('referer'), req.headers.get('host')) ??
      canaleDaUserAgent(req.headers.get('user-agent'));
    if (canale) res.cookies.set(COOKIE_CANALE, canale, COOKIE);
  }
  return res;
}

export const config = { matcher: ['/((?!_next/|api/|media/|img/|fonts/|favicon|icon|sw-porta|.*\\.(?:svg|png|jpg|jpeg|webp|woff2|js|css|webmanifest)$).*)'] };
