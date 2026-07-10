# 여러 토큰 괄호 가사 한글 분할 수정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여러 Musixmatch 토큰에 걸친 괄호 가사가 한글 글자 분할 때문에 메인/코러스로 잘못 나뉘는 회귀를 수정한다.

**Architecture:** `splitHangulSyllables`의 각 `SyllableVocal` 순회에 렌더러와 동일한 ASCII 괄호 불리언 상태를 추가한다. 괄호 범위 토큰은 원본 그대로 유지하고, 괄호 밖 토큰만 기존 `splitSyllable` 경로로 보내 렌더러·타입·캐시 계약은 변경하지 않는다.

**Tech Stack:** TypeScript, Vitest, Biome, Vite

---

## 파일 구조

- 수정: `src/lyrics/splitHangulSyllables.ts` — 보컬별 괄호 상태를 추적하면서 분할 대상을 결정한다.
- 수정: `tests/lyrics/splitHangulSyllables.test.ts` — 여러 토큰 괄호와 괄호 전후 일반 한글 분할을 단위 검증한다.
- 수정: `tests/renderer/syllableRows.test.ts` — 실제 문제 입력을 분할 후 렌더링 모델까지 통과시켜 메인/코러스 결과를 검증한다.

### Task 1: 실패하는 한글 분할 회귀 테스트

**Files:**
- Modify: `tests/lyrics/splitHangulSyllables.test.ts`
- Test: `tests/lyrics/splitHangulSyllables.test.ts`

- [ ] **Step 1: 여러 토큰 괄호 범위와 괄호 뒤 분할 재개 테스트 작성**

`splitHangulSyllables` 테스트에 다음 사례를 추가한다. 괄호 앞 `사랑해`와 괄호 뒤 `오늘도`는 기존대로 글자 단위로 나뉘고, `"(이"`, `"밤을"`, `"새워)"`는 모두 원본 토큰과 타이밍을 보존해야 한다.

```ts
test("preserves Hangul tokens inside a parenthetical spanning provider tokens", () => {
	const syllables: Syllable[] = [
		{ text: "사랑해", startTime: 0, endTime: 0.9, isPartOfWord: false },
		{ text: "(이", startTime: 0.9, endTime: 1.2, isPartOfWord: false },
		{ text: "밤을", startTime: 1.2, endTime: 1.8, isPartOfWord: false },
		{ text: "새워)", startTime: 1.8, endTime: 2.4, isPartOfWord: false },
		{ text: "오늘도", startTime: 2.4, endTime: 3.3, isPartOfWord: false },
	];

	const result = leadSyllables(splitHangulSyllables(lyricsWithSyllables(syllables)));

	expect(result.map((item) => item.text)).toEqual(["사", "랑", "해", "(이", "밤을", "새워)", "오", "늘", "도"]);
	expect(result.slice(3, 6)).toEqual(syllables.slice(1, 4));
});
```

- [ ] **Step 2: 테스트를 실행해 현재 코드에서 의도대로 실패하는지 확인**

Run: `npx vitest run tests/lyrics/splitHangulSyllables.test.ts`

Expected: 새 테스트가 `"밤을"` 대신 `"밤"`, `"을"`을 받아 FAIL하며, 기존 테스트는 PASS한다.

### Task 2: 실패하는 렌더링 통합 회귀 테스트

**Files:**
- Modify: `tests/renderer/syllableRows.test.ts`
- Test: `tests/renderer/syllableRows.test.ts`

- [ ] **Step 1: 실제 문제 음절 배열을 분할과 렌더링 모델에 연속 적용하는 테스트 작성**

`splitHangulSyllables`, `SyllableLyrics`, `SyllableVisualGroup`을 다음과 같이 가져오고,
실제 168.06–170.984초 구간을 포함한 문서를 만든다. 분할된 리드 보컬을
`buildSyllableRows`에 전달한 뒤 시각적 단어 배열을 비교한다.

```ts
import { splitHangulSyllables } from "../../src/lyrics/splitHangulSyllables";
import type { SyllableLyrics } from "../../src/lyrics/types";
import { buildSyllableRows, type SyllableVisualGroup } from "../../src/renderer/lyrics/syllableRows";
```

```ts
test("keeps a multi-token Korean parenthetical in the echo after Hangul splitting", () => {
	const lyrics: SyllableLyrics = {
		type: "syllable",
		startTime: 168.06,
		endTime: 170.984,
		content: [
			{
				type: "vocal",
				oppositeAligned: false,
				lead: {
					startTime: 168.06,
					endTime: 170.984,
					syllables: [
						{ text: "너와", startTime: 168.06, endTime: 168.214, isPartOfWord: false },
						{ text: "나", startTime: 168.214, endTime: 168.385, isPartOfWord: false },
						{ text: "둘이", startTime: 168.385, endTime: 168.594, isPartOfWord: false },
						{ text: "이", startTime: 168.594, endTime: 168.942, isPartOfWord: false },
						{ text: "밤을", startTime: 168.942, endTime: 169.407, isPartOfWord: false },
						{ text: "새워", startTime: 169.407, endTime: 170.057, isPartOfWord: false },
						{ text: "(이", startTime: 170.057, endTime: 170.522, isPartOfWord: false },
						{ text: "밤을", startTime: 170.522, endTime: 170.869, isPartOfWord: false },
						{ text: "새워)", startTime: 170.869, endTime: 170.984, isPartOfWord: false },
					],
				},
			},
		],
	};
	const split = splitHangulSyllables(lyrics);
	const item = split.content[0];
	if (item.type !== "vocal") {
		throw new Error("expected vocal");
	}
	const model = buildSyllableRows(item.lead);
	const words = (group: SyllableVisualGroup): string[] =>
		group.words.map((word) => word.tokens.map((token) => token.text).join(""));

	expect(model.rows).toHaveLength(1);
	expect(words(model.rows[0].main)).toEqual(["너와", "나", "둘이", "이", "밤을", "새워"]);
	expect(words(model.rows[0].echo)).toEqual(["이", "밤을", "새워"]);
	expect(words(model.rows[0].main).join("")).not.toContain(")");
});
```

