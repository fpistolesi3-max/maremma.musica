import { richiedi } from '@/lib/sessione';
import { prossimoNumero, serateConTavoli, tuttiIPr } from '@/lib/dati/admin';
import { TestataAdmin } from '@/components/admin/ui';
import { FormSerata } from '@/components/admin/form-serata';

export const metadata = { title: 'Nuova serata' };

export default async function NuovaSerata() {
  const s = await richiedi(['admin'], '/admin/eventi/nuovo');
  const [numero, pr, conTavoli] = await Promise.all([prossimoNumero(s), tuttiIPr(s), serateConTavoli(s)]);
  return (
    <>
      <TestataAdmin briciole="SERATE / NUOVA" titolo="Nuova serata" />
      <FormSerata copiaTavoliDa={conTavoli} pr={pr.map((p) => ({ id: p.pr.id, nome: p.pr.nomeDisplay, stato: p.pr.stato }))} v={{
        id: null, numero: String(numero), nome: '', slug: '', giorno: '', apertura: '23:00', chiusura: '04:00', lineup: '', highlight: '',
        dressCode: '', descrizione: '', location: '', comune: '', lat: '', lng: '', locationSegreta: false, infoArrivo: '',
        tipoIngresso: 'lista', prezzoLista: '10', prezzoPrimoTipo: '10', cassaAttiva: true, senzaTelefono: false, inCopertina: false, prezzoCassa: '', etaMinima: '18', locandinaUrl: '', pubblicato: false, prAbilitati: null,
      }} />
      <p className="m-0 border-t border-linea px-4 py-6 text-[14px] text-osso-2 md:px-12">Tipi di prevendita e tavoli si aggiungono dopo il primo salvataggio, nella pagina della serata.</p>
    </>
  );
}
