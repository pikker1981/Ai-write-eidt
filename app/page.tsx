"use client";

import { useState } from "react";

type Detection = {
  pattern_id: string;
  category: string;
  severity: "S1" | "S2" | "S3";
  original_span: string;
  suggested: string;
  description: string;
};

type Stats = {
  char_before: number;
  char_after: number;
  change_rate: number;
  s1_count: number;
  s2_count: number;
  s3_count: number;
  grade: "A" | "B" | "C" | "D";
};

type HumanizeResult = {
  humanized: string;
  detections: Detection[];
  stats: Stats;
  summary: string;
};

const GENRE_OPTIONS = [
  { value: "essay", label: "에세이/칼럼" },
  { value: "report", label: "리포트/보고서" },
  { value: "blog", label: "블로그/SNS" },
  { value: "news", label: "뉴스/기사" },
  { value: "policy", label: "공적문서/정책" },
];

const SEV: Record<string, { color: string; border: string; bg: string }> = {
  S1: { color: "#C8FF00", border: "rgba(200,255,0,0.4)",  bg: "rgba(200,255,0,0.08)"  },
  S2: { color: "#AAAAAA", border: "rgba(170,170,170,0.3)", bg: "rgba(170,170,170,0.06)" },
  S3: { color: "#555555", border: "rgba(85,85,85,0.4)",   bg: "rgba(85,85,85,0.06)"   },
};

const GRADE: Record<string, { color: string; label: string }> = {
  A: { color: "#C8FF00", label: "우수 — AI 티 거의 없음"    },
  B: { color: "#FFFFFF", label: "양호 — 일부 패턴 잔존"     },
  C: { color: "#AAAAAA", label: "주의 — 2차 윤문 권장"      },
  D: { color: "#ff5555", label: "재검토 — 사람 확인 필요"   },
};

