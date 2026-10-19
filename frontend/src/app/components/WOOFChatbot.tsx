import { Fragment, useState, useEffect, useRef, type ReactNode } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { askWoofChatbot } from "../lib/api";
import woofMascot from "../../imports/no_bg_Insight.png";

interface Message {
  id: string;
  text: string;
  sender: "user" | "woof";
  timestamp: Date;
}

function renderInlineText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>
      : part,
  );
}

function renderAssistantText(text: string) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) { index += 1; continue; }
    const itemMatch = lines[index].match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.+)$/);
    if (itemMatch) {
      const ordered = Boolean(itemMatch[2]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.+)$/);
        if (!match || Boolean(match[2]) !== ordered) break;
        items.push(match[3]);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1.5 pl-5 marker:text-[#d42a7d]`}>{items.map((item, itemIndex) => <li key={itemIndex} className="pl-0.5">{renderInlineText(item)}</li>)}</List>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^\s*(?:[-*•]|\d+[.)])\s+.+$/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`} className="leading-6">{paragraph.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && <br />}{renderInlineText(line.replace(/^#{1,3}\s+/, ""))}</Fragment>)}</p>);
  }
  return <div className="space-y-2">{blocks}</div>;
}

export function WOOFChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    "What are sales today?",
    "What are the top 5 items this week?",
    "Which channel has the highest revenue?",
  ];

  // Listen for open chatbot event
  useEffect(() => {
    const handleOpenChatbot = () => {
      setIsOpen(true);
    };
    
    window.addEventListener("openWoofChatbot", handleOpenChatbot);
    
    return () => {
      window.removeEventListener("openWoofChatbot", handleOpenChatbot);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: text,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setIsThinking(true);

    try {
      const history = messages.map((msg) => ({
        sender: msg.sender,
        text: msg.text,
      }));
      const result = await askWoofChatbot(text, history);
      const woofMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: result.answer || "I could not compute an answer from the dashboard data.",
        sender: "woof",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, woofMessage]);
    } catch (error: any) {
      const woofMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: error.message || "Chatbot is unavailable. Please try again later.",
        sender: "woof",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, woofMessage]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open WOOF chatbot"
          className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 w-11 h-11 sm:w-16 sm:h-16 rounded-full shadow-lg hover:shadow-2xl hover:scale-105 transition-all z-30 opacity-90 sm:opacity-100 flex items-center justify-center ring-2 sm:ring-4 ring-white/80"
          style={{
            background: "linear-gradient(135deg, #F53799 0%, #06B6D4 100%)",
          }}
        >
          <MessageCircle className="w-5 h-5 sm:w-8 sm:h-8 text-white" strokeWidth={2} />
        </button>
      )}

      {/* Chat Drawer */}
      {isOpen && (
        <div className="fixed right-3 bottom-3 sm:right-6 sm:bottom-6 w-[min(480px,calc(100vw-1.5rem))] h-[min(720px,calc(100dvh-1.5rem))] bg-white rounded-[30px] shadow-[0_28px_90px_-22px_rgba(34,48,71,0.42)] ring-1 ring-slate-200/80 z-50 flex flex-col overflow-hidden">
          {/* Header with Gradient */}
          <div
            className="px-5 py-4 flex items-center justify-between relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #F53799 0%, #06B6D4 100%)",
            }}
          >
            <div className="flex items-center gap-3 relative z-10">
              <div className="text-white">
                <div className="flex items-center gap-1.5 text-base font-bold">Ask WOOF <Sparkles size={14} /></div>
                <div className="mt-0.5 text-xs text-white/90">Dashboard data assistant</div>
              </div>
            </div>
            <button
              aria-label="Close WOOF chatbot"
              onClick={() => setIsOpen(false)}
              className="relative z-10 rounded-xl p-2 text-white/90 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <div className="absolute -right-8 -top-12 h-36 w-36 rounded-full border border-white/15" />
            <div className="absolute -right-2 -top-8 h-24 w-24 rounded-full border border-white/10" />
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-gradient-to-b from-[#fff8fc] via-white to-[#f7fbfc] px-4 py-5 sm:px-5 space-y-5">
            {messages.length === 0 && (
              <div className="flex min-h-full flex-col items-center justify-center py-8 text-center">
                <div className="w-full max-w-sm rounded-[26px] border border-pink-100 bg-gradient-to-br from-white via-[#fff7fb] to-[#f1fbfd] px-7 py-9 shadow-[0_18px_50px_-30px_rgba(245,55,153,0.45)]">
                  <div className="relative mx-auto mb-4 flex h-32 w-32 items-center justify-center">
                    <div className="absolute inset-3 rounded-full bg-gradient-to-br from-pink-100/80 to-cyan-100/80 blur-xl" />
                    <img src={woofMascot.src} alt="WOOF mascot" className="woof-mascot-motion relative h-full w-full object-contain drop-shadow-sm" />
                  </div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#d42a7d]">Your dashboard assistant</div>
                  <h2 className="text-2xl font-bold leading-tight tracking-tight text-[#223047]">How do you need my help today?</h2>
                  <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-500">Ask about your sales, top items, channels, or business performance.</p>
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-end gap-2.5 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.sender === "user"
                      ? "rounded-br-md bg-gradient-to-br from-[#F53799] to-[#d92b80] text-white shadow-md shadow-pink-200/60"
                      : "rounded-bl-md border border-slate-100 bg-white text-[#223047] shadow-[0_4px_18px_-10px_rgba(34,48,71,0.25)]"
                  }`}
                  style={{ lineHeight: "1.65" }}
                >
                  <div className={`break-words text-sm ${msg.sender === "user" ? "whitespace-pre-wrap" : ""}`}>{msg.sender === "woof" ? renderAssistantText(msg.text) : msg.text}</div>
                  <div className={`mt-1.5 text-[10px] ${msg.sender === "user" ? "text-white/70" : "text-slate-400"}`}>{msg.timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                </div>
              </div>
            ))}
            
            {isThinking && (
              <div className="flex justify-start">
                <div className="flex items-end gap-2.5">
                <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-[#F53799] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-[#F53799] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-[#F53799] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          <div className="bg-white px-4 pb-3 pt-3 sm:px-5">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Sparkles size={12} className="text-[#F53799]" />Try asking</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  disabled={isThinking}
                  onClick={() => handleSendMessage(prompt)}
                  className="shrink-0 rounded-full border border-pink-100 bg-[#fff8fc] px-3 py-2 text-left text-xs font-medium text-slate-600 transition-all hover:border-pink-300 hover:bg-pink-50 hover:text-[#c92772] disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 bg-white p-4 pt-3 sm:px-5">
            <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 transition-colors focus-within:border-pink-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-pink-100/70">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !isThinking) {
                    handleSendMessage(message);
                  }
                }}
                disabled={isThinking}
                placeholder="Ask about your dashboard..."
                className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                onClick={() => handleSendMessage(message)}
                disabled={!message.trim() || isThinking}
                aria-label="Send message"
                className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-r from-[#F53799] to-[#06B6D4] shadow-md shadow-pink-200/60 transition-all hover:scale-[1.03] hover:opacity-95 disabled:scale-100 disabled:opacity-45"
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">Answers are based on data available in your dashboard.</p>
          </div>
        </div>
      )}
    </>
  );
}
