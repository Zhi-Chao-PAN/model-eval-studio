/**
 * 跳转到主内容的无障碍链接（skip-link）。
 *
 * 默认隐藏（sr-only），仅在键盘聚焦时显形为左上角的浮起按钮。
 * 视觉风格固定为 indigo-600 实色背景 + 白色文字 + 阴影。
 *
 * 用法：
 *   <SkipLink />                              // → href="#main-content"，文案"跳转到主要内容"
 *   <SkipLink targetId="report-body" />       // → href="#report-body"
 *   <SkipLink label="跳到主表单" />            // → 自定义文案
 *
 * 配套约定：调用方需要在主内容容器上加 `id={targetId}`（默认 `main-content`），
 * 且该容器最好是 `<main>` 元素，便于屏幕阅读器朗读"主要内容"地标。
 */
interface Props {
  targetId?: string
  label?: string
}

export function SkipLink({
  targetId = 'main-content',
  label = '跳转到主要内容',
}: Props) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:shadow-lg"
    >
      {label}
    </a>
  )
}
