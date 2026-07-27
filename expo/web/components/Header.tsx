import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header() {
  return (
    <header className="border-b border-ink/50">
      <div className="content-shell flex items-center gap-6 py-5">
        <Link href="/" className="text-xl font-black tracking-tight md:text-2xl">
          전시<span className="text-culture">·</span>공연
        </Link>
        <nav className="ml-auto flex items-center gap-6 text-xs font-bold uppercase tracking-widest text-ink-muted">
          <Link href="/" className="underline-grow hover:text-ink">
            홈
          </Link>
          <Link href="/admin" className="underline-grow hover:text-ink">
            관리자
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
