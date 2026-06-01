import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./index.ts";

// Unit tests for the Brevo abstraction. We stub globalThis.fetch so the "real
// send" branch (Mode B) is exercised WITHOUT a live Brevo account, and verify the
// console-fallback branch (Mode A) never calls the network.

const ORIGINAL_KEY = process.env["BREVO_API_KEY"];
const ORIGINAL_FROM = process.env["EMAIL_FROM"];

afterEach(() => {
	vi.restoreAllMocks();
	// restore env to whatever it was
	if (ORIGINAL_KEY === undefined) delete process.env["BREVO_API_KEY"];
	else process.env["BREVO_API_KEY"] = ORIGINAL_KEY;
	if (ORIGINAL_FROM === undefined) delete process.env["EMAIL_FROM"];
	else process.env["EMAIL_FROM"] = ORIGINAL_FROM;
});

describe("sendEmail — Mode A (no key configured)", () => {
	beforeEach(() => {
		delete process.env["BREVO_API_KEY"];
		delete process.env["EMAIL_FROM"];
	});

	it("logs to the console and does NOT call fetch (and never throws)", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		await expect(
			sendEmail({ to: "x@y.hr", subject: "Hi", text: "link: https://a/b" }),
		).resolves.toBeUndefined();

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledOnce();
		expect(logSpy.mock.calls[0]?.[0]).toContain("[email:console]");
	});
});

describe("sendEmail — Mode B (key configured)", () => {
	beforeEach(() => {
		process.env["BREVO_API_KEY"] = "test-key-123";
		process.env["EMAIL_FROM"] = "club@vsk.hr";
	});

	it("POSTs to the Brevo endpoint with the right headers + body", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(null, { status: 201 }));

		await sendEmail({ to: "admin@vsk.hr", subject: "Invitation", text: "set pw: https://d/x" });

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.brevo.com/v3/smtp/email");
		expect(init.method).toBe("POST");
		expect((init.headers as Record<string, string>)["api-key"]).toBe("test-key-123");
		const body = JSON.parse(init.body as string);
		expect(body.sender).toEqual({ email: "club@vsk.hr" });
		expect(body.to).toEqual([{ email: "admin@vsk.hr" }]);
		expect(body.subject).toBe("Invitation");
		expect(body.textContent).toBe("set pw: https://d/x");
	});

	it("throws when Brevo returns a non-2xx response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("bad sender", { status: 400 }),
		);

		await expect(
			sendEmail({ to: "admin@vsk.hr", subject: "x", text: "y" }),
		).rejects.toThrow(/Brevo send failed \(400\)/);
	});
});
