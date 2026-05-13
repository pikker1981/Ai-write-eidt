/**
 * lib/humanize.ts
 * 한글 AI 티 제거 — 순수 규칙 기반 엔진 (외부 API 불필요)
 * 10대 카테고리 × 40+ 패턴
 */

export interface Detection {
  pattern_id: string;
  category: string;
  severity: "S1" | "S2" | "S3";
  original_span: string;
  suggested: string;
  description: string;
}

export interface HumanizeResult {
  humanized: string;
  detections: Detection[];
  stats: {
    char_before: number;
    char_after: number;
    change_rate: number;
    s1_count: number;
    s2_count: number;
    s3_count: number;
    grade: "A" | "B" | "C" | "D";
  };
  summary: string;
}

type RuleResult = { text: string; found: Detection[] };
type Rule = { id: string; run: (t: string) => RuleResult };

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function countStr(text: string, sub: string): number {
  let n = 0;
  let pos = 0;
  while ((pos = text.indexOf(sub, pos)) !== -1) { n++; pos += sub.length; }
  return n;
}

function replaceAll(text: string, from: string, to: string): string {
  return text.split(from).join(to);
}

function det(
  id: string, category: string, severity: Detection["severity"],
  original_span: string, suggested: string, description: string,
): Detection {
  return { pattern_id: id, category, severity, original_span, suggested, description };
}

// ── A. 번역투 ─────────────────────────────────────────────────────────────────

