"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  email: string | null;
  whatsapp: string | null;
};

/**
 * Barra de vidro no topo. Até 06/08 ela era filtro de competência: cada item
 * levava para a primeira peça de um grupo, e a home era a única página do site.
 *
 * Desde 07/08 é navegação de verdade, porque o site deixou de ser uma tela só.
 * O eixo por competência não morreu — desceu um nível: vira prosa na home e
 * título de seção dentro de /sites e /automacoes. O que ele nunca foi é
 * vocabulário do visitante, e porta de entrada tem que falar a língua de quem
 * chega. Ver `plano-portfolio.md`, "Por que o eixo por capacidade é melhor" —
 * o eixo continua valendo para organizar as peças, só não para navegar.
 */
const ITENS = [
  { href: "/", rotulo: "Home" },
  { href: "/automacoes", rotulo: "Automações" },
  { href: "/sites", rotulo: "Sites" },
  { href: "/sobre", rotulo: "Sobre mim" },
  { href: "/contato", rotulo: "Contatos" },
] as const;

export function Cabecalho({ email, whatsapp }: Props) {
  const pathname = usePathname();
  const contato = whatsapp ? `https://wa.me/${whatsapp}` : email ? `mailto:${email}` : null;

  return (
    <header className="header">
      <Link className="logo" href="/">
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
      </Link>

      <nav className="nav" aria-label="Navegação principal">
        {ITENS.map((item) => {
          /*
            "/" só é atual em correspondência exata — senão a home ficaria
            marcada em todas as rotas, porque toda rota começa com barra.
          */
          const atual = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              className="nav-item"
              href={item.href}
              aria-current={atual ? "page" : undefined}
            >
              {item.rotulo}
            </Link>
          );
        })}
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