- [ ] **Step 2: 두 회귀 테스트를 함께 실행해 증상을 정확히 재현하는지 확인**

Run: `npx vitest run tests/lyrics/splitHangulSyllables.test.ts tests/renderer/syllableRows.test.ts`

Expected: 새 단위 테스트와 렌더링 테스트가 모두 FAIL한다. 렌더링 테스트의 실제 메인 단어에는 `"을"`, `"새워)"`가 추가되고 에코는 `["이", "밤"]`만 남는다.

### Task 3: 보컬별 괄호 상태를 보존하는 최소 구현

**Files:**
- Modify: `src/lyrics/splitHangulSyllables.ts`
- Test: `tests/lyrics/splitHangulSyllables.test.ts`
- Test: `tests/renderer/syllableRows.test.ts`

- [ ] **Step 1: `splitVocal`을 상태 기반 순회로 변경**

기존 `flatMap(splitSyllable)`을 다음 형태로 바꾼다. 괄호 전이는 `parseWordLevelParentheticals`와 동일하게 괄호 밖의 `(`와 괄호 안의 `)`만 상태를 변경한다.

```ts
const splitVocal = (vocal: SyllableVocal): SyllableVocal => {
	let isInsideParenthetical = false;
	const syllables = vocal.syllables.flatMap((syllable) => {
		const text = syllable.romanizedText ?? syllable.text;
		const isParentheticalToken = isInsideParenthetical || text.includes("(") || text.includes(")");
		isInsideParenthetical = parentheticalStateAfter(text, isInsideParenthetical);
		return isParentheticalToken ? [syllable] : splitSyllable(syllable);
	});
	return { ...vocal, syllables };
};

const parentheticalStateAfter = (text: string, initialState: boolean): boolean => {
	let isInsideParenthetical = initialState;
	for (const char of text) {
		if (char === "(" && !isInsideParenthetical) {
			isInsideParenthetical = true;
		} else if (char === ")" && isInsideParenthetical) {
			isInsideParenthetical = false;
		}
	}
	return isInsideParenthetical;
};
```

- [ ] **Step 2: 회귀 테스트를 실행해 GREEN 확인**

Run: `npx vitest run tests/lyrics/splitHangulSyllables.test.ts tests/renderer/syllableRows.test.ts`

Expected: 두 파일의 모든 테스트가 PASS한다.

- [ ] **Step 3: 관련 서비스·렌더러 테스트로 충돌 여부 확인**

Run: `npx vitest run tests/lyrics/LyricsService.test.ts tests/renderer/LyricsRenderer.test.ts`

Expected: 캐시/네트워크 한글 분할, 번역 표시, parenthetical continuation, pseudo-karaoke 렌더링 관련 테스트가 모두 PASS한다.

- [ ] **Step 4: 구현 변경 커밋**

```bash
git add src/lyrics/splitHangulSyllables.ts tests/lyrics/splitHangulSyllables.test.ts tests/renderer/syllableRows.test.ts
git commit -m "fix: preserve multi-token parenthetical lyrics"
```

### Task 4: 전체 품질 게이트와 최종 증상 검증

**Files:**
- Verify: `src/lyrics/splitHangulSyllables.ts`
- Verify: `tests/lyrics/splitHangulSyllables.test.ts`
- Verify: `tests/renderer/syllableRows.test.ts`

- [ ] **Step 1: 포맷 및 정적 검사**

Run: `npm run typecheck`

Expected: exit code 0, TypeScript 오류 없음.

Run: `npm run lint`

Expected: exit code 0, Biome 오류 없음.

- [ ] **Step 2: 전체 단위 테스트**

Run: `npm run test`

Expected: exit code 0, 실패 테스트 없음.

- [ ] **Step 3: 배포 번들 빌드**

Run: `npm run build`

Expected: exit code 0, `dist/aura-lyrics.js` 생성 완료.

- [ ] **Step 4: 실제 문제 데이터의 최종 모델 출력 확인**

회귀 테스트가 검증하는 모델을 기준으로 다음 불변식을 다시 확인한다.

```text
main words: ["너와", "나", "둘이", "이", "밤을", "새워"]
echo words: ["이", "밤을", "새워"]
```

- [ ] **Step 5: 작업 트리와 diff 점검**

Run: `git status --short`

Expected: 사용자 소유 `AGENTS.md` 외에 의도하지 않은 파일이 없음.

Run: `git diff --check HEAD^..HEAD`

Expected: 공백 오류 없음.
