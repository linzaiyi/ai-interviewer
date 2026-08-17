import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-white">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-xl font-bold mb-2">页面不存在</h2>
        <p className="text-muted-foreground mb-6">你访问的页面可能已被移除或地址输入有误</p>
        <Link
          href="/"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}