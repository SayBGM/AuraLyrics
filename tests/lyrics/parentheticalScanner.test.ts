import { describe, expect, test } from "vitest";
import { scanParentheticalText } from "../../src/lyrics/parentheticalScanner";

describe("scanParentheticalText", () => {
	test("emits only outer boundaries while retaining nested text", () => {
		const result = scanParentheticalText("본문 ((메아리)) 다음");

		expect(result.events.map((event) => (event.kind === "text" ? `${event.role}:${event.text.trim()}` : event.kind))).toEqual([
			"main:본문",
			"open",
			"parenthetical:메아리",
			"close",
			"main:다음",
		]);
		expect(result.depthAfter).toBe(0);
	});

	test("carries nested depth across provider token boundaries", () => {
		const opening = scanParentheticalText("((", 0);
		const innerClose = scanParentheticalText("안쪽)", opening.depthAfter);
		const continuation = scanParentheticalText("내용", innerClose.depthAfter);
		const outerClose = scanParentheticalText(")", continuation.depthAfter);

		expect([opening.depthAfter, innerClose.depthAfter, continuation.depthAfter, outerClose.depthAfter]).toEqual([2, 1, 1, 0]);
		expect(continuation.events).toEqual([{ kind: "text", text: "내용", role: "parenthetical", startUnit: 0, endUnit: 2 }]);
	});

	test("keeps an unmatched closing delimiter as main text", () => {
		const result = scanParentheticalText("가사) 다음", 0);

		expect(result.events).toEqual([{ kind: "text", text: "가사) 다음", role: "main", startUnit: 0, endUnit: 6 }]);
		expect(result.containsDelimiter).toBe(true);
		expect(result.depthAfter).toBe(0);
	});
});
