import { useState, type FormEvent } from "react";
import { ArrowUp, Bot, Bus, CircleHelp, Clock3, Database, ShieldCheck, UserRound } from "lucide-react";
import { askTransitAssistant, type AssistantReply, type AssistantMode } from "../dataClient";

type Message = { id: number; role: "assistant" | "user"; text: string; reply?: AssistantReply; pending?: boolean };

const prompts: Record<AssistantMode, string[]> = {
  operations: ["哪個時段票證交易最多？", "現在 6670 有沒有延誤？", "尖峰需求提高 15% 會怎樣？"],
  traveler: ["現在 6670 有沒有延誤？", "6670 班表快照有哪些限制？", "我搭車前該確認什麼？"],
};

const statusText: Record<string, string> = {
  sourced: "已引用資料",
  missing: "缺少即時資料",
  stale: "快照待核實",
  demo: "示範回答",
  assumed: "情境假設",
  general: "一般說明",
};

export function OperationsAssistant({ year, route, onNavigate }: { year: number; route: string; onNavigate: (page: "運量分析" | "旅遊資訊" | "資料品質" | "成本最佳化") => void }) {
  const [mode, setMode] = useState<AssistantMode>("operations");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", text: "你好，我可以協助查看公開票證彙總、班表快照與資料限制。即時車況目前沒有 GPS／ETA 來源，查不到時我會直接說明。" },
  ]);

  const submit = async (value = draft) => {
    const question = value.trim();
    if (!question || busy) return;
    const userId = Date.now();
    const pendingId = userId + 1;
    setDraft("");
    setBusy(true);
    setMessages((items) => [...items, { id: userId, role: "user", text: question }, { id: pendingId, role: "assistant", text: "正在查詢資料…", pending: true }]);
    try {
      const reply = await askTransitAssistant({ message: question, mode, year, route });
      setMessages((items) => items.map((item) => item.id === pendingId ? { id: pendingId, role: "assistant", text: reply.answer, reply } : item));
    } catch (error) {
      const text = error instanceof Error ? error.message : "查詢失敗，請稍後重試。";
      setMessages((items) => items.map((item) => item.id === pendingId ? { id: pendingId, role: "assistant", text } : item));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const handleAction = (action: string) => {
    if (action.includes("需求分析")) { onNavigate("運量分析"); return; }
    if (action.includes("班表")) { onNavigate("旅遊資訊"); return; }
    if (action.includes("最佳化")) { onNavigate("成本最佳化"); return; }
    void submit(action);
  };

  return (
    <section className="assistant-page">
      <div className="page-intro assistant-intro">
        <div>
          <div className="eyebrow">TRANSIT COPILOT</div>
          <h1>智慧營運小幫手</h1>
          <p>查詢資料、釐清服務狀況，或探索受限制的營運情境。</p>
        </div>
        <div className="assistant-scope"><Database size={14} /> {year} 年 · {route} · 公開資料</div>
      </div>

      <div className="assistant-mode-switch" role="tablist" aria-label="助理使用情境">
        <button className={mode === "operations" ? "selected" : ""} role="tab" aria-selected={mode === "operations"} onClick={() => setMode("operations")}>
          <ShieldCheck size={15} /> 營運分析
        </button>
        <button className={mode === "traveler" ? "selected" : ""} role="tab" aria-selected={mode === "traveler"} onClick={() => setMode("traveler")}>
          <Bus size={15} /> 旅客資訊
        </button>
        <span><span className="assistant-demo-dot" /> OpenCode 未設定時使用可追溯示範資料</span>
      </div>

      <div className="assistant-layout">
        <div className="assistant-conversation" aria-live="polite">
          <div className="assistant-conversation-head">
            <div className="assistant-avatar"><Bot size={18} /></div>
            <div><b>{mode === "operations" ? "營運分析助理" : "旅客資訊助理"}</b><small>回答附來源與資料狀態</small></div>
            <span className="assistant-privacy"><ShieldCheck size={13} /> 不傳送卡號</span>
          </div>
          <div className="assistant-messages">
            {messages.map((message) => (
              <article className={`assistant-message ${message.role}`} key={message.id}>
                <span className="message-avatar">{message.role === "assistant" ? <Bot size={14} /> : <UserRound size={14} />}</span>
                <div className="message-body">
                  <p>{message.text}</p>
                  {message.pending && <span className="assistant-pending"><i /> 查詢票證、班表與來源狀態</span>}
                  {message.reply && <>
                    <div className={`assistant-status ${message.reply.data_status}`}><i />{statusText[message.reply.data_status] ?? "資料狀態"}<span>{message.reply.engine === "opencode" ? "OpenCode · DeepSeek V4.1 Flash" : message.reply.engine.includes("fallback") ? "本機降級" : "本機示範"}</span></div>
                    {message.reply.provider_notice && <small className="assistant-notice">{message.reply.provider_notice}</small>}
                    {message.reply.sources.length > 0 && <div className="assistant-sources">
                      <b>依據資料</b>
                      {message.reply.sources.map((source) => source.url?.startsWith("http") ? <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
                        <Database size={13} /><span>{source.title}<small>{source.status_label} · {source.as_of || "時間未知"}</small></span><Clock3 size={12} />
                      </a> : <button className="assistant-source-link" key={source.id} onClick={() => onNavigate(source.id.startsWith("ticket-") ? "運量分析" : "資料品質")}>
                        <Database size={13} /><span>{source.title}<small>{source.status_label} · {source.as_of || "時間未知"}</small></span><Clock3 size={12} />
                      </button>)}
                    </div>}
                    {message.reply.suggested_actions.length > 0 && <div className="assistant-actions">{message.reply.suggested_actions.map((action) => <button key={action} onClick={() => handleAction(action)} disabled={busy}>{action}</button>)}</div>}
                    <small className="assistant-request-id">查詢編號 {message.reply.request_id}</small>
                  </>}
                </div>
              </article>
            ))}
          </div>
          <form className="assistant-composer" onSubmit={onSubmit}>
            <textarea aria-label="輸入問題" placeholder={mode === "operations" ? "例如：今天尖峰需求最高的時段是幾點？" : "例如：目前有可確認的即時車況嗎？"} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} maxLength={2000} />
            <div><small><CircleHelp size={12} /> 送出後會查詢目前頁面年度與子線</small><button className="button-primary" type="submit" disabled={busy || !draft.trim()} aria-label="送出問題"><ArrowUp size={16} /> 詢問</button></div>
          </form>
        </div>
        <aside className="assistant-side">
          <div className="panel">
            <div className="panel-head"><div><h3>試試這些問題</h3><span>依目前篩選條件查詢</span></div></div>
            <div className="assistant-prompt-list">{prompts[mode].map((prompt) => <button key={prompt} onClick={() => void submit(prompt)} disabled={busy}>{prompt}<ArrowUp size={13} /></button>)}</div>
          </div>
          <div className="panel assistant-boundary">
            <div className="panel-head"><div><h3>資料邊界</h3><span>回答會據此標示限制</span></div></div>
            <ul>
              <li><b>即時 GPS／ETA</b><span>尚未接入，不能確認車輛位置或延誤。</span></li>
              <li><b>電子票證</b><span>代表刷卡交易，不含完整現金、套票或拒載量。</span></li>
              <li><b>班表快照</b><span>來自公開頁面，尚未核實今天是否有效。</span></li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
