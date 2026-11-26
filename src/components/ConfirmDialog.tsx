"use client";

import { AlertTriangle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/**
 * Diálogo de confirmação acessível, no lugar do confirm() nativo:
 * - anunciado por leitores de tela (role="alertdialog" com título e descrição);
 * - foco vai para o diálogo e volta para onde estava ao fechar;
 * - Tab fica preso dentro do diálogo; Esc ou clique fora cancelam.
 *
 * Uso: const confirmar = useConfirm(); if (!(await confirmar({ ... }))) return;
 */

export interface OpcoesConfirmacao {
  titulo: string;
  mensagem: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Ação destrutiva: botão vermelho e foco inicial em "Cancelar". */
  perigo?: boolean;
}

type Confirmar = (opcoes: OpcoesConfirmacao) => Promise<boolean>;

const ConfirmContext = createContext<Confirmar | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<
    (OpcoesConfirmacao & { resolver: (resposta: boolean) => void }) | null
  >(null);

  const confirmar = useCallback<Confirmar>(
    (opcoes) => new Promise<boolean>((resolver) => setPedido({ ...opcoes, resolver })),
    [],
  );

  const responder = (resposta: boolean) => {
    pedido?.resolver(resposta);
    setPedido(null);
  };

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {pedido && <Dialogo opcoes={pedido} onResponder={responder} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirmar {
  const confirmar = useContext(ConfirmContext);
  if (!confirmar) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>.");
  return confirmar;
}

function Dialogo({
  opcoes,
  onResponder,
}: {
  opcoes: OpcoesConfirmacao;
  onResponder: (resposta: boolean) => void;
}) {
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    (opcoes.perigo ? cancelarRef : confirmarRef).current?.focus();
    return () => anterior?.focus?.();
  }, [opcoes.perigo]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onResponder(false);
    } else if (e.key === "Tab") {
      // Mantém o foco entre os dois botões.
      e.preventDefault();
      const foco = document.activeElement === cancelarRef.current ? confirmarRef : cancelarRef;
      foco.current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-cacau/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onResponder(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmacao-titulo"
        aria-describedby="confirmacao-mensagem"
        onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-3xl border border-caramelo-200 bg-creme-claro p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          {opcoes.perigo && (
            <span className="rounded-2xl bg-red-100 p-2 text-red-700">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div>
            <h2 id="confirmacao-titulo" className="font-display text-xl font-semibold text-cacau">
              {opcoes.titulo}
            </h2>
            <p id="confirmacao-mensagem" className="mt-2 whitespace-pre-line text-sm text-cacau-suave">
              {opcoes.mensagem}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelarRef}
            type="button"
            onClick={() => onResponder(false)}
            className="cursor-pointer rounded-xl border border-caramelo-200 px-4 py-2 text-sm font-semibold text-cacau hover:bg-caramelo-50"
          >
            {opcoes.textoCancelar ?? "Cancelar"}
          </button>
          <button
            ref={confirmarRef}
            type="button"
            onClick={() => onResponder(true)}
            className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold text-white ${
              opcoes.perigo ? "bg-red-700 hover:bg-red-800" : "bg-caramelo-600 hover:bg-caramelo-700"
            }`}
          >
            {opcoes.textoConfirmar ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
