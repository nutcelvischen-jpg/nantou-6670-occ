import { useState, type FormEvent } from "react";
import { ArrowUp, Bot, CircleHelp, Clock3, Database, ShieldCheck, UserRound } from "lucide-react";
import { askTransitAssistant, type AssistantReply } from "../dataClient";

type Message = { id: number; role: "assistant" | "user"; text: string; reply?: AssistantReply; pending?: boolean };

const prompts = ["哪個時段票證交易最多？", "同日回程交易間隔怎麼解讀？", "尖峰需求提高 15% 會怎樣？", "目前能確認即時車況嗎？"];

const statusText: Record<string, string> = {
  sourced: "已引用資料",
  missing: "缺少即時資料",
  stale: "快照待核實",
  demo: "示範回答",
  assumed: "情境假設",
  general: "一般說明",
};

export function OperationsAssistant({ year, route, compareYear, initialQuestion, years, onYears, onNavigate }: { year: number; route: string; compareYear:number; initialQuestion?:string; years:number[]; onYears:(base:number,target:number)=>void; onNavigate: (page: "運量分析" | "資料品質" | "成本最佳化") => void }) {
  const [draft, setDraft] = useState(initialQuestion || "");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", text: "我是內部營運分析助理，可比較年度總量、日均量、月份與子線差異，並協助解讀需求預測、尖離峰、票證彙總、班次與成本情境，以及儀表板資料狀態。即時車況目前沒有 GPS／ETA 來源；旅遊行程與對外客服問題不在支援範圍。" },
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
      const reply = await askTransitAssistant({ message: question, year, route, compare_year:compareYear });
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
    if (action.includes("需求分析") || action.includes("票證") || action.includes("交易")) { onNavigate("運量分析"); return; }
    if (action.includes("最佳化")) { onNavigate("成本最佳化"); return; }
    void submit(action);
  };

  return (
    <section className="assistant-page">
      <div className="page-intro assistant-intro">
        <div>
          <div className="eyebrow">TRANSIT COPILOT</div>
          <h1>智慧營運小幫手</h1>
          <p>僅回答需求預測、尖離峰、票證分析、班次成本情境與儀表板資料狀態。</p>
        </div>
        <div className="assistant-scope"><Database size={14} /> {compareYear} → {year} 年 · {route} · 票證聚合</div>
      </div>

      <div className="assistant-mode-switch assistant-scope-strip">
        <span><ShieldCheck size={14}/> 僅限內部營運使用</span><span><span className="assistant-demo-dot" /> OpenRouter · DeepSeek V4.1 Flash</span>
      </div>

      <div className="annual-toolbar"><div className="annual-years"><label>基準年<select aria-label="助理基準年" value={compareYear} onChange={e=>onYears(+e.target.value,year)}>{years.map(y=><option key={y}>{y}</option>)}</select></label><label>比較年<select aria-label="助理比較年" value={year} onChange={e=>onYears(compareYear,+e.target.value)}>{years.map(y=><option key={y}>{y}</option>)}</select></label><span>年度資料由伺服器計算；若問題明確寫出年份，優先使用問題年份。</span></div></div>
      <div className="assistant-layout">
        <div className="assistant-conversation" aria-live="polite">
          <div className="assistant-conversation-head">
            <div className="assistant-avatar"><Bot size={18} /></div>
            <div><b>內部營運分析助理</b><small>回答附來源與資料狀態</small></div>
            <span className="assistant-privacy"><ShieldCheck size={13} /> 不傳送卡號</span>
          </div>
          <div className="assistant-messages">
            {messages.map((message) => (
              <article className={`assistant-message ${message.role}`} key={message.id}>
                <span className="message-avatar">{message.role === "assistant" ? <Bot size={14} /> : <UserRound size={14} />}</span>
                <div className="message-body">
                  <p>{message.text}</p>
                  {message.pending && <span className="assistant-pending"><i /> 查詢票證彙總、營運情境與來源狀態</span>}
                  {message.reply && <>
                    <div className={`assistant-status ${message.reply.data_status}`}><i />{statusText[message.reply.data_status] ?? "資料狀態"}<span>{message.reply.engine === "openrouter" ? "OpenRouter · DeepSeek V4.1 Flash" : message.reply.engine === "opencode" ? "舊版 OpenCode" : message.reply.engine.includes("fallback") ? "本機降級" : "本機示範"}</span></div>
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
            <textarea aria-label="輸入問題" placeholder="例如：目前尖峰運量如何？若需求增加 15%，候選班次能否滿足服務底線？" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} maxLength={2000} />
            <div><small><CircleHelp size={12} /> 年度問題會同時查兩年；只提供單年／子線資料時會註明限制</small><button className="button-primary" type="submit" disabled={busy || !draft.trim()} aria-label="送出問題"><ArrowUp size={16} /> 詢問</button></div>
          </form>
        </div>
        <aside className="assistant-side">
          <div className="panel">
            <div className="panel-head"><div><h3>試試這些問題</h3><span>依目前篩選條件查詢</span></div></div>
            <div className="assistant-prompt-list">{[`比較 ${compareYear} 與 ${year} 年的票證年度差異`, `哪個子線對 ${compareYear} 到 ${year} 的年度增減貢獻最大？`, ...prompts].map((prompt) => <button key={prompt} onClick={() => void submit(prompt)} disabled={busy}>{prompt}<ArrowUp size={13} /></button>)}</div>
          </div>
          <div className="panel assistant-boundary">
            <div className="panel-head"><div><h3>資料邊界</h3><span>回答會據此標示限制</span></div></div>
            <ul>
              <li><b>即時 GPS／ETA</b><span>尚未接入，不能確認車輛位置或延誤。</span></li>
              <li><b>電子票證</b><span>代表刷卡交易，不含完整現金、套票或拒載量。</span></li>
              <li><b>支援範圍</b><span>限需求、尖離峰、票證行為、班次最佳化與營運資料狀態。</span></li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
