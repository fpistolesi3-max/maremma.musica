import 'server-only';
import type { PrenotazioneVista } from './dati/tavoli';
import { qrPng } from './biglietto-email';
import { bottoneEmail, escapeHtml, guscioEmail, inviaEmail } from './posta';
import { dataPunti, euro, giornoSett, numeroEvento, ora, orari } from './formato';
import { mostraCodice } from './qr-token';
import { luogoTesto } from './luogo';

export function linkTavolo(origine: string, id: string, email: string) {
  return `${origine}/tavolo/${id}?email=${encodeURIComponent(email)}`;
}

/** Apre la pagina di pagamento online della prenotazione (ne crea una nuova a ogni apertura). */
export function linkPagamento(origine: string, id: string, email: string) {
  return `${origine}/tavolo/${id}/paga?email=${encodeURIComponent(email)}`;
}

/** "sab 24.10 alle 18:30": il termine per pagare, scritto per esteso. */
export function quandoScade(iso: string) {
  return `${giornoSett(iso).toLowerCase()} ${dataPunti(iso)} alle ${ora(iso)}`;
}

function riquadro(v: PrenotazioneVista, extra: string) {
  const { prenotazione: p, evento: e, tavolo: t } = v;
  return `
<div style="background:#050505;border:1px solid #2a303b;border-radius:2px;padding:24px;margin:0 0 24px;">
  <p style="font:400 11px/14px 'Courier New',monospace;color:#a39e95;margin:0 0 8px;">${numeroEvento(e.numero)} · TAVOLO</p>
  <p style="font:900 32px/1 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;margin:0 0 8px;color:#e1d7c9;">${escapeHtml(e.nome)}</p>
  <p style="font:400 13px/18px 'Courier New',monospace;color:#a39e95;margin:0 0 20px;">${giornoSett(e.data)} ${dataPunti(e.data)} · ${orari(e.data, e.dataFine)} · ${escapeHtml(luogoTesto(e))}</p>
  ${extra}
  <p style="font:400 14px/22px Arial,sans-serif;margin:0;color:#e1d7c9;">
    <span style="color:#a39e95;">Tavolo</span> ${escapeHtml([t.nome, t.zona].filter(Boolean).join(' · '))}<br>
    <span style="color:#a39e95;">A nome di</span> ${escapeHtml(`${p.nome} ${p.cognome}`)}<br>
    <span style="color:#a39e95;">Persone</span> ${p.persone}<br>
    <span style="color:#a39e95;">Lista</span> ${escapeHtml(v.lista)}<br>
    <span style="color:#d55b23;">Spesa minima ${euro(p.spesaMinima)}</span>
  </p>
</div>`;
}

/** Subito dopo la richiesta: il tavolo è fermo, ma va pagato entro il termine. */
export async function inviaRichiestaTavolo(v: PrenotazioneVista, origine: string) {
  const { prenotazione: p, evento: e, tavolo: t } = v;
  if (p.pagamentoOnline) {
    // Inserita dal PR con il pagamento online: al cliente arriva il link per pagare.
    const online = `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">Ciao ${escapeHtml(p.nome)}, ${escapeHtml(v.lista)} ha fermato per te il tavolo ${escapeHtml(t.nome)}. Per confermarlo paga online la spesa minima di <strong>${euro(p.spesaMinima)}</strong> entro <strong>${quandoScade(p.scade)}</strong>: con carta, Apple Pay o Google Pay. Subito dopo ti arriva il QR del tavolo.</p>
<p style="font:400 14px/20px Arial,sans-serif;color:#a39e95;margin:0 0 24px;">Se non paghi entro il termine il tavolo torna libero.</p>
${riquadro(v, '')}
${bottoneEmail(linkPagamento(origine, p.id, p.email), `Paga ${euro(p.spesaMinima)} →`)}`;
    await inviaEmail({ a: p.email, oggetto: `Paga il tuo tavolo · ${e.nome} ${dataPunti(e.data)}`, html: guscioEmail('Tavolo fermo.', online) });
    return;
  }
  // TODO: cliente — come si paga l'anticipo (bonifico, Satispay, contanti al PR) e a chi.
  const corpo = `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">Ciao ${escapeHtml(p.nome)}, il tavolo ${escapeHtml(t.nome)} è fermo a tuo nome. Per confermarlo va pagata in anticipo la spesa minima di <strong>${euro(p.spesaMinima)}</strong> entro <strong>${quandoScade(p.scade)}</strong>: ti contattiamo noi al ${escapeHtml(p.telefono)} per il pagamento.</p>
<p style="font:400 14px/20px Arial,sans-serif;color:#a39e95;margin:0 0 24px;">Se il pagamento non arriva entro il termine la prenotazione decade e il tavolo torna libero.</p>
${riquadro(v, '')}
${bottoneEmail(linkTavolo(origine, p.id, p.email), 'Vedi la prenotazione →')}`;
  await inviaEmail({ a: p.email, oggetto: `Tavolo in attesa di pagamento · ${e.nome} ${dataPunti(e.data)}`, html: guscioEmail('Tavolo fermo.', corpo) });
}