const ruleA4: Rule = {
  id: "A-4",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      ["되어지고", "되고"], ["되어지며", "되며"], ["되어지는", "되는"],
      ["되어진", "된"], ["되어집니다", "됩니다"], ["되어져서", "돼서"],
      ["되어져", "돼"], ["되어졌", "됐"], ["되어지", "되"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("A-4", "번역투", "S1", from, to, `이중 피동 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

const ruleA3: Rule = {
  id: "A-3",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    if (t.includes("에 있어서")) {
      t = replaceAll(t, "에 있어서", "에서");
      found.push(det("A-3", "번역투", "S2", "에 있어서", "에서", '"에 있어서" → "에서"'));
    }
    if (t.includes("에 있어 ")) {
      t = replaceAll(t, "에 있어 ", "에서 ");
      found.push(det("A-3", "번역투", "S2", "에 있어", "에서", '"에 있어" → "에서"'));
    }
    return { text: t, found };
  },
};

const ruleA5: Rule = {
  id: "A-5",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      ["를 가지고 있습니다", "가 있습니다"],
      ["을 가지고 있습니다", "이 있습니다"],
      ["를 가지고 있다", "가 있다"],
      ["을 가지고 있다", "이 있다"],
      ["를 가지고 있는", "가 있는"],
      ["을 가지고 있는", "이 있는"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("A-5", "번역투", "S2", from, to, `"가지고 있다" 불필요한 소유 구문 제거`));
      }
    }
    return { text: t, found };
  },
};

const ruleA1: Rule = {
  id: "A-1",
  run(text) {
    const found: Detection[] = [];
    // detect "~를/을 통해(서)" — report + auto-fix vowel/consonant
    const re = /([가-힣A-Za-z0-9]+)(를|을) 통해서?(?=\s|[.,。]|$)/g;
    let m: RegExpExecArray | null;
    const original = text;
    let t = text;
    const regex = new RegExp(re.source, "g");
    const replacements: [string, string][] = [];
    while ((m = regex.exec(original)) !== null) {
      const full = m[0];
      const word = m[1];
      const particle = m[2];
      const repl = particle === "를" ? `${word}로` : `${word}으로`;
      replacements.push([full, repl]);
      found.push(det("A-1", "번역투", "S2", full, repl, '"~를/을 통해" → "~로/으로"'));
    }
    for (const [from, to] of replacements) {
      t = replaceAll(t, from, to);
    }
    return { text: t, found };
  },
};

const ruleA2: Rule = {
  id: "A-2",
  run(text) {
    const found: Detection[] = [];
    const re = /[가-힣A-Za-z0-9]+(?:에 대해|에 대한)/g;
    const matches = text.match(re) || [];
    const seen = new Set<string>();
    for (const m of matches) {
      if (!seen.has(m)) {
        seen.add(m);
        found.push(det("A-2", "번역투", "S2", m, "(간결한 표현 권장)", '"~에 대해/에 대한" 번역투'));
      }
    }
    return { text, found };
  },
};

const ruleA6: Rule = {
  id: "A-6",
  run(text) {
    const found: Detection[] = [];
    const count = countStr(text, "할 수 있다") + countStr(text, "할 수 있습니다");
    if (count >= 3) {
      found.push(det("A-6", "번역투", "S2", `"할 수 있다" (${count}회)`, "(직접 서술 권장)", `"할 수 있다" ${count}회 남발`));
    }
    return { text, found };
  },
};

// ── C. 구조적 AI 패턴 ─────────────────────────────────────────────────────────

const ruleC11: Rule = {
  id: "C-11",
  run(text) {
    const found: Detection[] = [];
    // 연결어미 뒤 쉼표: 고, 며, 면서, 지만, 거나, 는데, 하여, 하고, 으나, 아서, 어서 + ","
    const re = /(고|며|면서|지만|거나|는데|하여|하고|으나|아서|어서|이어서|하며|하지만|하면서),(\s)/g;
    const t = text.replace(re, (_, ending, space) => {
      found.push(det("C-11", "구조적 AI 패턴", "S1", ending + ",", ending, "연결어미 뒤 쉼표 제거"));
      return ending + space;
    });
    return { text: t, found };
  },
};

const ruleC1: Rule = {
  id: "C-1",
  run(text) {
    const found: Detection[] = [];
    const count = (text.match(/(?:첫째|둘째|셋째|넷째|다섯째)/g) || []).length;
    if (count >= 2) {
      found.push(det("C-1", "구조적 AI 패턴", "S2", `첫째/둘째/셋째 (${count}회)`, "(자연스러운 연결어 권장)", `기계적 나열 패턴 ${count}회`));
    }
    return { text, found };
  },
};

const ruleC10: Rule = {
  id: "C-10",
  run(text) {
    const found: Detection[] = [];
    // "X: Y" 콜론 헤딩 패턴 — 줄 시작에서
    const re = /^[가-힣A-Za-z0-9 ]+: /gm;
    const matches = text.match(re) || [];
    if (matches.length >= 2) {
      matches.forEach(m =>
        found.push(det("C-10", "구조적 AI 패턴", "S2", m.trim(), "(일반 문장으로 교체 권장)", '"X: Y" 콜론 헤딩 공식'))
      );
    }
    return { text, found };
  },
};

// ── D. AI 특유 관용구 ──────────────────────────────────────────────────────────

const ruleD1: Rule = {
  id: "D-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pivots = ["결론적으로", "요약하자면", "정리하자면", "한마디로", "종합하면", "종합적으로", "이를 종합하면", "이상을 정리하면"];
    for (const p of pivots) {
      const re = new RegExp(p + "[,，]?\\s*", "g");
      if (re.test(t)) {
        t = t.replace(new RegExp(p + "[,，]?\\s*", "g"), "");
        found.push(det("D-1", "AI 특유 관용구", "S1", p, "(삭제)", `결산 표현 "${p}" 제거`));
      }
    }
    return { text: t, found };
  },
};

const ruleD2: Rule = {
  id: "D-2",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      ["시사하는 바가 크다", "중요하다"],
      ["시사하는 바가 있다", "의미가 있다"],
      ["시사점이 크다", "의미가 크다"],
      ["주목할 만하다", "눈에 띈다"],
      ["주목할 필요가 있다", "살펴봐야 한다"],
      ["중요한 의미를 가진다", "중요하다"],
      ["큰 의미를 가진다", "의미 있다"],
      ["많은 것을 시사한다", "중요하다"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("D-2", "AI 특유 관용구", "S1", from, to, `AI 관용구 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

const ruleD3: Rule = {
  id: "D-3",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      ["중요한 점은 ~라는 것이다", "~이다"],
      ["이는 ~를 의미한다", "~이다"],
    ];
    // D-3: "~라고 할 수 있다" → 직접 서술
    const re = /([가-힣 ]+)라고 할 수 있다/g;
    t = t.replace(re, (_, before) => {
      found.push(det("D-3", "AI 특유 관용구", "S2", before.trim() + "라고 할 수 있다", before.trim() + "이다", '"~라고 할 수 있다" → "~이다"'));
      return before.trim() + "이다";
    });
    const re2 = /([가-힣 ]+)라고 볼 수 있다/g;
    t = t.replace(re2, (_, before) => {
      found.push(det("D-3", "AI 특유 관용구", "S2", before.trim() + "라고 볼 수 있다", before.trim() + "이다", '"~라고 볼 수 있다" → "~이다"'));
      return before.trim() + "이다";
    });
    return { text: t, found };
  },
};

const ruleD4: Rule = {
  id: "D-4",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      ["혁신적인", "새로운"], ["혁신적으로", "새롭게"],
      ["획기적인", "눈에 띄는"], ["획기적으로", "크게"],
      ["전례 없는", "처음 있는"], ["전례 없이", "처음으로"],
      ["압도적인", "두드러진"], ["압도적으로", "크게"],
      ["막강한", "강력한"], ["폭발적인", "급격한"],
      ["파격적인", "과감한"], ["대대적인", "대규모"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("D-4", "AI 특유 관용구", "S2", from, to, `hype 어휘 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

const ruleD7: Rule = {
  id: "D-7",
  run(text) {
    const found: Detection[] = [];
    // "X에서 Y로" / "X을 넘어 Y로" 변환 공식
    const re = /[가-힣A-Za-z0-9]+에서 [가-힣A-Za-z0-9]+으?로/g;
    const matches = text.match(re) || [];
    if (matches.length >= 2) {
      matches.forEach(m =>
        found.push(det("D-7", "AI 특유 관용구", "S2", m, "(자연스러운 표현 권장)", '"X에서 Y로" 변환 공식'))
      );
    }
    return { text, found };
  },
};

// ── E. 리듬 균일성 ────────────────────────────────────────────────────────────

const ruleE3: Rule = {
  id: "E-3",
  run(text) {
    const found: Detection[] = [];
    let t = text;

    // 종결어미 → 연결어미 자동 치환 맵
    // 주의: 합니다/됩니다/입니다 계열 제외 — 어간 분리 없이 치환하면
    // "해야 합니다." → "해야 하며" 처럼 문맥에 따라 부자연스러운 문장 생성 가능
    const autoFix: Record<string, string> = {
      "한다": "하며",
      "된다": "되며",
      "이다": "이며",
      "있다": "있으며",
      "없다": "없으며",
    };

    // 문장 종결 단위 분리 후 어미 집계
    const sentences = text.split(/(?<=[.。!?])\s+/).filter(s => s.trim().length > 4);
    if (sentences.length < 4) return { text, found };

    const endCounts: Record<string, number> = {};
    sentences.forEach(s => {
      const clean = s.trim().replace(/[.。!?]+$/, "");
      // 마지막 2~5글자 어미 후보들 체크
      for (const ending of Object.keys(autoFix)) {
        if (clean.endsWith(ending)) {
          endCounts[ending] = (endCounts[ending] || 0) + 1;
          break;
        }
      }
    });

    // 5회↑ → 중간 문장들(마지막 제외) 중 3번째마다 연결어미 변환
    for (const [ending, cnt] of Object.entries(endCounts)) {
      const connector = autoFix[ending] ?? null;
      if (!connector) continue;

      if (cnt >= 5) {
        let n = 0;
        // 문장 끝 + 뒤에 공백/다음 문장 있는 것만 변환 (마지막 문장 제외)
        const re = new RegExp(
          `([^.!?\\n]{3,40})${ending}([.。])( +)`,
          "g"
        );
        const fixed = t.replace(re, (m, pre, _punct, sp) => {
          n++;
          if (n % 3 === 0) {
            found.push(det(
              "E-3", "리듬 균일성", "S2",
              `...${ending}.`, `...${connector}`,
              `동일 종결어미 "${ending}"(${n}번째) → "${connector}" 자동 변환`
            ));
            return pre + connector + sp;
          }
          return m;
        });
        if (n > 0) t = fixed;
      } else if (cnt >= 4) {
        found.push(det(
          "E-3", "리듬 균일성", "S3",
          `"...${ending}" (${cnt}회)`, "(종결어미 다양화 권장)",
          `동일 종결어미 "${ending}" ${cnt}회 반복 — 직접 수정 권장`
        ));
      }
    }

    return { text: t, found };
  },
};

const ruleE2: Rule = {
  id: "E-2",
  run(text) {
    const found: Detection[] = [];
    // "~고 있다" 진행형 자동 매핑 과다
    const count = (text.match(/고 있다/g) || []).length + (text.match(/고 있습니다/g) || []).length;
    if (count >= 4) {
      found.push(det("E-2", "리듬 균일성", "S3", `"~고 있다" (${count}회)`, "(단순 현재형 권장)", `진행형 과다 사용 ${count}회`));
    }
    return { text, found };
  },
};

// ── F. 수식·중복 ──────────────────────────────────────────────────────────────

const ruleF1: Rule = {
  id: "F-1",
  run(text) {
    const found: Detection[] = [];
    const adverbs = ["매우", "정말", "굉장히", "너무나", "몹시"];
    for (const adv of adverbs) {
      const count = (text.match(new RegExp(adv, "g")) || []).length;
      if (count >= 3) {
        found.push(det("F-1", "수식·중복", "S3", `"${adv}" (${count}회)`, "(최소화 권장)", `부사 "${adv}" ${count}회 과다`));
      }
    }
    return { text, found };
  },
};

const ruleF4: Rule = {
  id: "F-4",
  run(text) {
    const found: Detection[] = [];
    const suffixes = ["적인", "적으로", "성이", "성을", "성의", "화가", "화를", "화의"];
    let total = 0;
    for (const s of suffixes) {
      total += (text.match(new RegExp(`[가-힣]{2}${s}`, "g")) || []).length;
    }
    if (total >= 6) {
      found.push(det("F-4", "수식·중복", "S3", `한자어 명사화 접미사 (${total}회)`, "(순화 권장)", `"-적/-성/-화" 접미사 ${total}회 과다`));
    }
    return { text, found };
  },
};

// ── G. Hedging 남용 ───────────────────────────────────────────────────────────

const ruleG1: Rule = {
  id: "G-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const hedges: [string, string][] = [
      ["할 수 있을 것으로 보인다", "할 수 있다"],
      ["할 수 있을 것으로 예상된다", "할 수 있다"],
      ["할 수 있을 것으로 판단된다", "할 수 있다"],
      ["것으로 보인다", "것이다"],
      ["것으로 예상된다", "것이다"],
      ["것으로 판단된다", "것이다"],
      ["것으로 생각된다", "것이다"],
      ["것으로 사료된다", "것이다"],
      ["것으로 보입니다", "것입니다"],
      ["것으로 예상됩니다", "것입니다"],
    ];
    for (const [from, to] of hedges) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("G-1", "Hedging 남용", "S2", from, to, `다중 완곡 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

const ruleG3: Rule = {
  id: "G-3",
  run(text) {
    const found: Detection[] = [];
    const balances = ["장단점이 있다", "장점도 있지만 단점도", "균형 잡힌 시각", "양쪽 모두", "신중하게 검토"];
    let count = 0;
    for (const b of balances) {
      if (text.includes(b)) count++;
    }
    if (count >= 2) {
      found.push(det("G-3", "Hedging 남용", "S2", `안전 균형 표현 (${count}개)`, "(구체적 서술 권장)", "안전 균형 언어 과다"));
    }
    return { text, found };
  },
};

// ── H. 접속사 남발 ────────────────────────────────────────────────────────────

const ruleH1: Rule = {
  id: "H-1",
  run(text) {
    const found: Detection[] = [];
    const connectives = ["또한", "따라서", "즉", "나아가", "더불어", "아울러", "그러므로", "이에"];
    for (const conn of connectives) {
      // 문두(문장 시작 또는 마침표 뒤)에서의 사용 횟수
      const re = new RegExp(`(?:^|[.!?]\\s+)${conn}`, "gm");
      const count = (text.match(re) || []).length;
      if (count >= 3) {
        found.push(det("H-1", "접속사 남발", "S2", `"${conn}" 문두 (${count}회)`, "(최소화 권장)", `문두 "${conn}" ${count}회 남발`));
      }
    }
    return { text, found };
  },
};

// ── I. 형식명사 과다 ──────────────────────────────────────────────────────────

const ruleI4: Rule = {
  id: "I-4",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const count1 = countStr(t, "할 필요가 있다");
    const count2 = countStr(t, "할 필요가 있습니다");
    if (count1 >= 1) {
      t = replaceAll(t, "할 필요가 있다", "해야 한다");
      found.push(det("I-4", "형식명사 과다", "S2", `"할 필요가 있다" (${count1}회)`, "해야 한다", `권고형 → "해야 한다"`));
    }
    if (count2 >= 1) {
      t = replaceAll(t, "할 필요가 있습니다", "해야 합니다");
      found.push(det("I-4", "형식명사 과다", "S2", `"할 필요가 있습니다" (${count2}회)`, "해야 합니다", `권고형 → "해야 합니다"`));
    }
    return { text: t, found };
  },
};

const ruleI1: Rule = {
  id: "I-1",
  run(text) {
    const found: Detection[] = [];
    // I-6이 문말 것이다를 처리한 이후 잔여 횟수만 탐지
    // 주의: " 것이다" → "다" 단순치환은 "학습하는다." 등 오문 생성 → 자동치환 금지
    const count = countStr(text, "것이다") + countStr(text, "것입니다");
    if (count >= 4) {
      found.push(det("I-1", "형식명사 과다", "S3",
        `"것이다" (${count}회)`,
        "(직접 서술로 수정 권장)",
        `"것이다/것입니다" ${count}회 — 직접 서술 권장`
      ));
    }
    return { text, found };
  },
};

const ruleI3: Rule = {
  id: "I-3",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      ["라는 뜻이다", "이다"],
      ["다는 뜻이다", "이다"],
      ["라는 의미다", "이다"],
      ["라는 점에서", "에서"],
      ["한 점에서", "에서"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("I-3", "형식명사 과다", "S2", from, to, `형식명사 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── F-2. 동의어 이중수식 ────────────────────────────────────────────────────────

const ruleF2: Rule = {
  id: "F-2",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      ["빠르고 신속한", "신속한"], ["빠르고 빠른", "빠른"],
      ["명확하고 분명한", "명확한"], ["분명하고 명확한", "분명한"],
      ["크고 광범위한", "광범위한"], ["다양하고 여러", "다양한"],
      ["새롭고 혁신적인", "새로운"], ["중요하고 핵심적인", "핵심적인"],
      ["깊고 심층적인", "심층적인"], ["넓고 포괄적인", "포괄적인"],
      ["강하고 강력한", "강력한"], ["높고 우수한", "우수한"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("F-2", "수식·중복", "S2", from, to, `동의어 이중수식 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── J. 시각 장식 남용 ─────────────────────────────────────────────────────────

const ruleJ1: Rule = {
  id: "J-1",
  run(text) {
    const found: Detection[] = [];
    const matches = text.match(/\*\*[^*\n]+\*\*/g) || [];
    if (matches.length < 5) return { text, found };
    let count = 0;
    const t = text.replace(/\*\*([^*\n]+)\*\*/g, (m, inner) => {
      count++;
      if (count > 2) {
        found.push(det("J-1", "시각 장식 남용", "S2", m, inner, `볼드 과다 제거 (${matches.length}개 중)`));
        return inner;
      }
      return m;
    });
    return { text: t, found };
  },
};

const ruleJ2: Rule = {
  id: "J-2",
  run(text) {
    const found: Detection[] = [];
    // 따옴표 강조 어휘 빈도 (큰따옴표 기준)
    const count = (text.match(/[''「」""][가-힣A-Za-z0-9 ]+[''「」""]/g) || []).length;
    if (count >= 5) {
      found.push(det("J-2", "시각 장식 남용", "S2", `따옴표 강조 (${count}회)`, "(직접 표현 권장)", `따옴표 강조 ${count}회 과다`));
    }
    return { text, found };
  },
};

// ── K. 풀어쓰기 → 함축 (국립국어원 교정 원칙) ───────────────────────────────

const ruleK1: Rule = {
  id: "K-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // 위해서 → 위해
      ["위해서 ", "위해 "],
      // 불필요한 우회 하게 되다
      ["하게 됩니다", "합니다"], ["하게 된다", "한다"],
      ["하게 되었다", "했다"], ["하게 되었습니다", "했습니다"],
      ["하게 될 것이다", "할 것이다"],
      // 이루어지다 → 되다
      ["이루어지고 있다", "진행 중이다"], ["이루어지고 있습니다", "진행 중입니다"],
      ["이루어진다", "된다"], ["이루어집니다", "됩니다"],
      ["이루어졌다", "됐다"], ["이루어졌습니다", "됐습니다"],
      // 실시하다 → 하다/열다
      ["을 실시한다", "을 한다"], ["를 실시한다", "를 한다"],
      ["을 실시했다", "을 했다"], ["를 실시했다", "를 했다"],
      ["을 실시하고", "을 하고"], ["를 실시하고", "를 하고"],
      // 진행하다/되다 단순화
      ["을 진행하다", "을 하다"], ["를 진행하다", "를 하다"],
      // 통해서 (A-1에서 못잡은 명사 없는 케이스)
      ["이를 통해서", "이를 통해"],
      ["그를 통해서", "그를 통해"],
      // 현재 시점
      ["현재 시점에서", "지금"], ["현재 시점으로", "지금"],
      ["현재 시점에", "지금"],
      // 거듭된 풀어쓰기
      ["에 있는 것을", "을"], ["에 있는 것이", "이"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("K-1", "풀어쓰기 교정", "S2", from, to, `풀어쓰기 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

const ruleK2: Rule = {
  id: "K-2",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    // 지속적으로 → 계속 / 꾸준히
    const pairs: [string, string][] = [
      ["지속적으로", "꾸준히"], ["지속적인", "꾸준한"],
      ["지속가능한", "지속 가능한"],
      ["다양한 측면에서", "여러 면에서"],
      ["다양한 관점에서", "여러 관점에서"],
      ["광범위한 분야에서", "여러 분야에서"],
      ["전반적으로", "대체로"], ["전반적인", "전체적인"],
      ["본격적으로", "본격히"], ["본격적인", "본격"],
      ["적극적으로", "적극"], ["적극적인", "적극적"],
      ["구체적으로", "구체적으로"],   // 이건 그대로
    ];
    const active: [string, string][] = pairs.filter(([f, t2]) => f !== t2);
    for (const [from, to] of active) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("K-2", "풀어쓰기 교정", "S3", from, to, `단어 단순화 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── L. 이중피동 확장 ──────────────────────────────────────────────────────────

const ruleL1: Rule = {
  id: "L-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      ["보여지다", "보이다"], ["보여집니다", "보입니다"],
      ["보여지고", "보이고"], ["보여지는", "보이는"],
      ["보여졌다", "보였다"], ["보여진다", "보인다"],
      ["느껴지다", "느끼다"], ["느껴집니다", "느낍니다"],
      ["느껴지고", "느끼고"], ["느껴지는", "느끼는"],
      ["느껴진다", "느낀다"], ["느껴졌다", "느꼈다"],
      ["알려지게", "알려지게"], // 이건 자연스러워 제외
      ["읽혀지다", "읽히다"], ["읽혀지는", "읽히는"],
      ["쓰여지다", "쓰이다"], ["쓰여지는", "쓰이는"],
      ["만들어지다", "만들다"], ["만들어집니다", "만들어집니다"], // 이건 자연스러워 유지
      ["여겨지다", "여기다"], ["여겨집니다", "여깁니다"],
      ["여겨지는", "여기는"], ["여겨진다", "여긴다"],
    ];
    const apply: [string, string][] = pairs.filter(([f, t2]) => f !== t2);
    for (const [from, to] of apply) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("L-1", "이중피동", "S1", from, to, `이중피동 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── M. 명사+동사 → 단일동사 (국어 교정 원칙) ────────────────────────────────

const ruleM1: Rule = {
  id: "M-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      ["결정을 내리다", "결정하다"], ["결정을 내렸다", "결정했다"],
      ["결정을 내린다", "결정한다"], ["결정을 내리고", "결정하고"],
      ["선택을 하다", "선택하다"], ["선택을 했다", "선택했다"],
      ["선택을 한다", "선택한다"], ["선택을 하고", "선택하고"],
      ["노력을 하다", "노력하다"], ["노력을 했다", "노력했다"],
      ["노력을 한다", "노력한다"], ["노력을 하고", "노력하고"],
      ["확인을 하다", "확인하다"], ["확인을 했다", "확인했다"],
      ["확인을 한다", "확인한다"], ["확인을 하고", "확인하고"],
      ["생각을 하다", "생각하다"], ["생각을 했다", "생각했다"],
      ["생각을 한다", "생각한다"], ["생각을 하고", "생각하고"],
      ["경험을 하다", "경험하다"], ["경험을 했다", "경험했다"],
      ["경험을 한다", "경험한다"], ["경험을 하고", "경험하고"],
      ["시작을 하다", "시작하다"], ["시작을 했다", "시작했다"],
      ["시작을 한다", "시작한다"], ["시작을 하고", "시작하고"],
      ["판단을 하다", "판단하다"], ["판단을 했다", "판단했다"],
      ["판단을 한다", "판단한다"], ["판단을 하고", "판단하고"],
      ["발표를 하다", "발표하다"], ["발표를 했다", "발표했다"],
      ["발표를 한다", "발표한다"], ["발표를 하고", "발표하고"],
      ["준비를 하다", "준비하다"], ["준비를 했다", "준비했다"],
      ["준비를 한다", "준비한다"], ["준비를 하고", "준비하고"],
      ["검토를 하다", "검토하다"], ["검토를 했다", "검토했다"],
      ["검토를 한다", "검토한다"], ["검토를 하고", "검토하고"],
      ["분석을 하다", "분석하다"], ["분석을 했다", "분석했다"],
      ["분석을 한다", "분석한다"], ["분석을 하고", "분석하고"],
      ["논의를 하다", "논의하다"], ["논의를 했다", "논의했다"],
      ["논의를 한다", "논의한다"], ["논의를 하고", "논의하고"],
      ["강조를 하다", "강조하다"], ["강조를 했다", "강조했다"],
      ["강조를 한다", "강조한다"], ["강조를 하고", "강조하고"],
      ["설명을 하다", "설명하다"], ["설명을 했다", "설명했다"],
      ["설명을 한다", "설명한다"], ["설명을 하고", "설명하고"],
      ["이해를 하다", "이해하다"], ["이해를 했다", "이해했다"],
      ["이해를 한다", "이해한다"], ["이해를 하고", "이해하고"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("M-1", "명사+동사 축약", "S2", from, to, `"${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── N. 번역투 추가 ────────────────────────────────────────────────────────────

const ruleN1: Rule = {
  id: "N-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // 로 인해 → 때문에
      ["으로 인해서", "때문에"], ["로 인해서", "때문에"],
      ["으로 인해 ", "때문에 "], ["로 인해 ", "때문에 "],
      ["으로 인한", "때문인"], ["로 인한", "때문인"],
      // 에 따라서 → 따라
      ["에 따라서 ", "에 따라 "],
      // 에 대해서 → 에 대해
      ["에 대해서 ", "에 대해 "],
      ["에 대해서는", "에 대해서는"], // 이건 유지
      // 에 비해서 → 에 비해
      ["에 비해서 ", "에 비해 "],
      // 에 관해서 → 에 관해
      ["에 관해서 ", "에 관해 "],
      // 와 같은 경우 → (생략)
      ["과 같은 경우에는", "는"], ["와 같은 경우에는", "는"],
      ["과 같은 경우", ""], ["와 같은 경우", ""],
      // 다고 하는 → 다는
      ["다고 하는", "다는"],
      ["라고 하는", "라는"],
      // 이라고 하는 → 이라는
      ["이라고 하는", "이라는"],
    ];
    const active = pairs.filter(([f, t2]) => f !== t2);
    for (const [from, to] of active) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("N-1", "번역투", "S2", from, to, `번역투 "${from}" → "${to || "(삭제)"}"`));
      }
    }
    return { text: t, found };
  },
};

const ruleN2: Rule = {
  id: "N-2",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    // "~은/는/이/가 아닌가 싶다" → "~인 것 같다" 는 이미 hedging
    // "~지 않을 수 없다" → "~해야 한다" (이중부정)
    const pairs: [string, string][] = [
      ["지 않을 수 없다", "해야 한다"],
      ["지 않을 수 없습니다", "해야 합니다"],
      ["하지 않으면 안 된다", "해야 한다"],
      ["하지 않으면 안 됩니다", "해야 합니다"],
      // 불필요한 강조 접두어
      ["진정한 의미의 ", "진정한 "],
      ["진정한 의미에서 ", "진정으로 "],
      ["어떤 의미에서는", "어떤 면에서"],
      ["일정 부분", "어느 정도"],
      ["일정 수준", "어느 정도"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("N-2", "번역투", "S2", from, to, `이중부정/번역투 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── P. 군더더기 / 상투어 제거 ─────────────────────────────────────────────────

const ruleP1: Rule = {
  id: "P-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    // 문두 상투어 — 문장 시작 또는 마침표/줄바꿈 뒤
    const filler: [string, string][] = [
      ["사실상 ", ""], ["사실은 ", ""], ["실제로 ", ""],
      ["기본적으로 ", ""], ["일반적으로 ", ""],
      ["물론이고 ", ""], ["당연히도 ", ""],
      ["굳이 말하자면 ", ""], ["굳이 따지자면 ", ""],
      ["어찌 보면 ", ""], ["어떻게 보면 ", ""],
      ["이른바 ", ""], ["소위 ", ""],
    ];
    for (const [from, to] of filler) {
      // 문두(줄 시작)에서만 제거
      const re = new RegExp(`(^|(?<=[.!?\\n] ))${escRe(from)}`, "gm");
      if (re.test(t)) {
        t = t.replace(new RegExp(`(^|(?<=[.!?\\n] ))${escRe(from)}`, "gm"), "$1");
        found.push(det("P-1", "군더더기 표현", "S3", from.trim(), "(삭제)", `문두 상투어 "${from.trim()}" 제거`));
      }
    }
    return { text: t, found };
  },
};

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ruleP2: Rule = {
  id: "P-2",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // 다양한 → (구체적 어휘 없을 때 반복되면)
      // 여기서는 특정 패턴만 처리
      ["다양한 방면으로", "여러 방향으로"],
      ["다양한 방식으로", "여러 방식으로"],
      ["다양한 방법으로", "여러 방법으로"],
      ["여러 가지 다양한", "다양한"],
      ["많은 다양한", "다양한"],
      // 불필요 수량 표현
      ["수많은 ", "많은 "],
      ["무수히 많은 ", "많은 "],
      ["헤아릴 수 없이 많은 ", "수많은 "],
      // 어색한 접속
      ["그리고 또한", "또한"], ["그리고 더불어", "더불어"],
      ["하지만 그러나", "하지만"], ["그러나 하지만", "그러나"],
      ["하지만 그렇지만", "하지만"],
      // 불필요 어구
      ["라는 점을 감안하면", "이면"],
      ["라는 사실을 고려하면", "이면"],
    ];
    const active = pairs.filter(([f, t2]) => f !== t2);
    for (const [from, to] of active) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("P-2", "군더더기 표현", "S2", from, to, `군더더기 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── Q. 진행형 과다 자동치환 ───────────────────────────────────────────────────

const ruleQ1: Rule = {
  id: "Q-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    // "~하고 있다" → "~한다" (단순 현재, 4회 이상일 때 자동 치환)
    const count1 = countStr(t, "하고 있다");
    const count2 = countStr(t, "하고 있습니다");
    if (count1 >= 4) {
      t = replaceAll(t, "하고 있다", "한다");
      found.push(det("Q-1", "진행형 과다", "S2", `"하고 있다" (${count1}회)`, "한다", `진행형 과다 → 단순현재 치환`));
    }
    if (count2 >= 4) {
      t = replaceAll(t, "하고 있습니다", "합니다");
      found.push(det("Q-1", "진행형 과다", "S2", `"하고 있습니다" (${count2}회)`, "합니다", `진행형 과다 → 단순현재 치환`));
    }
    // "~되고 있다" → "~된다"
    const count3 = countStr(t, "되고 있다");
    if (count3 >= 4) {
      t = replaceAll(t, "되고 있다", "된다");
      found.push(det("Q-1", "진행형 과다", "S2", `"되고 있다" (${count3}회)`, "된다", `진행형 과다 → 단순현재 치환`));
    }
    return { text: t, found };
  },
};

// ── R. 문장 종결 개선 ─────────────────────────────────────────────────────────

const ruleR1: Rule = {
  id: "R-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // ~하는 것이 중요하다 → ~해야 한다
      ["하는 것이 중요하다", "해야 한다"],
      ["하는 것이 중요합니다", "해야 합니다"],
      // ~할 것으로 예상된다 (G-1에서 일부 처리, 추가 케이스)
      ["될 것으로 기대된다", "될 것이다"],
      ["될 것으로 기대됩니다", "될 것입니다"],
      ["될 것으로 전망된다", "될 것이다"],
      ["될 것으로 전망됩니다", "될 것입니다"],
      // ~라고 생각한다 → ~이다 (직접화)
      ["라고 생각된다", "이다"],
      ["라고 생각됩니다", "입니다"],
      // ~할 수 있을 것으로 보인다 (G-1 커버 안 된 경우)
      ["될 수 있을 것이다", "될 것이다"],
      // ~하지 않을까 생각된다
      ["하지 않을까 생각된다", "한다"],
      ["하지 않을까 싶다", "하다"],
      // 이를 통해 알 수 있다 → 이다
      ["이를 통해 알 수 있다", "이다"],
      ["이를 통해 알 수 있습니다", "입니다"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("R-1", "문장 종결 개선", "S2", from, to, `종결 개선 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── S. 탈명사화 (국립국어원 교열 핵심 원칙) ──────────────────────────────────
// "명사화 과다는 문장을 경직되게 만든다" — 국립국어원 어문 연구

const ruleS1: Rule = {
  id: "S-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // 필요성/가능성/중요성 → 형용사
      ["의 필요성이 있다", "이 필요하다"],
      ["의 필요성이 있습니다", "이 필요합니다"],
      ["의 필요성이 없다", "이 필요 없다"],
      ["의 중요성이 있다", "이 중요하다"],
      ["의 중요성이 있습니다", "이 중요합니다"],
      ["의 가능성이 있다", "일 수 있다"],
      ["의 가능성이 있습니다", "일 수 있습니다"],
      ["의 가능성이 크다", "일 가능성이 크다"],
      // 것이 가능하다 → 할 수 있다
      ["하는 것이 가능하다", "할 수 있다"],
      ["하는 것이 가능합니다", "할 수 있습니다"],
      // ~에 대한 OO가 필요하다 → ~을 OO해야 한다
      ["에 대한 논의가 필요하다", "을 논의해야 한다"],
      ["에 대한 논의가 필요합니다", "을 논의해야 합니다"],
      ["에 대한 검토가 필요하다", "을 검토해야 한다"],
      ["에 대한 검토가 필요합니다", "을 검토해야 합니다"],
      ["에 대한 이해가 필요하다", "을 이해해야 한다"],
      ["에 대한 이해가 필요합니다", "을 이해해야 합니다"],
      // 것으로 이어진다 탈명사화
      ["하는 것으로 이어진다", "으로 이어진다"],
      ["되는 것으로 이어진다", "으로 이어진다"],
      // ~하는 것을 통해 → ~해서
      ["하는 것을 통해", "함으로써"],
      ["되는 것을 통해", "됨으로써"],
      // ~의 역할을 하다 → 단일동사
      ["의 역할을 담당하고 있다", "역할을 맡고 있다"],
      ["의 역할을 담당한다", "역할을 맡는다"],
      ["의 역할을 수행하고 있다", "역할을 하고 있다"],
      ["의 역할을 수행한다", "역할을 한다"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("S-1", "탈명사화", "S2", from, to, `탈명사화 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── T. ~상황이다 군더더기 제거 ────────────────────────────────────────────────

const ruleT1: Rule = {
  id: "T-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      ["하고 있는 상황이다", "하고 있다"],
      ["하고 있는 상황입니다", "하고 있습니다"],
      ["하고 있는 상황이다", "하고 있다"],
      ["이 필요한 상황이다", "이 필요하다"],
      ["이 필요한 상황입니다", "이 필요합니다"],
      ["에 처해 있는 상황이다", "이다"],
      ["에 처해 있는 상황입니다", "입니다"],
      ["인 상황이다", "이다"],
      ["인 상황입니다", "입니다"],
      ["한 상황이다", "하다"],
      ["한 상황입니다", "합니다"],
      ["된 상황이다", "됐다"],
      ["된 상황입니다", "됐습니다"],
      // ~의 경우에는 → ~은/는 (특정 패턴만)
      ["의 경우에도", "도"],
      ["의 경우에는", "은"],
      ["의 경우 역시", "도"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("T-1", "군더더기 교정", "S2", from, to, `군더더기 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── U. 상태표현 간결화 + 진행형 능동화 ───────────────────────────────────────
// "낮아져 있는" → "낮아진" / "보여주고 있다" → "드러낸다"
// 출처: 전문 교열사 브런치 《잘못된 피동 표현》

const ruleU1: Rule = {
  id: "U-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // 상태 축약: 어져 있는 → 어진
      ["낮아져 있는", "낮아진"], ["높아져 있는", "높아진"],
      ["줄어들어 있는", "줄어든"], ["늘어나 있는", "늘어난"],
      ["변해 있는", "변한"], ["굳어져 있는", "굳어진"],
      ["쌓여 있는", "쌓인"], ["남아 있는", "남은"],
      ["열려 있는", "열린"], ["닫혀 있는", "닫힌"],
      // 보여주다 → 드러내다 (보여주고 있다는 Q-1에서 처리)
      ["을 보여주고 있다", "을 드러낸다"],
      ["를 보여주고 있다", "를 드러낸다"],
      ["을 보여주고 있습니다", "을 드러냅니다"],
      ["를 보여주고 있습니다", "를 드러냅니다"],
      ["을 보여준다", "을 드러낸다"],
      ["를 보여준다", "를 드러낸다"],
      ["을 보여주었다", "을 드러냈다"],
      ["를 보여주었다", "를 드러냈다"],
      // 나타나고 있다 → 나타난다
      ["이 나타나고 있다", "이 나타난다"],
      ["가 나타나고 있다", "가 나타난다"],
      ["이 나타나고 있습니다", "이 나타납니다"],
      ["가 나타나고 있습니다", "가 나타납니다"],
      // 증가/감소 → 자연스러운 표현
      ["이 증가하고 있다", "이 늘고 있다"],
      ["가 증가하고 있다", "가 늘고 있다"],
      ["이 감소하고 있다", "이 줄고 있다"],
      ["가 감소하고 있다", "가 줄고 있다"],
      ["이 증가하고 있습니다", "이 늘고 있습니다"],
      ["가 증가하고 있습니다", "가 늘고 있습니다"],
      // 이루어지고 있다 (이미 K-1에서 일부 처리, 추가 패턴)
      ["이 이루어지고 있다", "이 진행되고 있다"],
      ["가 이루어지고 있다", "가 진행되고 있다"],
      // 제기되고 있다 → 제기된다
      ["이 제기되고 있다", "이 제기된다"],
      ["가 제기되고 있다", "가 제기된다"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("U-1", "표현 간결화", "S2", from, to, `표현 간결화 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── V. 구어체 → 문어체 (전문 편집 기준) ─────────────────────────────────────

const ruleV1: Rule = {
  id: "V-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // 구어체 접속어 → 문어체
      ["아무튼 ", "어쨌든 "], ["하여튼 ", "어쨌든 "],
      ["그냥 ", "단순히 "], ["좀 더 ", "조금 더 "],
      ["엄청 ", "상당히 "], ["엄청난 ", "상당한 "],
      ["너무나도 ", "매우 "], ["너무너무 ", "매우 "],
      // 비격식 종결 → 격식
      ["인 거다", "이다"], ["인 거죠", "입니다"],
      ["한 거다", "하다"], ["된 거다", "된 것이다"],
      // 반복 접속사 개선
      ["그리고 그래서", "그래서"],
      ["그런데 하지만", "하지만"],
      // 관심 표현 고급화
      ["에 대한 관심이 높아지고 있다", "에 관심이 모인다"],
      ["에 대한 관심이 높아지고 있습니다", "에 관심이 모입니다"],
      ["에 대한 관심이 증가하고 있다", "에 관심이 쏠린다"],
      ["에 대한 관심이 증가하고 있습니다", "에 관심이 쏠립니다"],
      ["에 대한 관심이 커지고 있다", "에 관심이 커진다"],
      // 라고 불리는 → 이라는
      ["이라고 불리는", "이라는"],
      ["라고 불리는", "이라는"],
      ["이라고 불린다", "이다"],
      ["라고 불린다", "이다"],
      // ~을 위한 대책 마련
      ["을 위한 대책이 마련되어야 한다", "에 대비해야 한다"],
      ["를 위한 대책이 마련되어야 한다", "에 대비해야 한다"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("V-1", "구어체 교정", "S2", from, to, `문체 격상 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── W. 어휘 격상 (전문 교열사 기준) ──────────────────────────────────────────
// 구어적 동사 → 전문 문어 동사 치환 (맥락이 명확한 패턴만)

const ruleW1: Rule = {
  id: "W-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // 크게 늘다/줄다 → 급증/급감
      ["크게 늘었다", "급증했다"], ["크게 늘고 있다", "급증하고 있다"],
      ["크게 줄었다", "급감했다"], ["크게 줄고 있다", "급감하고 있다"],
      // 올리다 → (의욕·사기 맥락) 고취하다/높이다
      ["의욕을 올리다", "의욕을 고취하다"],
      ["의욕을 올린다", "의욕을 고취한다"],
      ["의욕을 올려야", "의욕을 높여야"],
      ["사기를 올리다", "사기를 높이다"],
      // 나쁘다 → 심각하다 (문제 맥락)
      ["문제가 나쁘다", "문제가 심각하다"],
      ["상황이 나쁘다", "상황이 심각하다"],
      // 좋아지고 있다 → 개선되고 있다
      ["이 좋아지고 있다", "이 개선되고 있다"],
      ["가 좋아지고 있다", "가 개선되고 있다"],
      // 말하다 (공식 문서) → 밝히다/언급하다
      ["는 이를 말하며", "는 이를 밝히며"],
      ["고 말했다", "고 밝혔다"],
      ["며 말했다", "며 밝혔다"],
      // 찾다 → 모색하다 (대안·방법 맥락)
      ["방법을 찾아야 한다", "방법을 모색해야 한다"],
      ["방안을 찾아야 한다", "방안을 모색해야 한다"],
      ["대안을 찾아야 한다", "대안을 모색해야 한다"],
      // 가져오다 → 초래하다 (부정적 결과)
      ["문제를 가져온다", "문제를 초래한다"],
      ["문제를 가져올 수 있다", "문제를 초래할 수 있다"],
      ["결과를 가져온다", "결과를 초래한다"],
      // 있게 하다 → 가능하게 하다 → 허용하다/가능케 하다
      ["있게 한다", "가능케 한다"],
      ["있게 해준다", "가능케 해준다"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("W-1", "어휘 격상", "S2", from, to, `어휘 격상 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── X. 동어반복 탐지 ──────────────────────────────────────────────────────────
// 전문 교열 원칙: 인접 문장에서 같은 어근 반복 사용 경고

const ruleX1: Rule = {
  id: "X-1",
  run(text) {
    const found: Detection[] = [];
    // 한 문장 안에서 같은 어근 2회 이상 탐지
    const sentences = text.split(/[.。!?]\s+/);
    const checkWords = [
      "중요", "강조", "필요", "의미", "역할", "문제", "발전",
      "향상", "개선", "증가", "감소", "변화", "노력", "가능",
    ];
    for (const sent of sentences) {
      for (const w of checkWords) {
        const re = new RegExp(w, "g");
        const count = (sent.match(re) || []).length;
        if (count >= 3) {
          found.push(det("X-1", "동어반복", "S3", `"${w}" (한 문장 ${count}회)`, "(다양한 어휘 권장)", `동어반복 "${w}" ${count}회`));
        }
      }
    }
    return { text, found };
  },
};

// ── Y. 냉정한 문체 (AI 과장 어조 제거) ──────────────────────────────────────

const ruleY1: Rule = {
  id: "Y-1",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // 과장 형용사
      ["놀라운 성과", "주목할 성과"],
      ["놀라운 결과", "눈에 띄는 결과"],
      ["놀라운 발전", "빠른 발전"],
      ["눈부신 성장", "빠른 성장"],
      ["눈부신 발전", "빠른 발전"],
      ["엄청난 변화", "큰 변화"],
      ["엄청난 영향", "상당한 영향"],
      // AI 흔한 강조
      ["완전히 새로운", "새로운"], ["완전히 달라진", "달라진"],
      ["완전히 바뀐", "바뀐"],
      ["더 나은 세상", "나은 환경"],
      ["더 나은 미래를 만들어", "나은 미래를 열어"],
      // 오글거리는 마무리
      ["더 밝은 미래를 위해", "앞으로"],
      ["밝은 미래를 향해", "앞을 내다보며"],
      ["한 발 더 나아가야", "더 나아가야"],
      ["새로운 패러다임", "새로운 방식"],
      ["패러다임의 전환", "방식의 전환"],
    ];
    for (const [from, to] of pairs) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("Y-1", "과장 어조 교정", "S2", from, to, `과장 어조 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── E-5. 연속 종결어미 자동 연결변환 ─────────────────────────────────────────
// 전문 편집 원칙: 같은 어미 연속 3회 이상은 산문의 단조로움을 유발
// 짧은 문장 쌍에서 앞 문장 어미 → 연결어미로 치환 (최대 3회)

const ruleE5: Rule = {
  id: "E-5",
  run(text) {
    const found: Detection[] = [];
    let t = text;

    const transforms: [string, string][] = [
      ["한다", "하며"],
      ["된다", "되며"],
      ["이다", "이며"],
      ["있다", "있으며"],
      ["없다", "없으며"],
    ];

    for (const [ending, connector] of transforms) {
      // 짧은 문장(4~28자) + 같은 종결어미 연속 → 연결어미 변환
      const re = new RegExp(
        `([^.!?\\n]{4,28})${ending}\\.\\s+([^.!?\\n]{4,38}${ending}\\.)`,
        "g"
      );
      let count = 0;
      const newT = t.replace(re, (m, pre1, rest) => {
        count++;
        if (count > 3) return m;
        found.push(det(
          "E-5", "종결어미 변화", "S2",
          `...${ending}. ...${ending}.`,
          `...${connector} ...${ending}.`,
          `연속 "~${ending}." → "~${connector} ...${ending}." 연결`
        ));
        return pre1 + connector + " " + rest;
      });
      if (count > 0) t = newT;
    }

    return { text: t, found };
  },
};

// ── I-5. 형식명사 바/데/수 확장 ──────────────────────────────────────────────

const ruleI5: Rule = {
  id: "I-5",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // 바 형식명사 (하는 바이다/바입니다만 안전 — 어간 하+는 확인됨)
      ["하는 바이다",     "한다"],
      ["하는 바입니다",   "합니다"],
      ["한 바 있다",      "했다"],
      ["한 바 있습니다",  "했습니다"],
      // "는 바와 같이" → "처럼" 패턴 제거: "설명하는 바와 같이" → "설명하처럼" 오문
      // 데 형식명사 (특정 패턴)
      ["하는 데 있어서",  "할 때"],
      ["하는 데 있어",    "할 때"],
      ["되는 데 있어서",  "될 때"],
      // 수 형식명사 불필요 조사
      ["할 수가 없다",    "할 수 없다"],
      ["할 수가 없습니다","할 수 없습니다"],
      ["할 수가 있다",    "할 수 있다"],
      ["할 수가 있습니다","할 수 있습니다"],
      // 수밖에 없다 → 해야 한다
      ["하는 수밖에 없다",    "해야 한다"],
      ["하는 수밖에 없습니다","해야 합니다"],
      // 필요가 없다 (역방향)
      ["할 필요도 없다",  "할 필요 없다"],
    ];
    const active = pairs.filter(([f, t2]) => f !== t2);
    for (const [from, to] of active) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("I-5", "형식명사 과다", "S2", from, to, `형식명사 "${from}" → "${to}"`));
      }
    }
    return { text: t, found };
  },
};

// ── I-6. 것이다 문말 자동해체 ─────────────────────────────────────────────────
// I-1(탐지)의 자동치환 버전 — 문장 끝 "~것이다" → 직접어미
// 출처: 국립국어원 «쉬운 우리말 쓰기» 명사화 과다 교정 원칙

const ruleI6: Rule = {
  id: "I-6",
  run(text) {
    const found: Detection[] = [];
    let t = text;

    // ~하는 것이다 → ~한다  (문말)
    t = t.replace(/([가-힣]{2,12})하는 것이다([.。\s\n]|$)/g, (_, pre, p) => {
      found.push(det("I-6", "형식명사 해체", "S2", pre+"하는 것이다", pre+"한다", `"~하는 것이다" → "~한다"`));
      return pre + "한다" + p;
    });
    // ~하는 것입니다 → ~합니다
    t = t.replace(/([가-힣]{2,12})하는 것입니다([.。\s\n]|$)/g, (_, pre, p) => {
      found.push(det("I-6", "형식명사 해체", "S2", pre+"하는 것입니다", pre+"합니다", `"~하는 것입니다" → "~합니다"`));
      return pre + "합니다" + p;
    });
    // ~인 것이다 → ~이다
    t = t.replace(/([가-힣]{1,12})인 것이다([.。\s\n]|$)/g, (_, pre, p) => {
      found.push(det("I-6", "형식명사 해체", "S2", pre+"인 것이다", pre+"이다", `"~인 것이다" → "~이다"`));
      return pre + "이다" + p;
    });
    // ~된 것이다 → ~됐다
    t = t.replace(/([가-힣]{2,12})된 것이다([.。\s\n]|$)/g, (_, pre, p) => {
      found.push(det("I-6", "형식명사 해체", "S2", pre+"된 것이다", pre+"됐다", `"~된 것이다" → "~됐다"`));
      return pre + "됐다" + p;
    });
    // ~있는 것이다 → ~있다
    t = t.replace(/([가-힣]{2,12})있는 것이다([.。\s\n]|$)/g, (_, pre, p) => {
      found.push(det("I-6", "형식명사 해체", "S2", pre+"있는 것이다", pre+"있다", `"~있는 것이다" → "~있다"`));
      return pre + "있다" + p;
    });

    return { text: t, found };
  },
};

// ── P-3. 상투어·관용구 교체/삭제 ─────────────────────────────────────────────
// 전문 편집: 진부한 관용구 → 직접적·함축적 표현으로 교체
// 출처: 출판 편집 교열 기준 + 국립국어원 쉬운 우리말 쓰기

const ruleP3: Rule = {
  id: "P-3",
  run(text) {
    const found: Detection[] = [];
    let t = text;
    const pairs: [string, string][] = [
      // 기 마련이다 — "변하기 마련이다" → "변하다"
      ["기 마련이다",     "다"],
      ["기 마련입니다",   ""],   // 형태소 문제로 탐지만
      // 임에 틀림없다 → 이다
      ["임에 틀림없다",     "이다"],
      ["임에 틀림없습니다", "입니다"],
      // 에 다름 아니다 → 이다
      ["에 다름 아니다",    "이다"],
      ["에 다름이 아니다",  "이다"],
      // 라 해도 과언이 아니다 → 이다
      ["라 해도 과언이 아니다",    "이다"],
      ["라고 해도 과언이 아니다",  "이다"],
      ["라 해도 과언이 아닙니다",  "입니다"],
      // 말할 것도 없이 → 당연히
      ["말할 것도 없이",       "당연히"],
      ["말할 나위도 없이",     "당연히"],
      ["두말할 나위 없이",     "분명히"],
      // 물론이고 → 물론
      ["은 물론이고",  "은 물론"],
      ["는 물론이고",  "는 물론"],
      ["이 물론이고",  "이 물론"],
      // 불문하고 → 관계없이
      ["을 불문하고",  "에 관계없이"],
      ["를 불문하고",  "에 관계없이"],
      // 그야말로 제거 (문두)
      ["그야말로 ",    ""],
      // 이미 알려진 것처럼 군더더기
      ["이미 잘 알려져 있다시피", "알려지다시피"],
      ["잘 알려진 바와 같이",    "알려지다시피"],
      // 물론 중복
      ["물론이거니와", "물론"],
      // 어찌 됐든 간에
      ["어찌 됐든 간에", "어쨌든"],
      ["어찌 되었든 간에", "어쨌든"],
      ["어찌 됐든",      "어쨌든"],
      // 전혀 다름 아닌
      ["전혀 다름 아닌", "바로"],
      // 다시 한번 강조하건대
      ["다시 한번 강조하건대", "다시 말하면"],
      ["다시 한 번 강조하건대", "다시 말하면"],
    ];
    const active = pairs.filter(([f, t2]) => f !== t2);
    for (const [from, to] of active) {
      if (t.includes(from)) {
        t = replaceAll(t, from, to);
        found.push(det("P-3", "상투어 교체", "S2", from, to || "(삭제)", `상투어 "${from}" → "${to || "(삭제)"}"`));
      }
    }

    // 기 마련입니다 — 탐지만 (형태소 자동변환 불가)
    const countMR = countStr(t, "기 마련입니다");
    if (countMR >= 1) {
      found.push(det("P-3", "상투어 교체", "S3",
        `"기 마련입니다" (${countMR}회)`,
        "(직접 서술 권장)",
        `상투어 "기 마련입니다" — 직접 서술로 수정 권장`
      ));
    }

    return { text: t, found };
  },
};

// ─────────────────────────────────────────────────────────────────────────────

const RULES: Rule[] = [
  // S1 자동 치환 — 반드시 먼저
  ruleC11,   // 연결어미 뒤 쉼표
  ruleA4,    // 이중피동 되어지다
  ruleL1,    // 이중피동 보여지다/느껴지다 등
  ruleD1,    // AI 결산 표현
  ruleD2,    // AI 관용구
  ruleD4,    // hype 어휘
  // S2 자동 치환
  ruleK1,    // 풀어쓰기 → 함축 (하게되다, 이루어지다, 위해서)
  ruleS1,    // 탈명사화 (필요성이 있다, 것이 가능하다)
  ruleT1,    // ~상황이다 군더더기
  ruleU1,    // 상태표현 간결화 (낮아져 있는→낮아진, 보여주다→드러내다)
  ruleV1,    // 구어체→문어체, 관심 고급화, 라고 불리는
  ruleW1,    // 어휘 격상 (고취, 모색, 초래, 급증)
  ruleY1,    // AI 과장 어조 교정
  ruleA3,    // 에 있어서
  ruleA5,    // 가지고 있다
  ruleA1,    // 를 통해서
  ruleN1,    // 로 인해, 에 따라서, 다고 하는
  ruleN2,    // 이중부정, 진정한 의미의
  ruleM1,    // 명사+동사 → 단일동사
  ruleI4,    // 할 필요가 있다
  ruleI3,    // 형식명사 라는 뜻이다
  ruleI5,    // 형식명사 바/데/수 확장
  ruleI6,    // 것이다 문말 자동해체
  ruleP3,    // 상투어 교체/삭제
  ruleG1,    // Hedging
  ruleD3,    // 라고 할 수 있다
  ruleR1,    // 문장 종결 개선
  ruleE5,    // 연속 종결어미 연결변환
  ruleE3,    // 동일 종결어미 5회↑ 자동변환 (S2로 승격)
  ruleJ1,    // 볼드 과다
  // S2 탐지 전용
  ruleA2,    // 에 대해/에 대한 탐지
  ruleA6,    // 할 수 있다 남발
  ruleC1,    // 첫째/둘째/셋째
  ruleC10,   // 콜론 헤딩
  ruleD7,    // X에서 Y로
  ruleG3,    // 안전 균형
  ruleH1,    // 접속사 남발
  ruleP2,    // 군더더기 이중접속
  // S3 탐지/치환
  ruleQ1,    // 진행형 과다 (4회↑ 자동치환)
  ruleE2,    // 고 있다 리듬
  ruleF1,    // 부사 과다
  ruleF2,    // 동의어 이중수식
  ruleF4,    // 한자어 명사화
  ruleK2,    // 단어 단순화
  ruleP1,    // 문두 상투어
  ruleX1,    // 동어반복 탐지
  ruleJ2,    // 따옴표 과다
  ruleI1,    // 것이다 반복
];

function computeGrade(s1: number, s2: number, changeRate: number): "A" | "B" | "C" | "D" {
  if (s1 >= 5 || changeRate > 0.5) return "D";
  if (s1 >= 2 || s2 >= 6) return "C";
  if (s1 >= 1 || s2 >= 3) return "B";
  return "A";
}

function buildSummary(detections: Detection[], changeRate: number): string {
  if (detections.length === 0) {
    return "AI 티 패턴이 탐지되지 않았습니다. 이미 자연스러운 표현에 가깝습니다.";
  }
  const cats: Record<string, number> = {};
  detections.forEach(d => { cats[d.category] = (cats[d.category] || 0) + 1; });
  const top = Object.entries(cats)
    .sort(([, a], [, b]) => b - a).slice(0, 3)
    .map(([c, n]) => `${c}(${n}건)`).join(", ");
  const s1 = detections.filter(d => d.severity === "S1").length;
  const auto = detections.filter(d => !d.suggested.includes("권장") && d.suggested !== "(삭제)").length
    + detections.filter(d => d.suggested === "(삭제)").length;
  let s = `총 ${detections.length}개 패턴 탐지. 주요: ${top}.`;
  if (s1 > 0) s += ` S1 결정적 패턴 ${s1}건 자동 제거.`;
  if (auto > 0) s += ` 변경률 ${(changeRate * 100).toFixed(0)}%.`;
  return s;
}

export function humanize(text: string): HumanizeResult {
  if (!text.trim()) {
    return {
      humanized: text,
      detections: [],
      stats: { char_before: 0, char_after: 0, change_rate: 0, s1_count: 0, s2_count: 0, s3_count: 0, grade: "A" },
      summary: "입력 텍스트가 없습니다.",
    };
  }

  const charBefore = text.length;
  let current = text;
  const allDetections: Detection[] = [];

  for (const rule of RULES) {
    const { text: newText, found } = rule.run(current);
    allDetections.push(...found);
    current = newText;
  }

  const charAfter = current.length;
  const changeRate = charBefore > 0 ? Math.abs(charBefore - charAfter) / charBefore : 0;
  const s1 = allDetections.filter(d => d.severity === "S1").length;
  const s2 = allDetections.filter(d => d.severity === "S2").length;
  const s3 = allDetections.filter(d => d.severity === "S3").length;

  return {
    humanized: current,
    detections: allDetections,
    stats: {
      char_before: charBefore,
      char_after: charAfter,
      change_rate: parseFloat(changeRate.toFixed(3)),
      s1_count: s1,
      s2_count: s2,
      s3_count: s3,
      grade: computeGrade(s1, s2, changeRate),
    },
    summary: buildSummary(allDetections, changeRate),
  };
}
