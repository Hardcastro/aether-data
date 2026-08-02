import { GRUPOS_COM_PECAS, PECAS, pecasPorGrupo } from "@/lib/manifesto";

type Props = {
  email: string | null;
  whatsapp: string | null;
};

/**
 * Barra de vidro no topo. Os itens da navegação são os grupos que têm peça —
 * um grupo vazio nunca é desenhado, a mesma regra do manifesto. Cada um é um
 * link real para a primeira peça daquele grupo, então funciona sem script.
 */
export function Cabecalho({ email, whatsapp }: Props) {
  const contato = whatsapp ? `https://wa.me/${whatsapp}` : email ? `mailto:${email}` : null;

  return (
    <header className="header">
      <div className="logo">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 7.5v9M7.5 12h9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <span>AEther Data</span>
      </div>

      <nav className="nav" aria-label="Competências">
        <a className="nav-item" href={`/?peca=${PECAS[0].slug}`}>
          Tudo
        </a>
        {GRUPOS_COM_PECAS.map((g) => (
          <a key={g.chave} className="nav-item" href={`/?peca=${pecasPorGrupo(g.chave)[0].slug}`}>
            {g.titulo}
          </a>
        ))}
      </nav>

      {contato ? (
        <a className="contact-btn" href={contato}>
          Falar comigo
        </a>
      ) : (
        /* Regra do vazio: sem canal cadastrado, nada é desenhado no lugar. */
        <span />
      )}
    </header>
  );
}
