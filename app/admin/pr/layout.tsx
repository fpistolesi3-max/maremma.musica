import { Suspense } from 'react';
import { NavPr } from '@/components/pr-nav';

/** Una sola sezione "PR": l'elenco con gli inviti e i link, il dettaglio di un PR e i canali di chi arriva senza PR. */
export default function LayoutPr({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense><NavPr /></Suspense>
      {children}
    </>
  );
}
