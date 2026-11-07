import Link from 'next/link';

export type Linguetta = { href: string; testo: string; attiva: boolean };

/** Linguette in alto in una pagina admin (stesso stile di "PR / Social e sito"). Su telefono scorrono in orizzontale. */
export function Linguette({ etichetta, voci, piccola }: { etichetta: string; voci: Linguetta[]; piccola?: boolean }) {
  return (
    <nav aria-label={etichetta} className="mm-scroll flex gap-1 border-b border-linea px-4 md:px-12">
      {voci.map((v) => (
        <Link key={v.href} href={v.href} aria-current={v.attiva ? 'page' : undefined}
          className={`flex-none whitespace-nowrap border-b-2 px-3 font-semibold uppercase tracking-[.12em] no-underline ${piccola ? 'py-2 text-[12px]' : 'py-3 text-[13px]'} ${v.attiva ? 'border-arancio text-osso' : 'border-transparent text-osso-2 hover:text-osso'}`}>
          {v.testo}
        </Link>
      ))}
    </nav>
  );
}
