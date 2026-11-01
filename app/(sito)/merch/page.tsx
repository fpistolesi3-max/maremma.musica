import type { Metadata } from 'next';
import { Disco } from '@/components/ui';

export const metadata: Metadata = { title: 'Merch', description: 'Magliette, felpe e gadget Maremma Musica: lo shop online apre presto.' };

// Segnaposto: lo shop online non c'è ancora. Niente prezzi né foto finte, solo le categorie in arrivo.
// TODO: cliente — prodotti, foto, prezzi, taglie e come si paga (Stripe, come le prevendite).
const IN_ARRIVO = [
  { nome: 'T-shirt', nota: 'Logo davanti, date dietro' },
  { nome: 'Felpa', nota: 'Per le albe in pineta' },
  { nome: 'Cappellino', nota: 'Monogramma ricamato' },
  { nome: 'Gadget', nota: 'Tote bag, adesivi, accendini' },
];

export default function Merch() {
  return (
    <section className="contenitore flex flex-col gap-8 pb-16 pt-8 md:gap-12 md:pb-24 md:pt-14">
      <div className="flex flex-col gap-5 md:gap-6">
        <span className="font-mono text-[11px] tracking-[.06em] text-arancio md:text-[12px]">✦ SHOP ONLINE · IN ARRIVO</span>
        <h1 className="m-0 font-display text-[72px] font-black uppercase leading-[.84] md:text-[120px]">Merch</h1>
        <p className="m-0 max-w-[620px] text-[17px] leading-[26px] text-osso-2 md:text-[18px] md:leading-7">
          Magliette, felpe e gadget Maremma Musica. Lo shop apre presto: il primo drop lo annunciamo su{' '}
          <a href="https://www.instagram.com/maremma.musica/" className="link-sottolineato">Instagram</a>.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6">
        {IN_ARRIVO.map((p) => (
          <div key={p.nome} className="flex flex-col gap-3">
            <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 bg-notte-3">
              <Disco className="h-[52px] w-[52px] md:h-[72px] md:w-[72px]" piccolo />
              <span className="font-mono text-[9px] leading-3 tracking-[.06em] text-osso-2 md:text-[10px]">IN ARRIVO</span>
            </div>
            <span className="font-display text-[26px] font-black uppercase leading-none md:text-[32px]">{p.nome}</span>
            <span className="dato-s text-osso-2">{p.nota}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
