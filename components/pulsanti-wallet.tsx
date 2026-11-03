// Pulsanti "Aggiungi al Wallet", ricreati seguendo le linee guida di Apple (badge nero con filo chiaro, icona Wallet, "Aggiungi ad Apple Wallet")
// e di Google (pulsante nero con il logo Google Wallet). Link semplici: i controlli sono nelle route /api/biglietto/[id]/wallet/…

export type WalletDisponibili = { apple: boolean; google: boolean; primaGoogle: boolean };

const base = 'inline-flex h-12 w-full items-center justify-center gap-3 rounded-[8px] bg-black px-4 text-white no-underline hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-osso';

function IconaAppleWallet() {
  return (
    <svg width="30" height="24" viewBox="0 0 30 24" aria-hidden="true" focusable="false">
      <rect x="1" y="2" width="28" height="20" rx="3.5" fill="#fff" />
      <rect x="1" y="2" width="28" height="5.2" rx="2.6" fill="#ff9f0a" />
      <rect x="1" y="7.6" width="28" height="4.4" fill="#34c759" />
      <rect x="1" y="12.4" width="28" height="4.4" fill="#0a84ff" />
      <rect x="1" y="17.2" width="28" height="4.8" rx="2.4" fill="#ff453a" />
      <rect x="1" y="2" width="28" height="20" rx="3.5" fill="none" stroke="#0c0f14" strokeWidth="1.2" />
    </svg>
  );
}

function IconaGoogleWallet() {
  return (
    <svg width="28" height="24" viewBox="0 0 28 24" aria-hidden="true" focusable="false">
      <path d="M3 5.5A3.5 3.5 0 0 1 6.5 2H22l-1.3 3.5H6.5A.5.5 0 0 0 6 6v.5L3 7.5Z" fill="#ea4335" />
      <path d="M3 7.5 6 6.5h17.5A2.5 2.5 0 0 1 26 9v2H3Z" fill="#fbbc04" />
      <path d="M3 11h23v8.5a2.5 2.5 0 0 1-2.5 2.5h-18A2.5 2.5 0 0 1 3 19.5Z" fill="#34a853" />
      <path d="M26 13.2h-6.2a2.3 2.3 0 0 0 0 4.6H26Z" fill="#4285f4" />
      <circle cx="20.3" cy="15.5" r="1" fill="#fff" />
    </svg>
  );
}

export function PulsantiWallet({ id, query, wallet }: { id: string; query: string; wallet: WalletDisponibili }) {
  const apple = wallet.apple && (
    <a key="apple" href={`/api/biglietto/${id}/wallet/apple${query}`} className={`${base} border border-[#a6a6a6]`} aria-label="Aggiungi ad Apple Wallet">
      <IconaAppleWallet />
      <span className="flex flex-col items-start font-sans leading-none" style={{ fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
        <span className="text-[10px] tracking-[.01em]">Aggiungi ad</span>
        <span className="mt-[2px] text-[19px] font-medium tracking-[-.01em]">Apple Wallet</span>
      </span>
    </a>
  );
  const google = wallet.google && (
    <a key="google" href={`/api/biglietto/${id}/wallet/google${query}`} className={`${base} border border-[#747775]`} aria-label="Salva in Google Wallet">
      <IconaGoogleWallet />
      <span className="text-[15px] font-medium leading-none" style={{ fontFamily: '"Google Sans", Roboto, Arial, sans-serif' }}>Salva in Google Wallet</span>
    </a>
  );
  if (!apple && !google) return null;
  return <div className="flex flex-col gap-3" data-wallet>{wallet.primaGoogle ? [google, apple] : [apple, google]}</div>;
}
