/** Chi si riconosce in una foto può chiedere di toglierla: la scrive all'indirizzo del sito, noi la eliminiamo. */
export function NotaFoto({ serata }: { serata?: string }) {
  const oggetto = encodeURIComponent(`Rimozione foto${serata ? ` · ${serata}` : ''}`);
  return (
    <p className="m-0 text-[14px] leading-5 text-osso-2">
      Ti riconosci e vuoi togliere una foto?{' '}
      <a href={`mailto:maremmamusica@gmail.com?subject=${oggetto}`} className="link-sottolineato">Scrivici</a>.
    </p>
  );
}
