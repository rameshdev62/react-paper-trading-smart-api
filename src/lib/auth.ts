import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "paper-trading-app-jwt-secret-key-321-123";

export function signToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch (error) {
    return null;
  }
}

export async function getAuthUser(req: Request): Promise<{ userId: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    return verifyToken(token);
  }

  // Fallback to query parameter token for SSE EventSource compatibility
  try {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get("token");
    if (queryToken) {
      return verifyToken(queryToken);
    }
  } catch (err) {
    // URL parsing might fail if req.url is relative or invalid
  }

  return null;
}
