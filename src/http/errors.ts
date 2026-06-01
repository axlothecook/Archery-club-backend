import type { NextFunction, Request, Response } from "express";

// An error carrying an HTTP status code. Routes throw this (or call next(err));
// the global error middleware turns it into a JSON response.
export class HttpError extends Error {
	statusCode: number;
	fields?: { field: string; msg: string }[];

	constructor(statusCode: number, message: string, fields?: { field: string; msg: string }[]) {
		super(message);
		this.statusCode = statusCode;
		this.fields = fields;
	}
}

// Global error-handling middleware — registered AFTER all routes (Express
// recognizes 4-arg middleware as an error handler). Server errors (>=500) log
// and return a generic message (don't leak internals); 4xx return the message
// and any field-level validation errors. Response shape: { error: { message, fields? } }.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
	const status = err instanceof HttpError ? err.statusCode : 500;

	if (status >= 500) {
		console.error(err);
		res.status(status).json({ error: { message: "Internal server error" } });
		return;
	}

	const message = err instanceof Error ? err.message : "Request failed";
	const fields = err instanceof HttpError ? err.fields : undefined;
	res.status(status).json({ error: { message, ...(fields ? { fields } : {}) } });
}
