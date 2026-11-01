import { redirect } from 'next/navigation';

// La Galleria è stata unita alle Serate passate: chi ha il vecchio indirizzo finisce lì.
export default function Galleria() {
  redirect('/eventi#archivio');
}
