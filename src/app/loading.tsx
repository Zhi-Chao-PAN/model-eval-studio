/**
 * Root loading state for Next.js App Router Suspense boundary.
 *
 * This is shown while Server Components fetch data during navigation,
 * providing visual feedback instead of a blank screen.
 */
export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 animate-pulse">
      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center">
        <div className="h-4 w-4 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" />
      </div>
      <p className="text-xs text-gray-500">加载中...</p>
    </div>
  )
}
