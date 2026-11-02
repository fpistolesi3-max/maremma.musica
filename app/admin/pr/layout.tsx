import { Suspense } from 'react';
import { NavPr } from '@/components/pr-nav';

/** La sezione "Canali" del menu: i PR (elenco, inviti, link, anagrafica) e "Social e sito", cioè chi arriva senza PR. */
export default function LayoutPr({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense><NavPr /></Suspense>
      {children}
    </>
  );
}
