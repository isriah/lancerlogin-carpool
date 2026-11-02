// Carpool's stale-revision guards and location-lookup lease on Miniflare's real D1, the only Carpool test on real D1. This
// mirrors the one test in LancerLogin Core's tests-ts/carpool/d1.ts. All people and places here are synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import type { D1Database } from "@lancerlogin/module-sdk/api";
import { readFileSync } from "node:fs";
import "./helpers/sdk.mjs";

const { HttpError } = await import("@lancerlogin/module-sdk/api");
const { carpoolRoute, createCarpoolPlan } = await import("../src/api/carpool-api.ts");

const request = (path: string, method = "GET") => new Request(`https://synthetic.test${path}`, { method });
const person = (name: string, status: "offer" | "needs-ride", longitude: number) => ({ memberId: null, displayName: name, contact: "", outboundStatus: status, outboundAddress: "Synthetic", outboundLatitude: 40, outboundLongitude: longitude, outboundSeats: status === "offer" ? 1 : null, returnStatus: status, returnAddress: "Synthetic", returnLatitude: 40, returnLongitude: longitude, returnSeats: status === "offer" ? 1 : null, returnSameAsOutbound: true, notes: "" });

test("Miniflare D1 rolls back stale Carpool guards before invalidation and audit writes", async () => {
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: { DB: "carpool-stale-guard" } }));
  try {
    const database = await runtime.getD1Database("DB");
    // Core's tables and the adopted carpool_* schema, one statement at a time as D1 prepares them. Core's own test builds
    // a reduced schema from Core's migration files, which this repository doesn't have.
    const schema = readFileSync(new URL("fixtures/core-carpool-schema.sql", import.meta.url), "utf8").replace(/^--.*\n/gm, "").split(/;\n\n/).map((sql) => sql.trim()).filter(Boolean);
    for (const sql of schema) await database.prepare(sql).run();
    await database.prepare("INSERT INTO installations(id,created_at,auth_mode) VALUES('primary','2026-09-29','local')").run(); await database.prepare("INSERT INTO users(id,installation_id,local_username,role,created_at) VALUES('admin','primary','admin','admin','2026-09-29')").run();
    const db = database as unknown as D1Database; const detail = await createCarpoolPlan(db, "admin", { title: "D1 guard", destination: "Arena", radiusMiles: 12, preferredRadiusMiles: 4 }); const planId = String(detail.plan.id);
    await carpoolRoute(db, "admin", request(`/admin/carpool/plans/${planId}/people`, "POST"), person("Driver", "offer", -74.01)); await carpoolRoute(db, "admin", request(`/admin/carpool/plans/${planId}/people`, "POST"), person("Rider", "needs-ride", -74)); await carpoolRoute(db, "admin", request(`/admin/carpool/plans/${planId}/generate/outbound`, "POST"), {});
    const context = (await carpoolRoute(db, "admin", request(`/admin/carpool/context?planId=${planId}`))).body as { detail: { people: Array<Record<string, any>> } }; const rider = context.detail.people.find((item) => item.displayName === "Rider")!;
    await carpoolRoute(db, "admin", request(`/admin/carpool/plans/${planId}/people/${rider.id}`, "PATCH"), { ...person("Rider", "needs-ride", -74), contact: "first@example.test", revision: rider.revision });
    const beforeAssignments = await database.prepare("SELECT COUNT(*) AS count FROM carpool_assignments").first<{ count: number }>(); const beforeAudits = await database.prepare("SELECT COUNT(*) AS count FROM audit_log").first<{ count: number }>();
    await assert.rejects(() => carpoolRoute(db, "admin", request(`/admin/carpool/plans/${planId}/people/${rider.id}`, "PATCH"), { ...person("Rider", "needs-ride", -73.5), revision: rider.revision }), (error: unknown) => error instanceof HttpError && error.status === 409);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM carpool_assignments").first<{ count: number }>())?.count, beforeAssignments?.count); assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM audit_log").first<{ count: number }>())?.count, beforeAudits?.count);
    await carpoolRoute(db, "admin", request(`/admin/carpool/plans/${planId}/people`, "POST"), { ...person("Automatic rider", "needs-ride", -74), outboundAddress: "Synthetic automatic address", returnAddress: "Synthetic automatic address", outboundLatitude: null, outboundLongitude: null, returnLatitude: null, returnLongitude: null });
    let release!: () => void; let entered!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }); const started = new Promise<void>(resolve => { entered = resolve; }); let calls = 0;
    const provider = { id: "synthetic", async resolve() { calls++; entered(); await pending; return { latitude: 40.2, longitude: -74.2 }; } };
    const resolving = carpoolRoute(db, "admin", request(`/admin/carpool/plans/${planId}/locations/resolve`, "POST"), { automatic: true }, provider); await started;
    const simultaneous = (await carpoolRoute(db, "admin", request(`/admin/carpool/plans/${planId}/locations/resolve`, "POST"), { automatic: true }, provider)).body as any; assert.equal(simultaneous.locationLookup.state, "running"); assert.equal(calls, 1);
    await database.prepare("UPDATE carpool_location_resolution SET lease_expires_at='2000-01-01T00:00:00Z' WHERE plan_id=?").bind(planId).run(); release();
    await assert.rejects(resolving, (error: unknown) => error instanceof HttpError && error.status === 409);
    const retained = (await carpoolRoute(db, "admin", request(`/admin/carpool/context?planId=${planId}`), undefined, provider)).body as any; assert.equal(retained.detail.plan.revision, simultaneous.plan.revision); assert.equal(retained.detail.people.find((person: any) => person.displayName === "Automatic rider").outboundLatitude, null);
  } finally { await runtime.dispose(); }
});
