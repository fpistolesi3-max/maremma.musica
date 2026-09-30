'use client';

import { useActionState } from 'react';
import { recuperaQr, type StatoRecupero } from '@/app/azioni/prevendita';

export function ModuloRecupero({ email = '' }: { email?: string }) {
  const [stato, invia, inCorso] = useActionState(recuperaQr, { inviata: false } as StatoRecupero);
  if (stato.inviata) {
    return (
      <div role="status" className="flex flex-col gap-3 border border-linea bg-notte-2 p-6">
        <span className="font-display text-[28px] font-extrabold uppercase leading-none">Controlla la posta</span>
        <p className="m-0 text-[16px] leading-6 text-osso-2">
          Se <span className="text-osso">{stato.email}</span> è in lista per una delle prossime serate, ti abbiamo appena mandato i link ai QR.
          Non trovi l&apos;email? Guarda nello spam.
        </p>
      </div>
    );
  }
  return (
    <form action={invia} className="flex flex-col gap-5" noValidate>
      <div className={`mm-campo ${stato.errore ? 'mm-campo--errore' : ''}`}>
        <label className="mm-campo__etichetta" htmlFor="r-email">Email usata per iscriverti</label>
        <input className="mm-campo__input" id="r-email" name="email" type="email" autoComplete="email" autoCapitalize="none" defaultValue={stato.email ?? email}
          placeholder="nome@email.it" aria-invalid={Boolean(stato.errore)} aria-describedby="r-email-aiuto" />
        <span className="mm-campo__aiuto" id="r-email-aiuto">{stato.errore ?? 'Ti rimandiamo i link a tutti i tuoi QR.'}</span>
      </div>
      <button type="submit" className="mm-btn mm-btn--primario mm-btn--pieno" disabled={inCorso}>{inCorso ? 'Un attimo…' : 'Rimandami il QR'}</button>
    </form>
  );
}