/**
 * Agli admin, appena arriva una richiesta: altrimenti la scoprono solo aprendo la serata.
 * Con il pagamento online arriva quando il tavolo è pagato (non c'è niente da fare) o se il pagamento va rimborsato.
 */
export async function inviaAvvisoAdmin(v: PrenotazioneVista, destinatari: string[], origine: string, caso: 'richiesta' | 'pagato_online' | 'da_rimborsare' = 'richiesta') {
  const { prenotazione: p, evento: e, tavolo: t } = v;
  const chi = `${escapeHtml(`${p.nome} ${p.cognome}`)}`;
  const pr = p.inseritaDa === 'pr' ? ` (inserita dal PR ${escapeHtml(v.lista)})` : '';
  const frase = {
    richiesta: `${chi} ha chiesto il tavolo ${escapeHtml(t.nome)} per ${escapeHtml(e.nome)}${pr}. Resta fermo fino a <strong>${quandoScade(p.scade)}</strong>: quando ricevi i ${euro(p.spesaMinima)} segna il pagamento.`,
    pagato_online: `${chi} ha pagato online il tavolo ${escapeHtml(t.nome)} per ${escapeHtml(e.nome)}${pr}: ${euro(p.spesaMinima)}. È confermato e il QR è partito, non serve fare niente.`,
    da_rimborsare: `${chi} ha pagato online ${euro(p.spesaMinima)} per il tavolo ${escapeHtml(t.nome)} quando la prenotazione era già chiusa e il tavolo non era più suo. <strong>Va rimborsato</strong>: lo trovi nello storico dei tavoli della serata.`,
  }[caso];
  const oggetto = {
    richiesta: `Nuova richiesta tavolo ${t.nome}`, pagato_online: `Tavolo ${t.nome} pagato online`, da_rimborsare: `Da rimborsare: tavolo ${t.nome}`,
  }[caso];
  const corpo = `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">${frase}</p>
${riquadro(v, '')}
<p style="font:400 14px/22px Arial,sans-serif;margin:0 0 24px;color:#e1d7c9;">Telefono ${escapeHtml(p.telefono)} · ${escapeHtml(p.email)}</p>
${bottoneEmail(`${origine}/admin/eventi/${e.id}/modifica#tavoli`, 'Apri i tavoli →')}`;
  for (const a of destinatari) {
    await inviaEmail({ a, oggetto: `${oggetto} · ${e.nome} ${dataPunti(e.data)}`, html: guscioEmail(caso === 'da_rimborsare' ? 'Da rimborsare.' : caso === 'pagato_online' ? 'Tavolo pagato.' : 'Richiesta tavolo.', corpo) });
  }
}

/** Al cliente, quando il termine si avvicina e il pagamento non è ancora arrivato. */
export async function inviaPromemoriaTavolo(v: PrenotazioneVista, origine: string) {
  const { prenotazione: p, evento: e, tavolo: t } = v;
  const corpo = `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">Ciao ${escapeHtml(p.nome)}, il tavolo ${escapeHtml(t.nome)} per ${escapeHtml(e.nome)} è ancora in attesa del pagamento di <strong>${euro(p.spesaMinima)}</strong>. Il termine è <strong>${quandoScade(p.scade)}</strong>: dopo, la prenotazione decade e il tavolo torna libero.</p>
${riquadro(v, '')}
${bottoneEmail(linkTavolo(origine, p.id, p.email), 'Vedi la prenotazione →')}`;
  await inviaEmail({ a: p.email, oggetto: `Il tuo tavolo sta per scadere · ${e.nome} ${dataPunti(e.data)}`, html: guscioEmail('Manca poco.', corpo) });
}

