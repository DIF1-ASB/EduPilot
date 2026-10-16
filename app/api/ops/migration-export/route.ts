import { config, getRuntime } from "@/lib/runtime";
export const dynamic = "force-dynamic";
const tables = ["User", "UserSettings", "Chat", "Message", "Material", "FileAttachment", "SchoolClass", "ClassInvite", "Enrollment", "Assignment", "Submission", "Grade", "QuizAttempt", "QuizSession", "TrainingSession", "TrainingTurn", "TrainingAttempt", "LearningTask"] as const;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

// Temporary, explicitly activated owner-private migration bridge. Never enabled on VPS.
export async function GET(req: Request) {
  const expected = config("MIGRATION_EXPORT_TOKEN");
  const expires = Date.parse(config("MIGRATION_EXPORT_EXPIRES_AT"));
  const supplied = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!/^[a-f0-9]{64}$/.test(expected) || !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 3_600_000 || supplied.length !== expected.length)
    return new Response(null, { status: 404, headers });
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  if (mismatch) return new Response(null, { status: 404, headers });
  const runtime = getRuntime();
  if (!runtime?.DB) return new Response(null, { status: 404, headers });
  try {
    const results = await runtime.DB.batch<Record<string, unknown>>(tables.map(table => runtime.DB!.prepare(`SELECT * FROM "${table}"`)));
    if (results.some(result => !result.success)) throw new Error("Incomplete database export");
    const data = Object.fromEntries(tables.map((table, index) => [table, results[index].results]));
    const files: { key: string; base64: string; sha256: string }[] = [];
    let fileBytes = 0;
    for (const row of data.FileAttachment) {
      const key = String(row.storageKey);
      if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid attachment key");
      const object = await runtime.BUCKET?.get(key);
      if (!object || object.size !== Number(row.size)) throw new Error("Missing attachment");
      fileBytes += object.size;
      if (fileBytes > 16 * 1024 * 1024) throw new Error("Export exceeds migration bridge limit");
      const bytes = new Uint8Array(await object.arrayBuffer());
      const sha256 = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
      files.push({ key, base64: Buffer.from(bytes).toString("base64"), sha256 });
    }
    const body = JSON.stringify({ format: "edupilot-migration-v1", createdAt: new Date().toISOString(), tables: data, files });
    if (new TextEncoder().encode(body).byteLength > 32 * 1024 * 1024) throw new Error("Export too large");
    return new Response(body, { headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="edupilot-migration.json"' } });
  } catch {
    return new Response("Complete migration export unavailable", { status: 503, headers });
  }
}
