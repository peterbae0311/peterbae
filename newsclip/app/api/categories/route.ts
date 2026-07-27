import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { generateSubcategories, generateSources } from "@/lib/ai";

// AI 호출이 포함되므로 90초까지 허용
export const maxDuration = 90;

// GET /api/categories — 전체 카테고리 + 서브카테고리 조회
export async function GET() {
  try {
    const supabase = createServerClient();

    const { data: categories, error: catErr } = await supabase
      .from("categories")
      .select("*")
      .order("order_num");

    if (catErr) throw catErr;

    const { data: subcategories, error: subErr } = await supabase
      .from("subcategories")
      .select("*")
      .order("order_num");

    if (subErr) throw subErr;

    return NextResponse.json({ categories, subcategories });
  } catch (err) {
    console.error("[GET /api/categories]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/categories — 카테고리 생성 (AI 서브카테고리 자동 생성)
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "카테고리명을 입력하세요." }, { status: 400 });
    }

    const supabase = createServerClient();

    // 카테고리 저장
    const { data: category, error: catErr } = await supabase
      .from("categories")
      .insert({ name: name.trim() })
      .select()
      .single();

    if (catErr) {
      if (catErr.code === "23505") {
        return NextResponse.json({ error: "이미 존재하는 카테고리입니다." }, { status: 409 });
      }
      throw catErr;
    }

    // ── 동일 카테고리명의 고아 출처 조회 (category_id=NULL: 삭제된 카테고리 잔여분) ──
    const { data: existingSources } = await supabase
      .from("sources")
      .select("*")
      .eq("category_name", name.trim())
      .is("category_id", null);

    const hasExistingSources = (existingSources?.length ?? 0) > 0;

    // ── AI 서브카테고리 생성 (실패해도 카테고리는 생성 완료) ──
    let aiSubs: Awaited<ReturnType<typeof generateSubcategories>> = [];
    let subWarning: string | null = null;
    try {
      aiSubs = await generateSubcategories(name.trim());
      if (aiSubs.length === 0) subWarning = "AI가 서브카테고리를 생성하지 못했습니다. 잠시 후 다시 시도하세요.";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[POST /api/categories] 서브카테고리 생성 실패:", msg);
      subWarning = `서브카테고리 AI 생성 실패: ${msg}`;
    }

    let subcategories = null;
    if (aiSubs.length > 0) {
      const subsToInsert = aiSubs.map((s, i) => ({
        category_id: category.id,
        name: s.name,
        description: s.description,
        rss_sources: s.rss_sources,
        tags: s.tags ?? [],
        order_num: i,
      }));
      const { data: subData, error: subErr } = await supabase
        .from("subcategories")
        .insert(subsToInsert)
        .select();
      if (subErr) {
        console.error("[POST /api/categories] 서브카테고리 저장 실패:", subErr);
        subWarning = `서브카테고리 DB 저장 실패: ${subErr.message}`;
      } else {
        subcategories = subData;
      }
    }

    let sources = null;

    if (hasExistingSources) {
      // 고아 출처를 새 카테고리로 이전 (INSERT 대신 UPDATE — 중복 row 생성 방지)
      // 새 카테고리에 이미 동일 출처명이 있으면 skip, 없으면 이전
      const { data: alreadyInNew } = await supabase
        .from("sources")
        .select("name")
        .eq("category_id", category.id);

      const alreadyNames = new Set((alreadyInNew ?? []).map((s) => s.name));
      const toMove = (existingSources ?? []).filter((s) => !alreadyNames.has(s.name));

      if (toMove.length > 0) {
        const { data: srcData, error: srcErr } = await supabase
          .from("sources")
          .update({ category_id: category.id, category_name: name.trim(), priority: 2 })
          .in("id", toMove.map((s) => s.id))
          .select();

        if (srcErr) console.error("[POST /api/categories] 출처 이전 실패:", srcErr);
        else {
          sources = srcData;
          console.log(`[POST /api/categories] 고아 출처 ${srcData?.length}건 이전 완료 (AI 생성 생략)`);
        }
      } else {
        console.log("[POST /api/categories] 이전할 고아 출처 없음 (모두 이미 존재)");
      }
    } else {
      // 기존 출처 없음 → AI 생성
      const aiSources = await generateSources(name.trim());

      if (aiSources.length > 0) {
        const base = aiSources.map((s) => ({
          category_id: category.id,
          category_name: name.trim(),
          classification: s.classification,
          name: s.name,
          description: s.description,
          url: s.url || null,
          weight: Math.min(Math.max(s.weight ?? 0, 0), 100),
          priority: 2,
        }));

        let { data: srcData, error: srcErr } = await supabase.from("sources").insert(base).select();

        // category_name / priority 컬럼 미존재 시 기본 컬럼으로 재시도
        if (srcErr && srcErr.code === "PGRST204") {
          console.warn("[POST /api/categories] 컬럼 누락, 기본 컬럼으로 재시도:", srcErr.message);
          const fallback = aiSources.map((s) => ({
            category_id: category.id,
            classification: s.classification,
            name: s.name,
            description: s.description,
            url: s.url || null,
            weight: Math.min(Math.max(s.weight ?? 0, 0), 100),
          }));
          ({ data: srcData, error: srcErr } = await supabase.from("sources").insert(fallback).select());
        }

        if (srcErr) console.error("[POST /api/categories] AI 출처 저장 실패:", srcErr);
        else sources = srcData;
      } else {
        console.warn("[POST /api/categories] generateSources 결과 없음");
      }
    }

    return NextResponse.json({ category, subcategories: subcategories ?? [], sources, subWarning }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/categories]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH /api/categories — 카테고리명 수정
export async function PATCH(req: NextRequest) {
  try {
    const { id, name } = await req.json();
    if (!id || !name?.trim()) {
      return NextResponse.json({ error: "id, name 필요" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("categories")
      .update({ name: name.trim() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "이미 존재하는 카테고리명입니다." }, { status: 409 });
      }
      throw error;
    }

    // 출처 테이블의 category_name 동기화 (삭제 후 폴백 대비)
    await supabase.from("sources").update({ category_name: name.trim() }).eq("category_id", id);

    return NextResponse.json({ category: data });
  } catch (err) {
    console.error("[PATCH /api/categories]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/categories?id=xxx — 카테고리 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

    const supabase = createServerClient();

    // .select()를 붙여야 실제 삭제된 row를 반환받을 수 있음
    // RLS DELETE 정책이 없으면 data=[] 로 돌아오고 error는 null
    const { data, error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      // RLS가 삭제를 막은 경우 (DELETE 정책 미설정) 또는 해당 id 없음
      return NextResponse.json(
        {
          error:
            "삭제 실패: Supabase RLS에 DELETE 정책이 필요합니다. supabase_delete_policy.sql 을 실행하세요.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/categories]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
