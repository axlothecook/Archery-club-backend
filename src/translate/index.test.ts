import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translateBatch, translateText } from "./index.ts";

// Unit tests for the translation abstraction. Mock mode (no key) must never hit
// the network and returns "[locale] text"; live mode (key set) is exercised with
// a stubbed fetch so we don't need a real Google key.

const ORIGINAL_KEY = process.env["GOOGLE_TRANSLATE_KEY"];
afterEach(() => {
	vi.restoreAllMocks();
	if (ORIGINAL_KEY === undefined) delete process.env["GOOGLE_TRANSLATE_KEY"];
	else process.env["GOOGLE_TRANSLATE_KEY"] = ORIGINAL_KEY;
});

describe("translate — mock mode (no key)", () => {
	beforeEach(() => { delete process.env["GOOGLE_TRANSLATE_KEY"]; });

	it("returns '[locale] text' and never calls fetch", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		vi.spyOn(console, "log").mockImplementation(() => {});
		const out = await translateBatch(["Bok", "Hvala"], "en");
		expect(out).toEqual(["[en] Bok", "[en] Hvala"]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("preserves empty strings and same-locale no-ops", async () => {
		expect(await translateBatch(["", "x"], "de")).toEqual(["", "[de] x"]);
		expect(await translateBatch(["x"], "hr")).toEqual(["x"]); // source==target
		expect(await translateBatch([], "en")).toEqual([]);
	});

	it("translateText wraps the batch helper", async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		expect(await translateText("Mir", "fr")).toBe("[fr] Mir");
	});
});

describe("translate — live mode (key set)", () => {
	beforeEach(() => { process.env["GOOGLE_TRANSLATE_KEY"] = "test-key"; });

	it("POSTs q-array to Google and maps translatedText in order", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({ data: { translations: [{ translatedText: "Hello" }, { translatedText: "Thanks" }] } }),
				{ status: 200 },
			),
		);
		const out = await translateBatch(["Bok", "Hvala"], "en");
		expect(out).toEqual(["Hello", "Thanks"]);
		expect(fetchSpy).toHaveBeenCalledOnce();
		const url = fetchSpy.mock.calls[0]?.[0] as string;
		expect(url).toContain("key=test-key");
	});

	it("does not send empty strings but keeps their slots", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: { translations: [{ translatedText: "Hello" }] } }), { status: 200 }),
		);
		const out = await translateBatch(["", "Bok"], "en");
		expect(out).toEqual(["", "Hello"]);
		// only the non-empty string was sent
		const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
		expect(body.q).toEqual(["Bok"]);
	});

	it("fails fast on a non-transient error (400) without retrying", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 400 }));
		await expect(translateBatch(["x"], "en")).rejects.toThrow(/400/);
		expect(fetchSpy).toHaveBeenCalledOnce(); // no retry on 400
	});

	it("retries a transient 403 (propagation blip) then succeeds", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const fetchSpy = vi.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response("referer blocked", { status: 403 }))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { translations: [{ translatedText: "Hello" }] } }), { status: 200 }),
			);
		const out = await translateBatch(["Bok"], "en");
		expect(out).toEqual(["Hello"]);
		expect(fetchSpy).toHaveBeenCalledTimes(2); // 1 fail + 1 success
	});
});
