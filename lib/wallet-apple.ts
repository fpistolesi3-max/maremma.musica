import 'server-only';
import { PKPass } from 'passkit-generator';
import { IMMAGINI_PASS } from './wallet-immagini';
import { COLORI_PASS, type CampiPass } from './wallet';

export interface ChiaviApple {
  passTypeId: string;
  teamId: string;
  certificato: Buffer;   // certificato del Pass Type ID (PEM)
  chiave: Buffer;        // chiave privata (PEM)
  password: string;      // password della chiave
  wwdr: Buffer;          // certificato Apple WWDR (PEM)
}

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const daBase64 = (v: string) => Buffer.from(v.trim(), 'base64');

/** Le chiavi dalle variabili d'ambiente (certificati e chiave in base64 del file PEM). */
export function chiaviAppleDaEnv(env: Record<string, string | undefined> = process.env): ChiaviApple {
  return {
    passTypeId: (env.APPLE_PASS_TYPE_ID ?? '').trim(),
    teamId: (env.APPLE_TEAM_ID ?? '').trim(),
    certificato: daBase64(env.APPLE_PASS_CERT_BASE64 ?? ''),
    chiave: daBase64(env.APPLE_PASS_KEY_BASE64 ?? ''),
    password: env.APPLE_PASS_KEY_PASSWORD ?? '',
    wwdr: daBase64(env.APPLE_WWDR_CERT_BASE64 ?? ''),
  };
}

/** Il file .pkpass (un archivio firmato: pass.json, manifest.json, signature e le immagini) per un biglietto. */
export async function creaPkpass(c: CampiPass, chiavi: ChiaviApple): Promise<Buffer> {
  const pass = new PKPass(
    IMMAGINI_PASS,
    { wwdr: chiavi.wwdr, signerCert: chiavi.certificato, signerKey: chiavi.chiave, signerKeyPassphrase: chiavi.password },
    {
      formatVersion: 1,
      passTypeIdentifier: chiavi.passTypeId,
      teamIdentifier: chiavi.teamId,
      serialNumber: c.id,
      organizationName: 'Maremma Musica',
      description: `Biglietto ${c.titolo}`,
      logoText: 'MAREMMA MUSICA',
      backgroundColor: rgb(COLORI_PASS.sfondo),
      foregroundColor: rgb(COLORI_PASS.testo),
      labelColor: rgb(COLORI_PASS.accento),
      sharingProhibited: true,
    },
  );
  pass.type = 'eventTicket';
  // Dopo l'orario limite il pass risulta scaduto; all'apertura porte la serata compare in primo piano.
  pass.setExpirationDate(new Date(c.scadenza));
  pass.setRelevantDate(new Date(c.inizio));
  if (c.coordinate) pass.setLocations({ latitude: c.coordinate.lat, longitude: c.coordinate.lng });
  // Sul pass il QR è lo stesso token della pagina del biglietto, con il codice da dettare sotto.
  pass.setBarcodes({ format: 'PKBarcodeFormatQR', message: c.qr, messageEncoding: 'iso-8859-1', altText: c.codice });

  if (c.numero) pass.headerFields.push({ key: 'numero', label: 'SERATA', value: c.numero });
  pass.primaryFields.push({ key: 'evento', label: 'SERATA', value: c.titolo });
  pass.secondaryFields.push(
    { key: 'giorno', label: 'DATA', value: c.giorno },
    { key: 'orari', label: 'ORARI', value: c.orari, textAlignment: 'PKTextAlignmentRight' },
  );
  pass.auxiliaryFields.push(
    { key: 'titolare', label: 'TITOLARE', value: c.titolare },
    ...(c.validaFinoAlle ? [{ key: 'limite', label: 'VALIDA FINO ALLE', value: c.validaFinoAlle, textAlignment: 'PKTextAlignmentRight' as const }] : []),
  );
  pass.backFields.push(
    { key: 'luogo', label: 'Luogo', value: c.testoLuogo },
    ...(c.tipo ? [{ key: 'tipo', label: 'Tipo di prevendita', value: c.tipo }] : []),
    { key: 'lista', label: 'Lista', value: c.lista },
    { key: 'codice', label: 'Codice da dettare se il QR non si legge', value: c.codice },
    { key: 'regole', label: 'Alla porta', value: `Mostra il QR con un documento.${c.validaFinoAlle ? ` Valida per entrare entro le ${c.validaFinoAlle}.` : ''} Il QR si controlla sempre alla porta: un biglietto annullato o rimborsato non entra.` },
  );
  return pass.getAsBuffer();
}
