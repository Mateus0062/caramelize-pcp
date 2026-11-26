/**
 * Geração de CSV que o Excel em português abre direto: separador ";",
 * vírgula decimal, quebra de linha CRLF e BOM UTF-8 (acentos corretos).
 */

type Celula = string | number | null | undefined;

/** Número com vírgula decimal e sem separador de milhar (o Excel lê como número). */
export function numeroCsv(valor: number, casas: number): string {
  if (!Number.isFinite(valor)) return "";
  return valor.toFixed(casas).replace(".", ",");
}

function celula(valor: Celula): string {
  if (valor == null) return "";
  let texto = String(valor);
  // Proteção contra "CSV injection": texto que começa com = + - @ seria
  // interpretado como fórmula pela planilha. Números puros (ex.: "-2200,5")
  // não são fórmulas e ficam como estão, para o Excel ler como número.
  const numeroPuro = /^-?\d+(,\d+)?$/.test(texto);
  if (typeof valor === "string" && !numeroPuro && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  if (/[;"\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function gerarCsv(cabecalho: string[], linhas: Celula[][]): string {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

/** Dispara o download do arquivo no navegador. */
export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
