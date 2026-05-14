import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken, type AuthTokenPayload } from "../services/auth-service.js";

export interface AuthenticatedRequest extends Request {
  auth_user?: AuthTokenPayload;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.header("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Token ausente ou invalido." });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    req.auth_user = verifyAuthToken(token);
    next();
  } catch {
    res.status(401).json({ message: "Token expirado ou invalido." });
  }
}
