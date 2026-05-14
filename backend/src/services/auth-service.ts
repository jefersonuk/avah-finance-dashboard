import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "avah-dev-secret-change-me";
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? "12h") as jwt.SignOptions["expiresIn"];

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: string;
  company_id: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}
