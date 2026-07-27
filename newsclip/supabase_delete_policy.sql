-- =====================================================
-- DELETE 정책 추가 (최초 1회 Supabase SQL Editor에서 실행)
-- =====================================================

-- categories 삭제 허용
CREATE POLICY "categories_delete"
  ON categories FOR DELETE USING (true);

-- subcategories 삭제 허용 (CASCADE로 자동 삭제되지만 명시적 삭제에도 대비)
CREATE POLICY "subcategories_delete"
  ON subcategories FOR DELETE USING (true);

-- articles 삭제 허용
CREATE POLICY "articles_delete"
  ON articles FOR DELETE USING (true);
