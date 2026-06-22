/**
 * Loading state for public share pages.
 * Displayed while the share token/link data is being fetched during navigation.
 */
export default function ShareLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20 gap-3">
      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center">
        <div className="h-4 w-4 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" />
      </div>
      <p className="text-sm text-white/50">正在加载共享内容...</p>
    </div>
  )
}
