'use client';

import { useActionState } from 'react';
import { chiediAccesso, verificaCodice, type StatoAccesso } from '@/app/azioni/accesso';

export interface AccountProva { email: string; etichetta: string }

export function ModuloAccesso({ dopo, sviluppo, accountProva = [] }: { dopo?: string; sviluppo: boolean; accountProva?: AccountProva[] }) {
  const [s1, chiedi, inCorso1] = useActionState(chiediAccesso, { passo: 'email', dopo } as StatoAccesso);
  const [s2, verifica, inCorso2] = useActionState(verificaCodice, { passo: 'codice' } as StatoAccesso);

  if (s1.passo === 'email') {
    return (
      <>
      <form action={chiedi} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="dopo" value={dopo ?? ''} />
        <div className={`mm-campo ${s1.errore ? 'mm-campo--errore' : ''}`}>
          <label className="mm-campo__etichetta" htmlFor="a-email">La tua email</label>
          <input className="mm-campo__input" id="a-email" name="email" type="email" autoComplete="email" autoCapitalize="none" required
            defaultValue={s1.email} aria-invalid={Boolean(s1.errore)} aria-describedby="a-email-aiuto" />
          <span className="mm-campo__aiuto" id="a-email-aiuto">{s1.errore ?? 'Ti mandiamo un link e un codice. Niente password.'}</span>
        </div>
        <button type="submit" className="mm-btn mm-btn--primario mm-btn--pieno" disabled={inCorso1}>
          {inCorso1 ? 'Un attimo…' : <>Mandami il link <span className="mm-btn__freccia" aria-hidden="true">→</span></>}
        </button>
      </form>
      {sviluppo && accountProva.length > 0 && (
        // Solo in sviluppo: gli account di prova a portata di pollice.
        <div className="flex flex-col gap-3 border border-dashed border-attesa p-4">
          <span className="font-mono text-[11px] tracking-[.04em] text-attesa">SOLO SVILUPPO · ACCOUNT DI PROVA</span>
          {accountProva.map((a) => (
            <form key={a.email} action={chiedi}>
              <input type="hidden" name="email" value={a.email} />
              <input type="hidden" name="dopo" value={dopo ?? ''} />
              <button type="submit" disabled={inCorso1} className="flex w-full items-center justify-between gap-3 border-0 border-t border-linea bg-transparent px-0 py-3 text-left text-osso">
                <span className="flex flex-col gap-1">
                  <span className="font-display text-[22px] font-extrabold uppercase leading-none">{a.etichetta}</span>
                  <span className="font-mono text-[11px] text-osso-2">{a.email}</span>
                </span>
                <span className="font-mono text-[20px] text-arancio" aria-hidden="true">→</span>
              </button>
            </form>
          ))}
        </div>
      )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="status" className="flex flex-col gap-2 border border-linea bg-notte-2 p-5">
        <span className="font-display text-[26px] font-extrabold uppercase leading-none">Controlla la posta</span>
        <span className="text-[15px] leading-[22px] text-osso-2">
          Se <span className="text-osso">{s1.email}</span> ha un accesso, ti è arrivato un link. Aprilo da qui o scrivi il codice a 6 cifre.
        </span>
        {sviluppo && s1.linkSviluppo && (
          <a href={s1.linkSviluppo} className="mm-btn mm-btn--primario mt-3">Entra subito (solo sviluppo) <span className="mm-btn__freccia" aria-hidden="true">→</span></a>
        )}
        {sviluppo && <a href="/dev/posta" target="_blank" className="link-sottolineato mt-2 self-start py-2">Apri la posta di prova →</a>}
      </div>
      <form action={verifica} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="email" value={s1.email ?? ''} />
        <input type="hidden" name="dopo" value={dopo ?? ''} />
        <div className={`mm-campo ${s2.errore ? 'mm-campo--errore' : ''}`}>
          <label className="mm-campo__etichetta" htmlFor="a-codice">Codice</label>
          <input className="mm-campo__input text-center font-mono tracking-[.3em]" id="a-codice" name="codice" inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} placeholder="000000" aria-invalid={Boolean(s2.errore)} aria-describedby="a-codice-aiuto" style={{ height: 60, fontSize: 24 }} />
          <span className="mm-campo__aiuto" id="a-codice-aiuto">{s2.errore ?? 'Vale un’ora.'}</span>
        </div>
        <button type="submit" className="mm-btn mm-btn--primario mm-btn--pieno" disabled={inCorso2}>{inCorso2 ? 'Un attimo…' : 'Entra'}</button>
      </form>
    </div>
  );
}
