import fs from "node:fs";
import path from "node:path";

/**
 * Utilitários do modo local (arquivos JSON em data/). Esse modo existe para
 * desenvolvimento: não suporta várias instâncias nem disco somente leitura
 * (hospedagem serverless).
 */

/**
 * Em produção, a falta de DATABASE_URL é um erro de configuração — não um
 * convite para gravar dados num arquivo local que pode sumir a qualquer
 * momento. Para usar o modo local em produção de propósito (ex.: testar o
 * build), defina ALLOW_LOCAL_DB=true.
 */
export function assertLocalModeAllowed(): void {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DB !== "true") {
    throw new Error(
      "DATABASE_URL não configurada. Em produção o modo local (arquivo JSON) fica desativado: " +
        "configure DATABASE_URL ou, se for intencional, defina ALLOW_LOCAL_DB=true.",
    );
  }
}

/**
 * Grava o JSON de forma atômica: escreve num arquivo temporário e depois o
 * renomeia por cima do original. Se o processo cair no meio, o arquivo
 * antigo continua íntegro em vez de ficar pela metade.
 */
export function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    // No Windows o rename pode falhar se outro programa estiver com o arquivo
    // aberto (antivírus, editor). Nesse caso grava direto e limpa o temporário.
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    fs.rmSync(tmp, { force: true });
    console.warn("[local-store] Gravação atômica indisponível, gravado diretamente:", err);
  }
}
