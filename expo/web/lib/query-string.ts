export type ParamsInput = Record<string, string | string[] | undefined>;

/** 현재 searchParams를 기반으로 일부 값만 바꾼 쿼리스트링을 만든다. page는 필터가 바뀌면 항상 리셋한다. */
export function withParams(current: ParamsInput, changes: Record<string, string | null>, resetPage = true): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(","));
    } else {
      params.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  if (resetPage) params.delete("page");
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

/**
 * 중분류는 다중 선택. "전체" 상태(cat 파라미터 없음)는 "모두 켜짐"이 아니라 "아무것도 안 골랐음"으로
 * 취급한다 — 그래야 처음 하나를 고를 때 그것만 선택되고 나머지가 반대로 켜지는 일이 없다.
 * 마지막 항목까지 끄면 다시 "전체"(cat 파라미터 제거)로 돌아간다.
 */
export function toggleCategoryHref(current: ParamsInput, code: string): string {
  const raw = current.cat;
  const currentList = typeof raw === "string" && raw.length > 0 ? raw.split(",") : [];
  const set = new Set(currentList);
  if (set.has(code)) set.delete(code);
  else set.add(code);
  const next = Array.from(set);
  return withParams(current, { cat: next.length > 0 ? next.join(",") : null });
}

export function selectedCategoryCodes(current: ParamsInput, allCodesInDomain: string[]): string[] {
  const raw = current.cat;
  if (typeof raw === "string" && raw.length > 0) return raw.split(",");
  return allCodesInDomain;
}
