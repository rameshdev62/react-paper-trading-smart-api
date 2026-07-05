import { prisma } from "../db";

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
  let account = await prisma.paperAccount.findUnique({ where: { userId } });
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
  return prisma.paperAccount.create({
    data: {
      userId,
      balance: 1000000.0,
      availableBalance: 1000000.0,
    },
  });
}
