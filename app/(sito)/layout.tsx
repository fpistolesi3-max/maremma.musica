import { Piede, Testata } from '@/components/sito';

export default function LayoutSito({ children }: { children: React.ReactNode }) {
  return (
    <div className="mm-grana flex min-h-dvh flex-col">
      <Testata />
      <main className="flex-grow">{children}</main>
      <Piede />
    </div>
  );
}
