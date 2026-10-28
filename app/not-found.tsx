import Link from 'next/link';
import { Piede, Testata } from '@/components/sito';
import { Disco } from '@/components/ui';

/** 404: il disco salta. */
export default function NonTrovata() {
  return (
    <div className="mm-grana flex min-h-dvh flex-col">
      <Testata />
      <main className="mm-curve flex-grow overflow-hidden bg-[position:-800px_-200px]">
        <div className="contenitore flex flex-col gap-8 py-14 md:flex-row md:items-center md:gap-16 md:py-24">
          <div className="flex flex-grow flex-col gap-6">
            <span className="font-mono text-[11px] tracking-[.06em] text-arancio md:text-[12px]">✦ ERRORE 404</span>
            <h1 className="m-0 font-display text-[88px] font-black uppercase leading-[.84] md:text-[140px]">Il disco<br /><span className="text-arancio">è saltato.</span></h1>
            <p className="m-0 max-w-[520px] text-[17px] leading-[26px] text-osso-2">Questa pagina non c&apos;è. Magari il link del PR era scritto male, o la serata è già passata.</p>
            <div className="flex flex-col gap-3 md:flex-row">
              <Link href="/" className="mm-btn mm-btn--primario">Torna alla home</Link>
              <Link href="/eventi" className="mm-btn mm-btn--clip mm-btn--linea">Prossime date</Link>
            </div>
          </div>
          <Disco className="h-[280px] w-[280px] self-center md:h-[420px] md:w-[420px]" etichetta={['MAREMMA<br>MUSICA', 'LATO B<br>404']} />
        </div>
      </main>
      <Piede />
    </div>
  );
}
