import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { leggi } from '@/lib/dati/archivio';
import { dataPunti, ora } from '@/lib/formato';
import { modalitaProva } from '@/lib/prova';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Posta di prova', robots: { index: false } };

/**
 * Casella di prova: qui finiscono le email finché non c'è un servizio vero (TODO: cliente).
 * Esiste solo in sviluppo.
 */
export default async function PostaDiProva({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  if (!modalitaProva()) notFound();
  const { id } = await searchParams;
  const posta = (await leggi()).posta;
  const aperta = posta.find((m) => m.id === id) ?? posta[0];
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b border-linea md:w-[380px] md:flex-none md:border-b-0 md:border-r">
        <div className="flex flex-col gap-1 border-b border-linea p-4">
          <span className="font-mono text-[11px] text-arancio">✦ SOLO SVILUPPO</span>
          <h1 className="m-0 font-display text-[36px] font-black uppercase leading-none">Posta di prova</h1>
          <span className="text-[14px] text-osso-2">{posta.length} email · le ultime 200</span>
        </div>
        <nav className="max-h-[40dvh] overflow-y-auto md:max-h-[calc(100dvh-110px)]">
          {posta.map((m) => (
            <a key={m.id} href={`/dev/posta?id=${m.id}`} className={`flex flex-col gap-1 border-b border-linea px-4 py-3 no-underline ${m.id === aperta?.id ? 'bg-notte-2' : ''}`}>
              <span className="text-[15px] font-medium">{m.oggetto}</span>
              <span className="dato-s text-osso-2">{m.a} · {dataPunti(m.inviataAt)} {ora(m.inviataAt)}</span>
            </a>
          ))}
          {posta.length === 0 && <p className="p-4 text-osso-2">Ancora nessuna email.</p>}
        </nav>
      </aside>
      <main className="flex-grow bg-vinile">
        {aperta ? <iframe title={aperta.oggetto} srcDoc={aperta.html} className="h-[80dvh] w-full border-0 md:h-dvh" sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" /> : null}
      </main>
    </div>
  );
}
