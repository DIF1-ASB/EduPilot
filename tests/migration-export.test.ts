import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { GET } from "../app/api/ops/migration-export/route";
import { withRuntime } from "../lib/runtime";

const secret = "a".repeat(64);
const active = () => ({ MIGRATION_EXPORT_TOKEN: secret, MIGRATION_EXPORT_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString() });
const request = (authorization = `Bearer ${secret}`) => new Request("https://example.test/api/ops/migration-export", { headers: { authorization } });
const open: Database.Database[] = [];
afterEach(() => { for (const db of open.splice(0)) db.close(); });

function fixture() {
  const db = new Database(":memory:"); open.push(db);
  for (const name of readdirSync("prisma/migrations").filter(x => !x.endsWith(".toml")).sort())
    db.exec(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));
  db.prepare('INSERT INTO "User" (id,firstName,lastName,email,passwordHash,updatedAt) VALUES (?,?,?,?,?,?)').run("owner", "Test", "Owner", "owner@example.test", "synthetic-hash", Date.now());
  db.prepare('INSERT INTO "Chat" (id,userId,title,updatedAt) VALUES (?,?,?,?)').run("chat", "owner", "Synthetic chat", Date.now());
  const content = "Длинный текст — ".repeat(1000);
  db.prepare('INSERT INTO "Message" (id,chatId,role,content) VALUES (?,?,?,?)').run("message", "chat", "assistant", content);
  const runtimeDb = {
    prepare: (sql: string) => ({ sql }),
    batch: async (statements: {sql: string}[]) => db.transaction(() => statements.map(({sql}) => ({ success: true, results: db.prepare(sql).all() })))(),
  } as unknown as D1Database;
  return { db, content, runtimeDb };
}

describe("temporary migration export", () => {
  it.each([{}, { ...active(), MIGRATION_EXPORT_EXPIRES_AT: "invalid" }, { ...active(), MIGRATION_EXPORT_EXPIRES_AT: "2000-01-01T00:00:00Z" }])("does not expose data without a valid activation window", async env => {
    expect((await withRuntime(env, () => GET(request()))).status).toBe(404);
  });
  it("rejects a missing or incorrect export token", async () => {
    for (const value of ["", "Bearer wrong"])
      expect((await withRuntime(active(), () => GET(request(value)))).status).toBe(404);
  });
  it("exports long text intact and excludes old login sessions", async () => {
    const { db, content, runtimeDb } = fixture();
    db.prepare('INSERT INTO "Session" (id,userId,expiresAt) VALUES (?,?,?)').run("old-session", "owner", Date.now() + 60000);
    const response = await withRuntime({ ...active(), DB: runtimeDb }, () => GET(request()));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { format: string; tables: { Message: { content: string }[]; User: { passwordHash: string }[]; Session?: unknown; RateLimit?: unknown }; files: unknown[] };
    expect(body.format).toBe("edupilot-migration-v1");
    expect(body.tables.Message[0].content).toBe(content);
    expect(body.tables.User[0].passwordHash).toBe("synthetic-hash");
    expect(body.tables.Session).toBeUndefined();
    expect(body.tables.RateLimit).toBeUndefined();
    expect(body.files).toEqual([]);
  });
  it("refuses an incomplete export if a referenced file is missing", async () => {
    const { db, runtimeDb } = fixture();
    db.prepare('INSERT INTO "FileAttachment" (id,ownerId,storageKey,originalName,mimeType,size) VALUES (?,?,?,?,?,?)').run("file", "owner", "b".repeat(64), "test.pdf", "application/pdf", 5);
    const response = await withRuntime({ ...active(), DB: runtimeDb, BUCKET: { get: async () => null } as unknown as R2Bucket }, () => GET(request()));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("synthetic-hash");
  });
});
