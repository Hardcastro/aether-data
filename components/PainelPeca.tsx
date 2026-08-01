"use client";

import { forwardRef } from "react";
import Link from "next/link";
import type { Peca } from "@/lib/manifesto";

type Contato = { email: string | null; whatsapp: string | null };

type Props = {
  peca: Peca;
  contato: Contato;
  /** Progressive enhancement: sem JS, o link abaixo fecha por navegação normal. */
  onFechar?: () => void;
};

export const PainelPeca = forwardRef<HTMLDivElement, Props>(function PainelPeca(
  { peca, contato, onFechar },
  ref
) {
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="painel-titulo"
      className="vidro pointer-events-auto absolute inset-x-4 top-20 z-30 mx-auto max-w-xl rounded-panel p-6 sm:p-8 md:inset-x-auto md:left-1/2 md:w-[36rem] md:-translate-x-1/2"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-body-sm font-medium uppercase tracking-wide text-text-secondary">
          {peca.stack.join(" · ")}
        </p>
        <Link
          href="/"
          scroll={false}
          aria-label="Fechar peça"
          className="rounded-control p-1.5 text-text-muted transition-colors duration-[0.18s] ease-out hover:text-text-primary"
          onClick={(e) => {
            if (onFechar) {
              e.preventDefault();
              onFechar();
            }
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M5 5L15 15M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </div>

      <h2 id="painel-titulo" className="mt-3 text-h3 font-medium text-text-primary">
        {peca.nome}
      </h2>
      <p className="mt-2 text-lead text-text-secondary">{peca.capacidade}</p>

      <div className="mt-5 space-y-3">
        {peca.oQueProva.map((paragrafo, i) => (
          <p key={i} className="text-body-sm leading-relaxed text-text-muted">
            {paragrafo}
          </p>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={peca.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-control bg-clay-primary px-4 py-2 text-body-sm font-medium text-clay-primary-ink shadow-clay transition-shadow duration-[0.18s] ease-out hover:shadow-clay-active"
        >
          Ver no ar ↗
        </a>
        {peca.repo && (
          <a
            href={peca.repo}
            target="_blank"
            rel="noreferrer"
            className="rounded-control border border-glass-solid-border px-4 py-2 text-body-sm font-medium text-text-primary transition-colors duration-[0.18s] ease-out hover:bg-bg-solid"
          >
            Ver código ↗
          </a>
        )}
      </div>

      {(contato.email || contato.whatsapp) && (
        <div className="mt-6 flex flex-wrap gap-4 border-t border-glass-solid-border pt-4 text-body-sm">
          {contato.whatsapp && (
            <a
              href={`https://wa.me/${contato.whatsapp}`}
              className="text-text-secondary underline-offset-4 hover:underline"
            >
              WhatsApp
            </a>
          )}
          {contato.email && (
            <a
              href={`mailto:${contato.email}`}
              className="text-text-secondary underline-offset-4 hover:underline"
            >
              {contato.email}
            </a>
          )}
        </div>
      )}
    </div>
  );
});
