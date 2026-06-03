import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/users/:id
 * body 字段任选：display_name / role / password / monthly_budget_cny / is_unlimited
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id 不合法" }, { status: 400 });
    }
    const body = (await req.json()) as {
      display_name?: string;
      role?: string;
      password?: string;
      monthly_budget_cny?: number;
      is_unlimited?: boolean;
      budget_notes?: string;
    };

    const db = getDb();
    const existing = db
      .prepare(`SELECT id FROM users WHERE id = ?`)
      .get(id) as { id: number } | undefined;
    if (!existing) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const userUpdates: string[] = [];
    const userValues: unknown[] = [];
    if (typeof body.display_name === "string") {
      userUpdates.push("display_name = ?");
      userValues.push(body.display_name.trim() || null);
    }
    if (body.role === "admin" || body.role === "user") {
      userUpdates.push("role = ?");
      userValues.push(body.role);
    }
    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { error: "密码至少 6 位" },
          { status: 400 },
        );
      }
      const hashed = await hashPassword(body.password);
      userUpdates.push("password_hash = ?");
      userValues.push(hashed);
    }

    const tx = db.transaction(() => {
      if (userUpdates.length > 0) {
        db.prepare(
          `UPDATE users SET ${userUpdates.join(", ")} WHERE id = ?`,
        ).run(...userValues, id);
      }
      // 预算 upsert
      if (
        typeof body.monthly_budget_cny === "number" ||
        typeof body.is_unlimited === "boolean" ||
        typeof body.budget_notes === "string"
      ) {
        db.prepare(
          `INSERT INTO user_budgets (user_id, monthly_budget_cny, is_unlimited, notes)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             monthly_budget_cny = COALESCE(excluded.monthly_budget_cny, monthly_budget_cny),
             is_unlimited = COALESCE(excluded.is_unlimited, is_unlimited),
             notes = COALESCE(excluded.notes, notes),
             updated_at = unixepoch()`,
        ).run(
          id,
          body.monthly_budget_cny ?? 0,
          body.is_unlimited !== false ? 1 : 0,
          body.budget_notes?.trim() || null,
        );
      }
    });
    tx();

    const row = db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.role, u.created_at,
                b.monthly_budget_cny, b.is_unlimited, b.notes AS budget_notes
         FROM users u LEFT JOIN user_budgets b ON b.user_id = u.id
         WHERE u.id = ?`,
      )
      .get(id);
    return NextResponse.json(row);
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}

/**
 * DELETE /api/admin/users/:id
 * 注意：不会删除该用户的 usage_records（留作审计）
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id 不合法" }, { status: 400 });
    }
    if (id === admin.id) {
      return NextResponse.json(
        { error: "不能删除自己" },
        { status: 400 },
      );
    }
    const db = getDb();
    const exists = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id);
    if (!exists) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }
    // 外键开启状态下直接删会被挡。事务里先解开依赖：
    //   · 内容资产（created_by / 归属 user_id，均可空）置 NULL → 资产保留、仅去掉作者归属
    //   · 该用户的 render_jobs 删除（render_job_items 由 ON DELETE CASCADE 自动清）
    //   · user_budgets 删除，最后删用户
    const tx = db.transaction(() => {
      const nullifyCreatedBy = [
        "colors", "models", "scenes", "prompt_templates", "text_scenes",
        "poses", "expressions", "photography_params", "realism_presets",
        "materials", "announcements",
      ];
      for (const t of nullifyCreatedBy) {
        db.prepare(`UPDATE ${t} SET created_by = NULL WHERE created_by = ?`).run(id);
      }
      db.prepare(`UPDATE generations SET user_id = NULL WHERE user_id = ?`).run(id);
      db.prepare(`UPDATE usage_records SET user_id = NULL WHERE user_id = ?`).run(id);
      db.prepare(`DELETE FROM render_jobs WHERE user_id = ?`).run(id);
      db.prepare(`DELETE FROM user_budgets WHERE user_id = ?`).run(id);
      db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    });
    tx();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}
