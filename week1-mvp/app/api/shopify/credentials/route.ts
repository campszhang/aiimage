import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getShopifyCredential,
  upsertShopifyCredential,
} from "@/lib/products-db";

export const runtime = "nodejs";

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
            accessTokenMask: maskSecret(row.access_token),
            updatedAt: row.updated_at,
          }
        : {
            hasCredential: false,
            shopDomain: "",
            apiVersion: "2024-10",
            accessTokenMask: "",
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
      api_version?: unknown;
    };
    const shopDomain = normalizeShopDomain(body.shop_domain);
    const accessToken =
      typeof body.access_token === "string" ? body.access_token.trim() : "";
    const apiVersion =
      typeof body.api_version === "string" && body.api_version.trim()
        ? body.api_version.trim().slice(0, 20)
        : "2024-10";

    if (!shopDomain) {
      return NextResponse.json(
        { error: "请填写 Shopify 店铺域名，例如 peterhanun.myshopify.com" },
        { status: 400 },
      );
    }
    if (!accessToken) {
      return NextResponse.json(
        { error: "请填写 Shopify Admin API access token" },
        { status: 400 },
      );
    }
    if (!/^shpat_|^shpca_|^shppa_|^shpss_|^[A-Za-z0-9_\\-]{20,}$/.test(accessToken)) {
      return NextResponse.json(
        { error: "Shopify token 格式看起来不正确，请复制 Admin API access token 明文" },
        { status: 400 },
      );
    }

    upsertShopifyCredential({
      userId: user.id,
      shopDomain,
      accessToken,
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
            accessTokenMask: maskSecret(row.access_token),
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

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(Math.max(0, value.length - 8))}${value.slice(-4)}`;
}
