import { getServiceClient } from "../db";

const supabase = getServiceClient();

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
  const { data: accounts, error } = await supabase
    .from("PaperAccount")
    .select("*")
    .eq("userId", userId)
    .limit(1);
  if (error) throw error;
  let account = accounts?.[0];
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
  const { data: accounts, error } = await supabase
    .from("PaperAccount")
    .insert({
      id: uuid,
      userId,
      balance: 1000000.0,
      availableBalance: 1000000.0,
      updatedAt: new Date().toISOString(),
    })
    .select();
  if (error) throw error;
  return accounts?.[0];
}
