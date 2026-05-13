import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "im-not-ai — 한글 AI 티 제거기",
  description:
    "AI(ChatGPT·Claude·Gemini)가 쓴 한글 글을 내용은 그대로 두고 문체·리듬·표현만 자연스러운 한국어로 되돌립니다.",
  openGraph: {
    title: "im-not-ai — 한글 AI 티 제거기",
    description:
      "번역투·관용구·기계적 병렬 등 40+ AI 패턴을 탐지하고 자연스러운 한국어로 윤문합니다.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