// ── 공통 인라인 스타일 헬퍼 ────────────────────────────────────────────────
const S = {
  card:  { background: "#1A1A1A", borderRadius: "10px", padding: "14px 18px" } as React.CSSProperties,
  lcard: (accent = true) => ({ background: "#1A1A1A", borderLeft: `3px solid ${accent ? "#C8FF00" : "#2a2a2a"}`, borderRadius: "0 10px 10px 0", padding: "14px 18px" }) as React.CSSProperties,
  badge: { display: "inline-block", background: "#C8FF00", color: "#000", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, padding: "3px 8px", borderRadius: "3px" },
  mono:  { fontFamily: "'DM Mono', monospace" } as React.CSSProperties,
  label: { fontFamily: "'DM Mono', monospace", fontSize: "11px", textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#555555" } as React.CSSProperties,
};

const SAMPLE_TEXT = `현대 사회에서 인공지능 기술의 발전은 매우 혁신적인 변화를 가져오고 있다. 특히 생성형 AI를 통해 다양한 산업 분야에서 효율성과 생산성을 높일 수 있다. 이에 있어서 중요한 점은 기술의 발전이 단순히 자동화에 그치는 것이 아니라, 인간의 창의성과 결합하여 새로운 가치를 창출할 수 있다는 것이다.

첫째, AI는 반복적인 업무를 자동화하고, 둘째, 데이터 분석 능력을 향상시키며, 셋째, 의사결정 과정을 지원한다. 결론적으로, 이러한 변화는 우리 사회에 시사하는 바가 크다.

그러나 또한 한편으로는 AI 기술의 발전이 일자리 감소와 같은 사회적 문제를 야기할 수 있다는 점도 주목할 만하다. 따라서 우리는 기술과 인간이 공존하는 방향을 모색해야 할 필요가 있다.`;

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [genre, setGenre] = useState("essay");
  const [mode, setMode] = useState<"fast" | "strict">("fast");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<HumanizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"output" | "detections" | "diff">("output");
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    if (!inputText.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    setActiveTab("output");
    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, genre, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "요청 실패");
      setResult(data);
      setActiveTab(data.detections?.length > 0 ? "diff" : "output");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const charCount = inputText.length;
  const canRun = !isLoading && !!inputText.trim();

  // ── Diff renderer ───────────────────────────────────────────────────────────
  const renderDiff = () => {
    if (!result) return null;
    const origLines = inputText.split("\n");
    const humLines  = result.humanized.split("\n");
    const len = Math.max(origLines.length, humLines.length);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", ...S.mono, fontSize: "13px" }}>
        {Array.from({ length: len }).map((_, i) => {
          const o = origLines[i] ?? "";
          const h = humLines[i]  ?? "";
          if (o === h)
            return <div key={i} style={{ padding: "2px 10px", color: "#444", lineHeight: 1.7 }}>{o || <span style={{ opacity: 0.3 }}>(빈 줄)</span>}</div>;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {o && <div style={{ padding: "3px 10px", background: "rgba(255,80,80,0.08)", borderLeft: "2px solid #ff5555", color: "#ff9999", textDecoration: "line-through", opacity: 0.7, lineHeight: 1.7 }}>{o}</div>}
              {h && <div style={{ padding: "3px 10px", background: "rgba(200,255,0,0.07)", borderLeft: "2px solid #C8FF00", color: "#C8FF00", lineHeight: 1.7 }}>{h}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Spinner SVG ─────────────────────────────────────────────────────────────
  const Spinner = ({ size = 16 }: { size?: number }) => (
    <svg style={{ width: size, height: size, animation: "spin 1s linear infinite", flexShrink: 0 }} fill="none" viewBox="0 0 24 24">
      <circle style={{ opacity: 0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  // ────────────────────────────────────────────────────────────────────────────
  return (
    // 검정 전체 배경 + 중앙 컨테이너
    <div style={{ minHeight: "100vh", background: "#000", padding: "32px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: "1280px", border: "1px solid #1f1f1f", borderRadius: "16px", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <header style={{ background: "#000", borderBottom: "1px solid #1f1f1f", padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <span style={{ ...S.label, borderBottom: "2px solid #C8FF00", paddingBottom: "5px", color: "#AAAAAA" }}>
              IM-NOT-AI
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <span style={{ ...S.label }}>10 카테고리 · 80+ 패턴</span>
            <span style={{ ...S.label }}>@im-not-ai</span>
            <a href="https://github.com/epoko77-ai/im-not-ai" target="_blank" rel="noopener noreferrer"
              style={{ ...S.label, color: "#555", textDecoration: "none", transition: "color 0.15s" }}
              onMouseOver={e => (e.currentTarget.style.color = "#C8FF00")}
              onMouseOut={e  => (e.currentTarget.style.color = "#555")}>
              GitHub ↗
            </a>
          </div>
        </header>

        {/* ── Main 2-col ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "72vh" }}>

          {/* ── LEFT: Input ── */}
          <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #1f1f1f" }}>

            {/* Options bar */}
            <div style={{ background: "#0a0a0a", borderBottom: "1px solid #1f1f1f", padding: "10px 20px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={S.label}>장르</span>
              <select value={genre} onChange={e => setGenre(e.target.value)}
                style={{ ...S.mono, fontSize: "11px", background: "#1A1A1A", color: "#AAAAAA", border: "1px solid #2a2a2a", borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}>
                {GENRE_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>

              <div style={{ display: "flex", gap: "4px" }}>
                {(["fast", "strict"] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)} style={{ ...S.mono, fontSize: "11px", padding: "4px 10px", borderRadius: "3px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", transition: "all 0.15s", background: mode === m ? "#C8FF00" : "transparent", color: mode === m ? "#000" : "#555", border: mode === m ? "1px solid #C8FF00" : "1px solid #2a2a2a", fontWeight: mode === m ? 700 : 400 }}>
                    {m}
                  </button>
                ))}
              </div>

              <button onClick={() => setInputText(SAMPLE_TEXT)}
                style={{ ...S.mono, marginLeft: "auto", fontSize: "11px", color: "#555", background: "transparent", border: "1px solid #2a2a2a", borderRadius: "3px", padding: "4px 10px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", transition: "all 0.15s" }}
                onMouseOver={e => { e.currentTarget.style.color = "#C8FF00"; e.currentTarget.style.borderColor = "#C8FF00"; }}
                onMouseOut={e  => { e.currentTarget.style.color = "#555";    e.currentTarget.style.borderColor = "#2a2a2a"; }}>
                샘플 텍스트
              </button>
            </div>

            {/* Textarea */}
            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onInput={e  => setInputText((e.currentTarget as HTMLTextAreaElement).value)}
                placeholder="AI가 생성한 한글 텍스트를 붙여넣으세요..."
                style={{ width: "100%", height: "100%", minHeight: "340px", background: "transparent", border: "none", outline: "none", resize: "none", padding: "24px", fontSize: "15px", lineHeight: "1.75", color: "#fff", caretColor: "#C8FF00", fontFamily: "var(--font-ko)" }}
              />
              <span style={{ ...S.mono, position: "absolute", bottom: "14px", right: "18px", fontSize: "11px", color: charCount > 18000 ? "#ff5555" : "#444" }}>
                {charCount.toLocaleString()} / 20,000
              </span>
            </div>

            {/* Run button */}
            <div style={{ background: "#0a0a0a", borderTop: "1px solid #1f1f1f", padding: "14px 20px" }}>
              <button onClick={handleSubmit} style={{ width: "100%", padding: "13px 20px", borderRadius: "8px", fontSize: "14px", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.15s", background: canRun ? "#C8FF00" : "#111", color: canRun ? "#000" : "#444", border: canRun ? "none" : "1px solid #1f1f1f", cursor: canRun ? "pointer" : isLoading ? "wait" : "not-allowed", letterSpacing: "-0.01em" }}>
                {isLoading ? <><Spinner /><span style={S.mono}>탐지 중...</span></> : <>
                  <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI 티 제거하기
                </>}
              </button>
            </div>
          </div>

          {/* ── RIGHT: Output ── */}
          <div style={{ display: "flex", flexDirection: "column" }}>

            {/* Tab bar */}
            <div style={{ background: "#0a0a0a", borderBottom: "1px solid #1f1f1f", padding: "0 20px", display: "flex", alignItems: "center", gap: "0" }}>
              {([
                { key: "output",     label: "윤문본" },
                { key: "detections", label: `탐지 리포트${result ? ` (${result.detections.length})` : ""}` },
                { key: "diff",       label: "변경 비교" },
              ] as const).map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  style={{ ...S.mono, padding: "14px 16px", fontSize: "11px", background: "transparent", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: activeTab === tab.key ? "2px solid #C8FF00" : "2px solid transparent", color: activeTab === tab.key ? "#C8FF00" : "#555", transition: "all 0.15s", marginBottom: "-1px" }}>
                  {tab.label}
                </button>
              ))}
              {result && (
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "14px" }}>
                  <span style={{ ...S.mono, fontSize: "11px", color: "#555" }}>
                    변경률 <span style={{ color: "#AAAAAA" }}>{(result.stats.change_rate * 100).toFixed(0)}%</span>
                  </span>
                  <span style={{ fontSize: "22px", fontWeight: 900, color: GRADE[result.stats.grade].color, lineHeight: 1 }}>
                    {result.stats.grade}
                  </span>
                </div>
              )}
            </div>

            {/* Content area */}
            <div style={{ flex: 1, overflowY: "auto" }}>

              {/* Loading */}
              {isLoading && !result && (
                <div style={{ padding: "40px 24px", display: "flex", alignItems: "center", gap: "12px", color: "#555" }}>
                  <Spinner />
                  <span style={{ ...S.mono, fontSize: "12px" }}>AI 패턴 분석 중...</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ padding: "24px" }}>
                  <div style={{ background: "rgba(255,80,80,0.08)", borderLeft: "3px solid #ff5555", borderRadius: "0 8px 8px 0", padding: "14px 18px", fontSize: "13px", color: "#ff9999" }}>
                    <strong>오류:</strong> {error}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!isLoading && !result && !error && (
                <div style={{ padding: "52px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid #C8FF00", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
                    <svg style={{ width: 24, height: 24, color: "#C8FF00" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>AI 글을 붙여넣고 실행하세요</p>
                  <p style={{ fontSize: "13px", color: "#555", marginBottom: "28px" }}>10대 카테고리 · 80+ 패턴 · 국립국어원 기준</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", width: "100%", maxWidth: "260px" }}>
                    {["번역투/이중피동", "AI 관용구", "명사+동사 축약", "풀어쓰기 교정", "군더더기 제거", "문장 종결 개선"].map(p => (
                      <div key={p} style={{ ...S.lcard(), padding: "8px 12px", fontSize: "12px", color: "#AAAAAA" }}>{p}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── OUTPUT TAB ── */}
              {result && activeTab === "output" && (
                <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* Stats 4-grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}>
                    {[
                      { label: "S1 결정적", value: result.stats.s1_count, accent: result.stats.s1_count > 0 },
                      { label: "S2 강함",   value: result.stats.s2_count, accent: false },
                      { label: "S3 약함",   value: result.stats.s3_count, accent: false },
                      { label: "변경률", value: `${(result.stats.change_rate * 100).toFixed(0)}%`, accent: false },
                    ].map(s => (
                      <div key={s.label} style={{ ...S.lcard(s.accent), textAlign: "center", padding: "12px 8px" }}>
                        <div style={{ fontSize: "22px", fontWeight: 900, color: s.accent ? "#C8FF00" : "#fff", lineHeight: 1 }}>{s.value}</div>
                        <div style={{ ...S.label, marginTop: "4px" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Grade card */}
                  <div style={{ ...S.lcard() }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                      <span style={{ fontSize: "30px", fontWeight: 900, color: GRADE[result.stats.grade].color, lineHeight: 1 }}>{result.stats.grade}</span>
                      <span style={{ fontSize: "13px", color: "#AAAAAA" }}>{GRADE[result.stats.grade].label}</span>
                    </div>
                    <p style={{ fontSize: "13px", color: "#555", lineHeight: 1.6 }}>{result.summary}</p>
                  </div>

                  {/* Humanized output */}
                  <div style={{ background: "#1A1A1A", borderRadius: "10px", overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #2a2a2a" }}>
                      <span style={S.label}>윤문 결과</span>
                      <button onClick={() => handleCopy(result.humanized)}
                        style={{ ...S.mono, fontSize: "11px", padding: "4px 10px", borderRadius: "3px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", transition: "all 0.15s", background: copied ? "rgba(200,255,0,0.12)" : "transparent", color: copied ? "#C8FF00" : "#555", border: copied ? "1px solid rgba(200,255,0,0.3)" : "1px solid #2a2a2a" }}>
                        {copied ? "복사됨 ✓" : "복사"}
                      </button>
                    </div>
                    <div style={{ padding: "20px" }}>
                      <p style={{ fontSize: "15px", lineHeight: "1.75", color: "#fff", whiteSpace: "pre-wrap" }}>{result.humanized}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── DETECTIONS TAB ── */}
              {result && activeTab === "detections" && (
                <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {result.detections.length === 0
                    ? <div style={{ textAlign: "center", padding: "48px", ...S.label }}>탐지된 AI 패턴이 없습니다.</div>
                    : result.detections.map((d, i) => (
                      <div key={i} style={{ background: "#1A1A1A", borderLeft: `3px solid ${d.severity === "S1" ? "#C8FF00" : "#2a2a2a"}`, borderRadius: "0 10px 10px 0", padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                          {/* Circle badge */}
                          <div style={{ width: 30, height: 30, borderRadius: "50%", border: `2px solid ${SEV[d.severity].border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...S.mono, fontSize: "10px", fontWeight: 700, color: SEV[d.severity].color }}>
                            {d.severity}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                              <span style={{ ...S.mono, fontSize: "11px", fontWeight: 700, color: "#C8FF00" }}>{d.pattern_id}</span>
                              <span style={{ fontSize: "11px", color: "#555" }}>{d.category}</span>
                            </div>
                            <p style={{ fontSize: "12px", color: "#555", marginBottom: "8px", lineHeight: 1.5 }}>{d.description}</p>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", flexWrap: "wrap" }}>
                              <span style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff9999", padding: "2px 8px", borderRadius: "3px", textDecoration: "line-through" }}>{d.original_span}</span>
                              <span style={{ color: "#444" }}>→</span>
                              <span style={{ background: "rgba(200,255,0,0.08)", border: "1px solid rgba(200,255,0,0.2)", color: "#C8FF00", padding: "2px 8px", borderRadius: "3px" }}>{d.suggested || "(삭제)"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}

              {/* ── DIFF TAB ── */}
              {result && activeTab === "diff" && (
                <div style={{ padding: "20px 24px" }}>
                  <div style={{ background: "#111", borderRadius: "10px", padding: "16px", overflowX: "auto" }}>
                    {renderDiff()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer style={{ background: "#000", borderTop: "1px solid #1f1f1f", padding: "12px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={S.label}>im-not-ai v2.0 · 10대 카테고리 × 80+ 패턴 · 국립국어원 기준 · 로컬 엔진</span>
          <span style={S.label}>@im-not-ai</span>
        </footer>
      </div>
    </div>
  );
}
