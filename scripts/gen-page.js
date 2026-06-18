const fs = require('fs');

const pageCode = `"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import StepInfo from "./StepInfo";
import StepIdea from "./StepIdea";
import StepScreenshot from "./StepScreenshot";
import StepArtifact from "./StepArtifact";
import StepReport from "./StepReport";

const steps = [
  { key: "INFO", label: "任务信息", desc: "填写测试任务基本信息" },
  { key: "IDEA", label: "测试思路", desc: "AI 生成测试思路" },
  { key: "SCREENSHOT", label: "截图分析", desc: "上传执行过程截图 & 数据看板" },
  { key: "ARTIFACT", label: "产物分析", desc: "上传各模型产物进行分析" },
  { key: "REPORT", label: "评估报告", desc: "生成最终评估报告" },
];

export default function TaskPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState("INFO");
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  async function loadTask() {
    setLoading(true);
    const res = await fetch(`/api/tasks/${taskId}`);
    const data = await res.json();
    if (data.task) {
      setTask(data.task);
      setCurrentStep(data.task.currentStep || "INFO");
    }
    setLoading(false);
  }

  async function loadMessages() {
    const res = await fetch(`/api/tasks/${taskId}/messages`);
    const data = await res.json();
    if (data.messages) {
      setMessages(data.messages);
    }
  }

  useEffect(() => {
    loadTask();
    loadMessages();
  }, [taskId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStep]);

  const stepMessages = messages.filter((m) => m.step === currentStep);

  function handleTaskUpdate(updated: any) {
    setTask(updated);
    if (updated.currentStep) {
      setCurrentStep(updated.currentStep);
    }
  }

  function handleAddMessage(msg: any) {
    setMessages((prev) => [...prev, msg]);
  }

  function goToStep(stepKey: string) {
    setCurrentStep(stepKey);
    // 同步到服务端
    fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentStep: stepKey }),
    }).then((r) => r.json()).then((data) => {
      if (data.task) setTask(data.task);
    });
  }

  async function handleChatSend(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || sending) return;

    const userMsg: any = {
      id: "user-" + Date.now(),
      role: "user",
      content: chatInput.trim(),
      step: currentStep,
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/tasks/${taskId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.content,
          step: currentStep,
        }),
      });
      const data = await res.json();
      if (data.assistantMessage) {
        setMessages((prev) => [...prev, data.assistantMessage]);
      } else if (data.error) {
        setMessages((prev) => [
          ...prev,
          { id: "err-" + Date.now(), role: "system", content: "错误: " + data.error, step: currentStep },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: "err-" + Date.now(), role: "system", content: "网络错误: " + err.message, step: currentStep },
      ]);
    } finally {
      setSending(false);
    }
  }

  function renderStepContent() {
    if (!task) return null;

    switch (currentStep) {
      case "INFO":
        return <StepInfo task={task} onUpdate={handleTaskUpdate} />;
      case "IDEA":
        return <StepIdea task={task} onAddMessage={handleAddMessage} />;
      case "SCREENSHOT":
        return <StepScreenshot task={task} onAddMessage={handleAddMessage} onRefresh={loadTask} />;
      case "ARTIFACT":
        return <StepArtifact task={task} onAddMessage={handleAddMessage} onRefresh={loadTask} />;
      case "REPORT":
        return <StepReport task={task} onAddMessage={handleAddMessage} onRefresh={loadTask} />;
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-slate-400">
        加载中...
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500 mb-4">任务不存在或已被删除</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline text-sm">
          返回任务列表
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-slate-400 hover:text-slate-600 text-sm"
          >
            ← 返回
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{task.title}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              共 {task.models?.length || 0} 个待测模型 · 创建于 {new Date(task.createdAt).toLocaleDateString("zh-CN")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/tasks/${taskId}/export`}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            导出
          </a>
          <button
            onClick={async () => {
              if (!confirm("确定删除此任务？此操作不可撤销。")) return;
              await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
              router.push("/dashboard");
            }}
            className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
          >
            删除
          </button>
        </div>
      </div>

      {/* 步骤导航 */}
      <div className="bg-white rounded-xl border border-slate-200 p-2">
        <div className="flex gap-1">
          {steps.map((s, idx) => {
            const isActive = currentStep === s.key;
            return (
              <button
                key={s.key}
                onClick={() => goToStep(s.key)}
                className={`flex-1 px-3 py-3 rounded-lg text-left transition ${
                  isActive
                    ? "bg-blue-50 border border-blue-200"
                    : "hover:bg-slate-50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full text-xs font-medium flex items-center justify-center ${
                      isActive ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className={`font-medium text-sm ${isActive ? "text-blue-700" : "text-slate-700"}`}>
                    {s.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 ml-8">{s.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 主内容区 + 聊天侧栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：步骤内容 */}
        <div className="lg:col-span-2">
          {renderStepContent()}
        </div>

        {/* 右侧：AI 对话 */}
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-[600px]">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="font-medium text-sm text-slate-800">AI 助手</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              当前步骤：{steps.find((s) => s.key === currentStep)?.label}
            </p>
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {stepMessages.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">
                开始和 AI 讨论当前步骤的内容吧
              </div>
            ) : (
              stepMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`text-sm ${
                    msg.role === "user"
                      ? "text-right"
                      : msg.role === "system"
                      ? "text-center"
                      : ""
                  }`}
                >
                  {msg.role === "system" ? (
                    <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
                      {msg.content}
                    </span>
                  ) : (
                    <div
                      className={`inline-block max-w-[85%] px-3 py-2 rounded-lg ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      <div className="whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 输入框 */}
          <form onSubmit={handleChatSend} className="p-3 border-t border-slate-200">
            <div className="flex gap-2">
              <input
                name="chatInput"
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={sending ? "AI 思考中..." : "输入消息..."}
                disabled={sending}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || !chatInput.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition disabled:opacity-50"
              >
                {sending ? "..." : "发送"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/app/tasks/[id]/page.tsx', pageCode);
console.log('page.tsx written, length:', pageCode.length);
