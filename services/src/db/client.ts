import postgres from "postgres";

// Roster ciphertext, push tokens, gas grants and the reminder dedup log —
// nothing that could move funds. Every other truth lives onchain or in Envio.
export function createDbClient(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 10 });
}
