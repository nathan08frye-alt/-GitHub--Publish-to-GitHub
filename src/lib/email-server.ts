import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing server setting: ${name}`);
  }

  return value;
}

export function emailSettings() {
  return {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    redirectUri: required("GOOGLE_REDIRECT_URI"),
    appUrl: new URL(required("APP_URL")).origin,
  };
}

export function adminDatabase() {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

function encryptionKey(): Buffer {
  const key = required("EMAIL_TOKEN_ENCRYPTION_KEY");

  if (!/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error(
      "EMAIL_TOKEN_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters."
    );
  }

  return Buffer.from(key, "hex");
}

export function encryptToken(
  token: string,
  userId: string,
  provider: string
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);

  // Bind the encrypted token to its owner and email provider.
  cipher.setAAD(Buffer.from(`${userId}:${provider}`, "utf8"));

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptToken(
  value: string,
  userId: string,
  provider: string
): string {
  const parts = value.split(".");

  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted connection token.");
  }

  const [, iv, tag, encrypted] = parts;

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url")
  );

  decipher.setAAD(Buffer.from(`${userId}:${provider}`, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice(7);

  if (!token) return null;

  const { data, error } = await adminDatabase().auth.getUser(token);

  if (error || !data.user) return null;

  return data.user;
}

export function hasValidOrigin(request: Request): boolean {
  return request.headers.get("origin") === emailSettings().appUrl;
}