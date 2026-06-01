// Single shared PrismaClient for the whole backend (endpoints, jobs, tests).
// Prisma 7 requires a driver adapter for Postgres — PrismaPg (backed by `pg`)
// opens the actual DB connections. dotenv loads DATABASE_URL from .env at runtime
// (prisma.config.ts does the same for CLI commands).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });

export const prisma = new PrismaClient({ adapter });
