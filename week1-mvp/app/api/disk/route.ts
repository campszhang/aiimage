import { NextResponse } from "next/server";
import { statfs } from "fs/promises";
import { DATA_DIR_PATH } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/disk
 * 读取 DATA_DIR 所在文件系统的磁盘容量（用于历史页 header 展示）。
 * 返回字节数：{ total, used, free }
 */
export async function GET() {
  try {
    await requireUser();
    const s = await statfs(DATA_DIR_PATH);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    const used = Math.max(0, total - free);
    return NextResponse.json({ total, used, free });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}
