import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { HttpError } from "./errors.ts";

// Reusable validation middleware. Pass Zod schemas for any of body/params/query;
// each is parsed and REPLACED with the typed, parsed value. On failure → 400
// with field-level errors mapped to our { error: { message, fields } } shape,
// so the front-end can render them in the form-error banner (fail()).
type Schemas = {
	body?: ZodType;
	params?: ZodType;
	query?: ZodType;
};

export function validate(schemas: Schemas) {
	return (req: Request, _res: Response, next: NextFunction): void => {
		const fields: { field: string; msg: string }[] = [];

		for (const key of ["body", "params", "query"] as const) {
			const schema = schemas[key];
			if (!schema) continue;
			const result = schema.safeParse(req[key]);
			if (result.success) {
				// Replace with the parsed/coerced value (e.g. coerced numbers).
				req[key] = result.data as never;
			} else {
				for (const issue of result.error.issues) {
					const path = issue.path.join(".");
					fields.push({ field: path ? `${key}.${path}` : key, msg: issue.message });
				}
			}
		}

		if (fields.length > 0) {
			next(new HttpError(400, "Validation failed", fields));
			return;
		}
		next();
	};
}
