import Link from 'next/link'
import {
  FlaskConical, Sparkles, Image as ImageIcon, Package, FileCheck2,
  ArrowRight, Command,
} from 'lucide-react'

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[1000px] rounded-full blur-[140px] bg-gradient-to-r from-indigo-600/30 via-violet-600/20 to-fuchsia-600/20" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[600px] rounded-full blur-[120px] bg-cyan-500/10" />
      </div>

      <nav className="container-page relative z-10 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <FlaskConical className="h-4 w-4 text-white" />
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 blur-md opacity-40 -z-10" />
          </div>
          <span className="font-semibold tracking-tight text-white">ModelEval Studio</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login"><NavBtn variant="ghost">登录</NavBtn></Link>
          <Link href="/register"><NavBtn>开始使用 <ArrowRight className="h-3.5 w-3.5" /></NavBtn></Link>
        </div>
      </nav>

      <main className="container-page relative z-10 pt-16 sm:pt-28 pb-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 h-7 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm text-[11px] font-medium text-gray-300 mb-8 animate-rise">
            <Sparkles className="h-3 w-3 text-indigo-400" />
            AI 驱动的多模型评估工作台
            <span className="w-px h-3 bg-white/10" />
            <span className="text-indigo-300">v0.1 Beta</span>
          </div>

          <h1 className="display text-5xl sm:text-7xl text-balance animate-rise" style={{ animationDelay: '50ms' }}>
            测试多个模型，
            <br />
            让 <span className="text-gradient">AI 写评估报告</span>
          </h1>

          <p className="mt-7 text-lg text-gray-400 max-w-2xl mx-auto text-pretty leading-relaxed animate-rise" style={{ animationDelay: '120ms' }}>
            上传数据看板截图与模型产物，AI 自动识别硬指标、分析软维度、
            输出专业结构化评估报告。把时间留给决策，而不是整理表格。
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 animate-rise" style={{ animationDelay: '200ms' }}>
            <Link href="/dashboard">
              <button className="group relative inline-flex items-center gap-2 h-12 px-7 rounded-xl bg-white text-black font-medium text-[15px] btn-glow hover:-translate-y-0.5 transition-transform duration-200">
                进入工作台
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </Link>
            <a href="#flow">
              <button className="inline-flex items-center gap-2 h-12 px-6 rounded-xl border border-white/10 bg-white/[0.03] text-white/90 font-medium text-[14px] hover:bg-white/[0.08] transition-colors backdrop-blur-sm">
                了解流程
              </button>
            </a>
          </div>          <div className="mt-20 relative animate-rise" style={{ animationDelay: '300ms' }}>
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-fuchsia-500/20 rounded-3xl blur-2xl opacity-60" />
            <div className="relative glass-strong rounded-xl overflow-hidden text-left">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                </div>
                <div className="flex-1 text-center text-[11px] text-gray-500 mono">model-eval.studio/report</div>
              </div>
              <div className="p-6 sm:p-8 font-mono text-[13px] leading-relaxed">
                <div className="text-gray-500">// AI 正在汇总 4 个模型的评估结果...</div>
                <div className="mt-3"><span className="text-indigo-400">const</span> <span className="text-cyan-300">report</span> = {'{'}</div>
                <div className="pl-4"><span className="text-pink-300">ranking</span>: [<span className="text-emerald-300">"sigma"</span>, <span className="text-emerald-300">"prism"</span>, <span className="text-emerald-300">"raven"</span>, <span className="text-emerald-300">"quartz"</span>],</div>
                <div className="pl-4"><span className="text-pink-300">hardMetrics</span>: {'{'} tools: <span className="text-amber-200">92%</span>, latency: <span className="text-amber-200">2.4s</span>, success: <span className="text-amber-200">98%</span> {'}'},</div>
                <div className="pl-4"><span className="text-pink-300">softMetrics</span>: {'{'} logic: <span className="text-emerald-300">A+</span>, creativity: <span className="text-emerald-300">A</span>, style: <span className="text-emerald-300">A-</span> {'}'},</div>
                <div className="pl-4"><span className="text-pink-300">recommendation</span>: <span className="text-amber-200">"推荐主力模型：sigma"</span></div>
                <div>{'}'}</div>
                <div className="mt-4 flex items-center gap-1.5 text-emerald-400">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
                  <span>报告生成完成 · 耗时 8.2s</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section id="flow" className="mt-32 sm:mt-40">
          <div className="text-center mb-14">
            <div className="kicker mb-3">Workflow</div>
            <h2 className="display text-3xl sm:text-5xl">五步完成一次专业评估</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { n: '01', icon: Sparkles, title: '任务设计', desc: '明确评测题目与交付标准', color: 'from-amber-500 to-orange-500' },
              { n: '02', icon: FlaskConical, title: '任务信息', desc: '评估目标、用户、约束', color: 'from-blue-500 to-indigo-500' },
              { n: '03', icon: ImageIcon, title: '看板识别', desc: '截图自动提取硬指标', color: 'from-fuchsia-500 to-pink-500' },
              { n: '04', icon: Package, title: '产物分析', desc: '上传各模型输出产物', color: 'from-pink-500 to-rose-500' },
              { n: '05', icon: FileCheck2, title: '评估报告', desc: '结构化 Markdown', color: 'from-cyan-500 to-blue-500' },
            ].map((step, i) => {
              const Icon = step.icon
              return (
                <div key={i} className="group relative glass p-5 lift overflow-hidden">
                  <div className={`absolute -top-10 -right-10 h-24 w-24 rounded-full bg-gradient-to-br ${step.color} opacity-0 group-hover:opacity-20 blur-2xl transition-opacity duration-500`} />
                  <div className="mono text-[11px] text-gray-500 mb-4 tabular">{step.n}</div>
                  <div className={`inline-flex h-9 w-9 rounded-lg bg-gradient-to-br ${step.color} items-center justify-center mb-4 shadow-lg`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-[14px] font-medium text-white mb-1">{step.title}</div>
                  <div className="text-[12px] text-gray-400 leading-relaxed">{step.desc}</div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-32 sm:mt-40 text-center">
          <div className="relative inline-block">
            <div className="absolute -inset-8 bg-gradient-to-r from-indigo-600/30 to-fuchsia-600/30 rounded-full blur-3xl opacity-70" />
            <div className="relative">
              <h2 className="display text-3xl sm:text-5xl mb-4">准备好开始了吗？</h2>
              <p className="text-gray-400 mb-8 max-w-lg mx-auto">
                登录后直接使用。所有数据保存在 Neon Postgres，多设备同步。
              </p>
              <Link href="/dashboard">
                <button className="group inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-white text-black font-medium btn-glow hover:-translate-y-0.5 transition-transform">
                  立即开始
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] py-6 mt-10">
        <div className="container-page flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-gray-500">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5" />
            <span>ModelEval Studio</span>
          </div>
          <div className="flex items-center gap-2 mono">
            <Command className="h-3 w-3" />
            <span>Neon Postgres · iron-session · Encrypted at rest</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function NavBtn({ children, variant = 'primary', ...rest }: any) {
  const v = variant === 'ghost'
    ? 'text-gray-300 hover:text-white hover:bg-white/[0.06]'
    : 'bg-white text-black hover:bg-gray-100 shadow-[0_0_0_0.5px_rgba(255,255,255,0.2)]'
  return (
    <button {...rest} className={`inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:opacity-40 h-8 px-3 text-xs rounded-lg ${v}`}>
      {children}
    </button>
  )
}
