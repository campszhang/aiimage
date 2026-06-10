import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getShopifyCredential,
  upsertShopifyCredential,
} from "@/lib/products-db";

export const runtime = "nodejs";

const DEFAULT_SHOPIFY_API_VERSION = "2026-04";
const CLIENT_CREDENTIAL_PREFIX = "client_credentials:";

export async function GET() {
  try {
    const user = await requireAdmin();
    const row = getShopifyCredential(user.id);
    return NextResponse.json({
      shopify: row
        ? {
            hasCredential: true,
            shopDomain: row.shop_domain,
            apiVersion: row.api_version,
            credentialMode: getCredentialMode(row.access_token),
            accessTokenMask: maskStoredCredential(row.access_token),
            clientIdMask: maskClientId(row.access_token),
            updatedAt: row.updated_at,
          }
        : {
            hasCredential: false,
            shopDomain: "",
            apiVersion: DEFAULT_SHOPIFY_API_VERSION,
            credentialMode: "none",
            accessTokenMask: "",
            clientIdMask: "",
            updatedAt: null,
          },
    });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      shop_domain?: unknown;
      access_token?: unknown;
      client_id?: unknown;
      client_secret?: unknown;
      api_version?: unknown;
    };
    const existing = getShopifyCredential(user.id);
    const shopDomain = normalizeShopDomain(body.shop_domain);
    const accessToken =
      typeof body.access_token === "string" ? body.access_token.trim() : "";
    const clientId =
      typeof body.client_id === "string" ? body.client_id.trim() : "";
    const clientSecret =
      typeof body.client_secret === "string" ? body.client_secret.trim() : "";
    const apiVersion =
      typeof body.api_version === "string" && body.api_version.trim()
        ? body.api_version.trim().slice(0, 20)
        : DEFAULT_SHOPIFY_API_VERSION;

    if (!shopDomain) {
      return NextResponse.json(
        { error: "请填写 Shopify 店铺域名，例如 peterhanun.myshopify.com" },
        { status: 400 },
      );
    }
    const storedCredential = buildStoredCredential({
      accessToken,
      clientId,
      clientSecret,
      existingCredential: existing?.access_token ?? "",
    });
    if (!storedCredential) {
      return NextResponse.json(
        {
          error:
            "请填写 Admin API token，或填写 Shopify 新版 App 的 Client ID + shpss_ Client Secret",
        },
        { status: 400 },
      );
    }
    if (!isValidStoredCredential(storedCredential)) {
      return NextResponse.json(
        {
          error:
            "Shopify 凭证格式不正确：旧版请填 Admin API access token；新版请填 Client ID 和 shpss_ Client Secret",
        },
        { status: 400 },
      );
    }

    upsertShopifyCredential({
      userId: user.id,
      shopDomain,
      accessToken: storedCredential,
      apiVersion,
    });

    const row = getShopifyCredential(user.id);
    return NextResponse.json({
      ok: true,
      shopify: row
        ? {
            hasCredential: true,
            shopDomain: row.shop_domain,
            apiVersion: row.api_version,
            credentialMode: getCredentialMode(row.access_token),
            accessTokenMask: maskStoredCredential(row.access_token),
            clientIdMask: maskClientId(row.access_token),
            updatedAt: row.updated_at,
          }
        : null,
    });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}

function normalizeShopDomain(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function buildStoredCredential(args: {
  accessToken: string;
  clientId: string;
  clientSecret: string;
  existingCredential: string;
}): string {
  if (args.clientSecret || args.clientId) {
    if (!args.clientId || !args.clientSecret) return "";
    return `${CLIENT_CREDENTIAL_PREFIX}${Buffer.from(
      JSON.stringify({
        clientId: args.clientId,
        clientSecret: args.clientSecret,
      }),
      "utf8",
    ).toString("base64url")}`;
  }
  if (args.accessToken) return args.accessToken;
  return args.existingCredential;
}

function isValidStoredCredential(value: string): boolean {
  if (value.startsWith(CLIENT_CREDENTIAL_PREFIX)) {
    const parsed = parseClientCredential(value);
    return Boolean(
      parsed?.clientId &&
        parsed.clientSecret &&
        /^shpss_|^[A-Za-z0-9_\\-]{20,}$/.test(parsed.clientSecret),
    );
  }
  return /^shpat_|^shpca_|^shppa_|^[A-Za-z0-9_\\-]{20,}$/.test(value);
}

function parseClientCredential(
  value: string,
): { clientId: string; clientSecret: string } | null {
  if (!value.startsWith(CLIENT_CREDENTIAL_PREFIX)) return null;
  try {
    const raw = value.slice(CLIENT_CREDENTIAL_PREFIX.length);
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      clientId?: unknown;
      clientSecret?: unknown;
    };
    if (
      typeof parsed.clientId !== "string" ||
      typeof parsed.clientSecret !== "string"
    ) {
      return null;
    }
    return {
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
    };
  } catch {
    return null;
  }
}

function getCredentialMode(value: string): "client_credentials" | "admin_token" {
  return value.startsWith(CLIENT_CREDENTIAL_PREFIX)
    ? "client_credentials"
    : "admin_token";
}

function maskStoredCredential(value: string): string {
  const clientCredential = parseClientCredential(value);
  if (clientCredential) return maskSecret(clientCredential.clientSecret);
  return maskSecret(value);
}

function maskClientId(value: string): string {
  const clientCredential = parseClientCredential(value);
  return clientCredential ? maskSecret(clientCredential.clientId) : "";
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(Math.max(0, value.length - 8))}${value.slice(-4)}`;
}