/** Richiesta inserita dal PR, ancora da pagare: al cliente il link per pagare, al PR l'avviso per scrivergli. */
export async function inviaPromemoriaRichiestaPr(v: PrenotazioneVista, emailPr: string | null, origine: string) {
  const { prenotazione: p, evento: e, tavolo: t } = v;
  const cliente = `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">Ciao ${escapeHtml(p.nome)}, il tavolo ${escapeHtml(t.nome)} per ${escapeHtml(e.nome)} è ancora fermo per te fino a <strong>${quandoScade(p.scade)}</strong>. Paga ora la spesa minima di <strong>${euro(p.spesaMinima)}</strong> e ti arriva subito il QR: dopo il termine il tavolo torna libero.</p>
${riquadro(v, '')}
${bottoneEmail(linkPagamento(origine, p.id, p.email), `Paga ${euro(p.spesaMinima)} →`)}`;
  await inviaEmail({ a: p.email, oggetto: `Il tuo tavolo ti aspetta · ${e.nome} ${dataPunti(e.data)}`, html: guscioEmail('Manca il pagamento.', cliente) });
  if (!emailPr) return;
  const pr = `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">${escapeHtml(`${p.nome} ${p.cognome}`)} non ha ancora pagato il tavolo ${escapeHtml(t.nome)} che hai fermato per ${escapeHtml(e.nome)}. Scade <strong>${quandoScade(p.scade)}</strong>, poi torna libero: scrivi a ${escapeHtml(p.nome)} al <strong>${escapeHtml(p.telefono)}</strong>. Il link per pagare l'abbiamo appena rimandato per email.</p>
${riquadro(v, '')}
${bottoneEmail(`${origine}/pr`, 'Apri i tuoi tavoli →')}`;
  await inviaEmail({ a: emailPr, oggetto: `Da pagare: tavolo ${t.nome} di ${p.nome} · ${e.nome} ${dataPunti(e.data)}`, html: guscioEmail('Tavolo non pagato.', pr) });
}

/** La prenotazione è chiusa: decaduta senza pagamento, annullata dalla crew o rimborsata. Così nessuno arriva convinto di avere il tavolo. */
export async function inviaChiusuraTavolo(v: PrenotazioneVista, origine: string) {
  const { prenotazione: p, evento: e, tavolo: t } = v;
  const testi = {
    scaduta: ['Tavolo tornato libero.', `il pagamento della spesa minima per il tavolo ${escapeHtml(t.nome)} non è arrivato entro il termine, quindi la prenotazione è decaduta e il tavolo è tornato libero. Se hai già pagato, rispondi a questa email: controlliamo noi.`, 'Prenotazione decaduta'],
    annullata: ['Prenotazione annullata.', `la prenotazione del tavolo ${escapeHtml(t.nome)} è stata annullata e il QR non vale più. Per qualsiasi dubbio rispondi a questa email.`, 'Prenotazione annullata'],
    rimborsata: ['Tavolo rimborsato.', `la prenotazione del tavolo ${escapeHtml(t.nome)} è stata annullata e ti abbiamo restituito ${euro(p.spesaMinima)}. Il QR non vale più.`, 'Tavolo rimborsato'],
  } as const;
  if (p.stato !== 'scaduta' && p.stato !== 'annullata' && p.stato !== 'rimborsata') return;
  const [titolo, frase, oggetto] = testi[p.stato];
  const corpo = `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">Ciao ${escapeHtml(p.nome)}, ${frase}</p>
${riquadro(v, '')}
${bottoneEmail(`${origine}/tavoli/${e.slug}`, 'Vedi i tavoli liberi →')}`;
  await inviaEmail({ a: p.email, oggetto: `${oggetto} · ${e.nome} ${dataPunti(e.data)}`, html: guscioEmail(titolo, corpo) });
}

/** Pagamento ricevuto: arriva il QR del tavolo, uno per tutto il gruppo. */
export async function inviaConfermaTavolo(v: PrenotazioneVista, origine: string) {
  const { prenotazione: p, evento: e, tavolo: t } = v;
  const qr = `
  <img src="cid:qr" width="280" height="280" alt="QR del tavolo" style="display:block;width:280px;height:280px;margin:0 auto 12px;border-radius:2px;">
  <p style="font:500 22px/26px 'Courier New',monospace;letter-spacing:.1em;text-align:center;margin:0 0 20px;color:#e1d7c9;">${mostraCodice(p.codice)}</p>`;
  const corpo = `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">Pagamento ricevuto, ${escapeHtml(p.nome)}: il tavolo ${escapeHtml(t.nome)} è vostro. Alla porta basta questo QR per tutto il gruppo (${p.persone} persone).</p>
${riquadro(v, qr)}
${bottoneEmail(linkTavolo(origine, p.id, p.email), 'Apri il QR del tavolo →')}`;
  await inviaEmail({
    a: p.email,
    oggetto: `Tavolo confermato · ${e.nome} ${dataPunti(e.data)}`,
    html: guscioEmail('Tavolo confermato.', corpo),
    immagini: [{ cid: 'qr', dataUrl: await qrPng(p.tokenQr) }],
  });
}
