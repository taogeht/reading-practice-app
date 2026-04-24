'use client';

import { useState, useRef, useEffect } from 'react';

type ChatRole = 'user' | 'assistant';
type ChatMessage = { role: ChatRole; content: string };

type HelperContext = { currentUnit: number; spellingWords: string[] };

const SunnyFace = ({ size = 48 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
    <circle cx="40" cy="40" r="36" fill="#FFD93D" />
    <circle cx="40" cy="40" r="36" fill="url(#sunGlow)" opacity="0.4" />
    <ellipse cx="28" cy="34" rx="5" ry="6" fill="#2D2D2D" />
    <ellipse cx="52" cy="34" rx="5" ry="6" fill="#2D2D2D" />
    <circle cx="30" cy="32" r="2" fill="white" />
    <circle cx="54" cy="32" r="2" fill="white" />
    <path d="M26 50 Q40 62 54 50" stroke="#2D2D2D" strokeWidth="3" strokeLinecap="round" fill="none" />
    <ellipse cx="20" cy="46" rx="7" ry="5" fill="#FF8FA3" opacity="0.5" />
    <ellipse cx="60" cy="46" rx="7" ry="5" fill="#FF8FA3" opacity="0.5" />
    <defs>
      <radialGradient id="sunGlow" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="white" />
        <stop offset="100%" stopColor="#FFD93D" stopOpacity="0" />
      </radialGradient>
    </defs>
  </svg>
);

const TypingDots = () => (
  <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 0' }}>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#94a3b8',
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }}
      />
    ))}
  </div>
);

const QUICK_PROMPTS = [
  { label: '🔤 What does ___ mean?', text: 'What does ' },
  { label: '✏️ Check my sentence', text: 'Can you check this sentence: ' },
  { label: '🎯 Give me practice', text: 'Can you give me a practice question?' },
  { label: '❓ How do I say...?', text: 'How do I say ' },
];

const GREETING: ChatMessage = {
  role: 'assistant',
  content: "Hi! I'm Sunny! 🌟 I can help you practice English. What do you want to learn today?",
};

type HomeworkHelperProps = {
  /** When set, the helper fetches context for this unit (teacher preview mode). */
  teacherUnit?: number;
};

