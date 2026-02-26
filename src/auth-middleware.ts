import { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  orgId?: string;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Validate against your internal auth system
    const claims = validateInternalToken(token);
    req.userId = claims.sub;
    req.orgId = claims.org;
    next();
  } catch {
    res.status(403).json({ error: "Invalid token" });
  }
}

function validateInternalToken(token: string): {
  sub: string;
  org: string;
} {
  // Replace with your actual token validation:
  // - JWT verification against your auth service
  // - API key lookup in your database
  // - Session token validation against Redis
  //
  // This is a placeholder that accepts any token for development.
  // DO NOT use this in production.
  if (!token) {
    throw new Error("Empty token");
  }
  return { sub: "user-123", org: "org-456" };
}
