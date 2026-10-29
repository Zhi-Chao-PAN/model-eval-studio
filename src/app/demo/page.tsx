import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '免登录演示',
  description: '用合成样例了解模型对比、证据边界和人工修订。',
}

const cases = [
  {
    model: '示例模型 A',
    status: '符合要求',
    color: 'text-emerald-300',
    answer: '100 → 125，增长率为 25%。',
    evidence: '(125 - 100) / 100 × 100 = 25%',
    review: '公式、结果和百分号一致。这个结论只适用于当前样例。',
  },
  {
    model: '示例模型 B',
    status: '发现错误',
    color: 'text-rose-300',
    answer: '收入增加了 25，因此增长率为 125%。',
    evidence: '输出 125%，参考答案 25%；差异为 100 个百分点。',
    review: '混淆了绝对增量与增长率。即使答案中出现 25，也不能算答对。',
  },
  {
    model: '示例模型 C',
    status: '证据不足',
    color: 'text-amber-300',
    answer: '我已经完成计算，结果符合要求。',
    evidence: '没有给出数值、计算过程或可核验的产物。',
    review: '保留待验证状态。模型自述完成不能代替测试证据，也不据此推断其能力。',
  },
]

export default function DemoPage() {
  return (
    <main id="main-content" className="container-page py-8 sm:py-14">
      <nav aria-label="演示导航" className="mb-12 flex flex-wrap items-center justify-between gap-4 text-sm">
        <Link className="rounded text-gray-300 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-indigo-400" href="/">ModelEval Studio 首页</Link>
        <Link className="rounded-lg border border-white/20 px-4 py-2 focus-visible:outline-2 focus-visible:outline-indigo-400" href="/login">登录工作台</Link>
      </nav>
      <header className="max-w-3xl">
        <p className="mb-3 text-sm text-indigo-300">免登录演示 · 合成样例</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">从模型回答到有依据的评估</h1>
        <p className="mt-5 max-w-2xl leading-7 text-gray-300">查看同一道题的三种回答，展开证据，再比较人工修订前后的结论。这些内容是固定演示数据，不代表真实模型成绩；页面不会调用模型或读取用户任务。</p>
      </header>
      <section aria-labelledby="task-title" className="my-10 rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <h2 id="task-title" className="text-lg font-semibold">任务：计算收入增长率</h2>
        <p className="mt-3 leading-7 text-gray-300">上期收入为 100，本期收入为 125。请计算增长率，给出计算过程，并使用百分比表示。</p>
        <p className="mt-3 text-sm text-gray-400">判定依据：公式正确、数值为 25%、单位明确。缺少可核验结果时标记证据不足。</p>
      </section>
      <section aria-labelledby="comparison-title">
        <h2 id="comparison-title" className="mb-5 text-2xl font-semibold">回答与证据</h2>
        <div className="grid gap-5 lg:grid-cols-3">
          {cases.map((item) => (
            <article key={item.model} className="flex flex-col rounded-xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold">{item.model}</h3>
              <p className={`mt-2 text-sm font-medium ${item.color}`}>{item.status}</p>
              <blockquote className="my-5 min-h-20 border-l-2 border-white/20 pl-4 leading-7 text-gray-200">{item.answer}</blockquote>
              <details className="mt-auto rounded-lg bg-white/[0.04] p-4">
                <summary className="cursor-pointer rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-indigo-400">查看证据与判定理由</summary>
                <p className="mt-4 break-words text-sm leading-6 text-gray-300">{item.evidence}</p>
                <p className="mt-3 text-sm leading-6 text-gray-400">{item.review}</p>
              </details>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-gray-400">证据摘录也是合成内容。正式评测需要测试者上传的验收证据；这里的展示不能作为真实验收记录。</p>
      </section>
      <section aria-labelledby="revision-title" className="mt-12">
        <h2 id="revision-title" className="text-2xl font-semibold">人工修订保留来龙去脉</h2>
        <p className="mt-3 text-gray-400">下面展示同一报告的两版示例，原始结论和修订理由都可查看。</p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <article className="rounded-xl border border-white/10 p-6">
            <h3 className="font-semibold">版本 1：初步报告</h3>
            <p className="mt-3 leading-7 text-gray-300">A 符合要求，B 计算错误。C 自述已完成，暂记通过。</p>
            <p className="mt-3 text-sm text-amber-300">问题：把自述完成当成了验证通过。</p>
          </article>
          <article className="rounded-xl border border-indigo-400/30 bg-indigo-400/[0.04] p-6">
            <h3 className="font-semibold">版本 2：人工复核</h3>
            <p className="mt-3 leading-7 text-gray-300">A 符合要求，B 计算错误；C 改为证据不足，等待补充计算结果。</p>
            <p className="mt-3 text-sm leading-6 text-gray-400">基于版本 1 修订。理由：当前证据不足以支持“通过”。不覆盖原版，不扩大结论。</p>
          </article>
        </div>
      </section>
      <footer className="mt-12 border-t border-white/10 pt-6 text-sm leading-7 text-gray-400">
        完整工作台支持任务管理、证据上传和报告版本记录。当前注册需要邀请码。
        <Link href="/register" className="ml-2 rounded text-indigo-300 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-indigo-400">使用邀请码注册</Link>
      </footer>
    </main>
  )
}
