import type { ReactNode } from 'react'

/** 占位页骨架：居中大标题。页面代理实现时替换整个文件。 */
export default function PageStub({ title, desc }: { title: string; desc?: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-display text-[#111827]">{title}</h1>
      {desc && <p className="max-w-md text-small text-[#6b7280]">{desc}</p>}
    </div>
  )
}