export default function HomeworkHelper({ teacherUnit }: HomeworkHelperProps = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<HelperContext>({
    currentUnit: teacherUnit ?? 1,
    spellingWords: [],
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = teacherUnit
      ? `/api/homework-helper/context?unit=${teacherUnit}`
      : '/api/homework-helper/context';
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: HelperContext | null) => {
        if (!cancelled && data) setContext(data);
      })
      .catch(() => {
        /* stay with default context */
      });
    return () => {
      cancelled = true;
    };
  }, [teacherUnit]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const sendMessage = async (text?: string) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/homework-helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversationHistory: nextMessages.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          ...(teacherUnit ? { unit: teacherUnit } : {}),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Server error');
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Oops! Something went wrong.';
      setError(msg);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');

        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes sunPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }

        .hw-helper * { box-sizing: border-box; font-family: 'Nunito', sans-serif; }

        .hw-helper {
          display: flex;
          flex-direction: column;
          height: 520px;
          background: #fffef7;
          border-radius: 24px;
          border: 3px solid #FFD93D;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(255, 217, 61, 0.2);
        }

        .hw-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          background: linear-gradient(135deg, #FFD93D 0%, #FFB347 100%);
          flex-shrink: 0;
        }

        .hw-header-sun {
          animation: sunPulse 3s ease-in-out infinite;
          flex-shrink: 0;
        }

        .hw-header-text { flex: 1; }
        .hw-header-title {
          font-size: 17px;
          font-weight: 800;
          color: #1a1a1a;
          margin: 0;
          line-height: 1.2;
        }
        .hw-header-sub {
          font-size: 12px;
          color: #5a4a00;
          margin: 0;
          font-weight: 600;
        }

        .hw-unit-badge {
          background: white;
          border-radius: 20px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 800;
          color: #c47a00;
          flex-shrink: 0;
        }

        .hw-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          scroll-behavior: smooth;
        }

        .hw-messages::-webkit-scrollbar { width: 4px; }
        .hw-messages::-webkit-scrollbar-track { background: transparent; }
        .hw-messages::-webkit-scrollbar-thumb { background: #e2d9b3; border-radius: 4px; }

        .hw-msg {
          display: flex;
          gap: 8px;
          animation: fadeUp 0.25s ease forwards;
          max-width: 85%;
        }
        .hw-msg.user { align-self: flex-end; flex-direction: row-reverse; }
        .hw-msg.assistant { align-self: flex-start; }

        .hw-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #FFD93D;
          margin-top: 2px;
        }

        .hw-bubble {
          padding: 10px 14px;
          border-radius: 18px;
          font-size: 15px;
          font-weight: 600;
          line-height: 1.5;
          max-width: 100%;
          word-break: break-word;
        }
        .hw-msg.assistant .hw-bubble {
          background: white;
          color: #1a1a1a;
          border: 2px solid #f0e8c0;
          border-bottom-left-radius: 6px;
        }
        .hw-msg.user .hw-bubble {
          background: #4F86F7;
          color: white;
          border-bottom-right-radius: 6px;
        }

        .hw-typing {
          display: flex;
          gap: 8px;
          align-self: flex-start;
          align-items: center;
        }
        .hw-typing .hw-bubble {
          background: white;
          border: 2px solid #f0e8c0;
          padding: 10px 14px;
        }

        .hw-error {
          background: #fff0f0;
          border: 2px solid #fca5a5;
          color: #dc2626;
          padding: 8px 14px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
        }

        .hw-quick-prompts {
          display: flex;
          gap: 6px;
          padding: 0 16px 8px;
          overflow-x: auto;
          flex-shrink: 0;
          scrollbar-width: none;
        }
        .hw-quick-prompts::-webkit-scrollbar { display: none; }

        .hw-chip {
          background: #fff9e0;
          border: 2px solid #FFD93D;
          border-radius: 20px;
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 700;
          color: #7a5c00;
          white-space: nowrap;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          flex-shrink: 0;
        }
        .hw-chip:hover { background: #FFD93D; transform: translateY(-1px); }
        .hw-chip:active { transform: translateY(0); }

        .hw-input-row {
          display: flex;
          gap: 8px;
          padding: 12px 16px 14px;
          background: white;
          border-top: 2px solid #f0e8c0;
          flex-shrink: 0;
          align-items: flex-end;
        }

        .hw-input {
          flex: 1;
          border: 2px solid #e2d9b3;
          border-radius: 16px;
          padding: 10px 14px;
          font-size: 15px;
          font-weight: 600;
          font-family: 'Nunito', sans-serif;
          color: #1a1a1a;
          background: #fffef7;
          resize: none;
          outline: none;
          min-height: 44px;
          max-height: 100px;
          line-height: 1.4;
          transition: border-color 0.2s;
        }
        .hw-input:focus { border-color: #FFD93D; }
        .hw-input::placeholder { color: #b5a870; }

        .hw-send {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #FFD93D, #FFB347);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: transform 0.15s, opacity 0.15s;
          box-shadow: 0 2px 8px rgba(255, 179, 71, 0.4);
        }
        .hw-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .hw-send:not(:disabled):hover { transform: scale(1.08); }
        .hw-send:not(:disabled):active { transform: scale(0.95); }

        .hw-spelling-bar {
          display: flex;
          gap: 6px;
          padding: 8px 16px;
          background: #f0fdf4;
          border-bottom: 2px solid #bbf7d0;
          overflow-x: auto;
          flex-shrink: 0;
          align-items: center;
          scrollbar-width: none;
        }
        .hw-spelling-bar::-webkit-scrollbar { display: none; }
        .hw-spelling-label {
          font-size: 11px;
          font-weight: 800;
          color: #15803d;
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .hw-spelling-word {
          background: white;
          border: 2px solid #86efac;
          border-radius: 10px;
          padding: 3px 10px;
          font-size: 13px;
          font-weight: 700;
          color: #166534;
          white-space: nowrap;
          cursor: pointer;
          transition: background 0.15s;
        }
        .hw-spelling-word:hover { background: #dcfce7; }
      `}</style>

      <div className="hw-helper">
        <div className="hw-header">
          <div className="hw-header-sun">
            <SunnyFace size={44} />
          </div>
          <div className="hw-header-text">
            <p className="hw-header-title">Sunny Helper ☀️</p>
            <p className="hw-header-sub">Your English homework friend</p>
          </div>
          <div className="hw-unit-badge">Unit {context.currentUnit}</div>
        </div>

        {context.spellingWords.length > 0 && (
          <div className="hw-spelling-bar">
            <span className="hw-spelling-label">This week:</span>
            {context.spellingWords.map((word) => (
              <button
                key={word}
                className="hw-spelling-word"
                onClick={() => sendMessage(`What does "${word}" mean?`)}
              >
                {word}
              </button>
            ))}
          </div>
        )}

        <div className="hw-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`hw-msg ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="hw-avatar">
                  <SunnyFace size={24} />
                </div>
              )}
              <div className="hw-bubble">{msg.content}</div>
            </div>
          ))}

          {isLoading && (
            <div className="hw-typing">
              <div className="hw-avatar">
                <SunnyFace size={24} />
              </div>
              <div className="hw-bubble">
                <TypingDots />
              </div>
            </div>
          )}

          {error && <div className="hw-error">{error}</div>}
          <div ref={bottomRef} />
        </div>

        <div className="hw-quick-prompts">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p.label}
              className="hw-chip"
              onClick={() => setInput(p.text)}
              disabled={isLoading}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="hw-input-row">
          <textarea
            ref={inputRef}
            className="hw-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type your question..."
            rows={1}
            disabled={isLoading}
          />
          <button
            className="hw-send"
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            aria-label="Send"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
