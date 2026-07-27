import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// GET /api/sources                  — 전체 출처 (카테고리 이름 포함, 카테고리+가중치 정렬)
// GET /api/sources?categoryId=xxx   — 특정 카테고리 출처 (기사 정렬용)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");

    const supabase = createServerClient();

    let query = supabase
      .from("sources")
      .select("*, categories(id, name)"); // LEFT JOIN — 카테고리 삭제 후에도 출처 유지

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (categoryId) query = (query as any).eq("category_id", categoryId);

    const { data, error } = await query;
    if (error) throw error;

    // 카테고리명 ASC (삭제된 카테고리는 category_name 사용, null은 맨 뒤) → 가중치 DESC → 우선순위 ASC
    const sorted = (data ?? []).sort((a, b) => {
      const catA = (a as { categories?: { name?: string }; category_name?: string }).categories?.name
        ?? (a as { category_name?: string }).category_name ?? "";
      const catB = (b as { categories?: { name?: string }; category_name?: string }).categories?.name
        ?? (b as { category_name?: string }).category_name ?? "";
      if (!catA && catB) return 1;
      if (catA && !catB) return -1;
      const catCmp = catA.localeCompare(catB, "ko");
      if (catCmp !== 0) return catCmp;
      const wDiff = (b.weight ?? 0) - (a.weight ?? 0);
      if (wDiff !== 0) return wDiff;
      return (a.priority ?? 0) - (b.priority ?? 0);
    });

    return NextResponse.json({ sources: sorted });
  } catch (err) {
    console.error("[GET /api/sources]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/sources — 출처 추가
export async function POST(req: NextRequest) {
  try {
    const { category_id, category_name, classification, name, description, url, weight, priority } = await req.json();
    if (!category_id || !name?.trim() || !classification?.trim() || !description?.trim()) {
      return NextResponse.json({ error: "category_id, classification, name, description 필요" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("sources")
      .insert({
        category_id,
        category_name: category_name?.trim() || null,
        classification: classification.trim(),
        name: name.trim(),
        description: description.trim(),
        url: url?.trim() || null,
        weight: weight != null ? Math.min(Math.max(Number(weight), 0), 100) : 0,
        priority: priority != null ? Number(priority) : 0,
      })
      .select("*, categories(id, name)")
      .single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "이미 존재하는 출처입니다." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ source: data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/sources]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH /api/sources — 출처 수정 또는 삭제된 카테고리명 일괄 변경
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    // 삭제된 카테고리 이름 일괄 변경
    if (body.action === "rename_deleted_category") {
      const { old_name, new_name } = body as { old_name: string; new_name: string };
      if (!old_name?.trim() || !new_name?.trim()) {
        return NextResponse.json({ error: "old_name, new_name 필요" }, { status: 400 });
      }
      const supabase = createServerClient();
      const { error } = await supabase
        .from("sources")
        .update({ category_name: new_name.trim() })
        .is("category_id", null)
        .eq("category_name", old_name.trim());
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const { id, category_id, category_name, classification, name, description, url, weight, priority } = body;
    if (!id || !name?.trim() || !classification?.trim() || !description?.trim()) {
      return NextResponse.json({ error: "id, classification, name, description 필요" }, { status: 400 });
    }

    const supabase = createServerClient();
    const updateData: Record<string, unknown> = {
      classification: classification.trim(),
      name: name.trim(),
      description: description.trim(),
      url: url?.trim() || null,
      weight: weight != null ? Math.min(Math.max(Number(weight), 0), 100) : 0,
      priority: priority != null ? Number(priority) : 0,
    };
    if (category_id) {
      updateData.category_id = category_id;
      updateData.category_name = category_name?.trim() || null;
    }

    const { data, error } = await supabase
      .from("sources")
      .update(updateData)
      .eq("id", id)
      .select("*, categories(id, name)")
      .single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "이미 존재하는 출처명입니다." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ source: data });
  } catch (err) {
    console.error("[PATCH /api/sources]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/sources?id=xxx — 출처 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

    const supabase = createServerClient();
    const { error } = await supabase.from("sources").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/sources]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
