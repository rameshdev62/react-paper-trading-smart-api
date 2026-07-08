import { query } from "../db";

export async function getMarginRequired(
  userId: string,
  price: number,
  quantity: number,
): Promise<number> {
  return price * quantity;
}

export async function validateBalance(
  userId: string,
  requiredMargin: number,
): Promise<{ valid: boolean; available: number; message?: string }> {
  const accountRes = await query('SELECT * FROM "PaperAccount" WHERE "userId" = $1', [userId]);
  let account = accountRes.rows[0];
  if (!account) {
    account = await createAccount(userId);
  }

  if (account.availableBalance < requiredMargin) {
    return {
      valid: false,
      available: account.availableBalance,
      message: `Insufficient balance. Required: ₹${requiredMargin.toFixed(2)}, Available: ₹${account.availableBalance.toFixed(2)}`,
    };
  }

  return { valid: true, available: account.availableBalance };
}

export async function createAccount(userId: string) {
  const uuid = require("crypto").randomUUID();
  const result = await query(
    'INSERT INTO "PaperAccount" (id, "userId", balance, "availableBalance", "updatedAt") VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
    [uuid, userId, 1000000.0, 1000000.0]
  );
  return result.rows[0];
}
