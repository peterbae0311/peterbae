import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// POST /api/subcategories — 서브카테고리 추가
export async function POST(req: NextRequest) {
  try {
    const { category_id, name, tags, description } = await req.json();
    if (!category_id || !name?.trim()) {
      return NextResponse.json({ error: "category_id, name 필요" }, { status: 400 });
    }

    const supabase = createServerClient();

    // 현재 최대 order_num 조회 → 맨 뒤에 추가
    const { data: last } = await supabase
      .from("subcategories")
      .select("order_num")
      .eq("category_id", category_id)
      .order("order_num", { ascending: false })
      .limit(1)
      .maybeSingle();

    const order_num = last ? last.order_num + 1 : 0;

    const { data, error } = await supabase
      .from("subcategories")
      .insert({
        category_id,
        name: name.trim(),
        tags: Array.isArray(tags) ? tags : null,
        description: description?.trim() || null,
        order_num,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ subcategory: data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/subcategories]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH /api/subcategories — 서브카테고리 이름·설명 수정
export async function PATCH(req: NextRequest) {
  try {
    const { id, name, tags, description } = await req.json();
    if (!id || !name?.trim()) {
      return NextResponse.json({ error: "id, name 필요" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("subcategories")
      .update({
        name: name.trim(),
        tags: Array.isArray(tags) ? tags : null,
        description: description ?? null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ subcategory: data });
  } catch (err) {
    console.error("[PATCH /api/subcategories]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/subcategories?id=xxx — 서브카테고리 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

    const supabase = createServerClient();
    const { error } = await supabase.from("subcategories").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/subcategories]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PUT /api/subcategories — 서브카테고리 순서 일괄 변경
export async function PUT(req: NextRequest) {
  try {
    const { items } = await req.json() as { items: { id: string; order_num: number }[] };
    if (!Array.isArray(items) || !items.length) {
      return NextResponse.json({ error: "items 배열 필요" }, { status: 400 });
    }

    const supabase = createServerClient();
    await Promise.all(
      items.map(({ id, order_num }) =>
        supabase.from("subcategories").update({ order_num }).eq("id", id)
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/subcategories]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
