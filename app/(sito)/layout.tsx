import { Piede, Testata } from '@/components/sito';
import { IntroBrand } from '@/components/intro-brand';
import { scriptIntro } from '@/lib/intro/regole';

export default function LayoutSito({ children }: { children: React.ReactNode }) {
  return (
    <div className="mm-grana flex min-h-dvh flex-col">
      {/* decide se parte l'intro prima del primo disegno (solo pagine pubbliche: le aree riservate hanno altri layout) */}
      <script dangerouslySetInnerHTML={{ __html: scriptIntro() }} />
      <IntroBrand />
      <Testata />
      <main className="flex-grow">{children}</main>
      <Piede />
    </div>
  );
}
