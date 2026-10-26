import { validateCarpoolSchedule } from "../shared/carpool-schedule.ts";
import { HttpError, type ModuleBackupAdapter, type ModuleBackupSource, type ModuleBackupTables } from "@lancerlogin/module-sdk/api";
import { carpoolMeetingId } from "./carpool-meeting-links.ts";
import { parseGroupSettings, parseRebuildSnapshot, checkRebuildParticipants } from "./carpool-rebuild.ts";
import { carpoolDirections, type CarpoolTripScope } from "../shared/carpool-state.ts";
import type { CarpoolPerson } from "./carpool-planning.ts";

type Row = Record<string, unknown>;
export type CarpoolBackupTables = {
  carpool_settings?: Row[];
  carpool_plans: Row[];
  carpool_people: Row[];
  carpool_assignments: Row[];
  carpool_unresolved: Row[];
};

/** Portable tables in parent-first restore order. Columns are exactly those Core exported while Carpool was first-party. */
export const carpoolBackupColumns = Object.freeze({
  carpool_settings: ["installation_id", "radius_miles", "preferred_radius_miles", "revision", "updated_at"],
  carpool_plans: ["installation_id", "id", "title", "destination", "event_reference", "event_title_snapshot", "event_starts_at_snapshot", "radius_miles", "preferred_radius_miles", "notes", "archived", "revision", "created_by", "created_at", "updated_at", "meeting_id", "trip_scope", "group_settings_json", "last_rebuild_json", "time_zone", "outbound_departure_at", "return_departure_at"],
  carpool_people: ["installation_id", "plan_id", "id", "member_id", "display_name", "contact", "source_row", "import_identity", "import_snapshot_json", "outbound_status", "outbound_address", "outbound_lat", "outbound_lon", "outbound_seats", "return_status", "return_address", "return_lat", "return_lon", "return_seats", "return_same_as_outbound", "notes", "revision", "created_at", "updated_at", "outbound_location_source", "outbound_location_label", "return_location_source", "return_location_label"],
  carpool_assignments: ["installation_id", "plan_id", "direction", "rider_id", "vehicle_person_id", "distance_miles", "locked", "manual", "created_at", "updated_at"],
  carpool_unresolved: ["installation_id", "plan_id", "direction", "rider_id", "reason", "detail", "created_at"],
  carpool_import_profiles: ["installation_id", "header_key", "mapping_json", "updated_by", "updated_at"],
  carpool_location_cache: ["installation_id", "cache_key", "provider", "normalized_address", "original_address", "status", "latitude", "longitude", "label", "saved_at", "expires_at"],
} as const satisfies Readonly<Record<string, readonly string[]>>);
type CarpoolBackupTable = keyof typeof carpoolBackupColumns;
const carpoolBackupTableNames = Object.keys(carpoolBackupColumns) as CarpoolBackupTable[];

/**
 * Columns a first-party (Core section) backup of the given schema carried for a Carpool table. These are the schema
 * shims Core applied before the extraction: schema 30 added Carpool, 33 meeting links, 35 settings, 37 trip scope and pin
 * provenance, 38 group settings and rebuild recovery, and 39 trip timing.
 */
export function carpoolCoreSectionColumns(table: CarpoolBackupTable, schema: number): readonly string[] | undefined {
  if (schema < 30 || table === "carpool_settings" && schema < 35) return undefined;
  const columns: readonly string[] = carpoolBackupColumns[table];
  if (table === "carpool_plans" && schema < 39) return columns.filter((column) => !["time_zone", "outbound_departure_at", "return_departure_at"].includes(column) && (schema >= 38 || !["group_settings_json", "last_rebuild_json"].includes(column)) && (schema >= 37 || column !== "trip_scope") && (schema >= 33 || column !== "meeting_id"));
  if (table === "carpool_people" && schema < 37) return columns.filter((column) => !column.endsWith("_location_source") && !column.endsWith("_location_label"));
  return columns;
}

const scalar = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);

/**
 * Convert Carpool rows from an older backup into the current declared shape. Version 1 rows come from Core's section of a
 * backup made while Carpool was first-party, so their columns depend on that file's schema. The checks match the ones
 * Core applied: every expected column is present with a scalar value, and from schema 31 no other column may appear.
 */
export function normalizeCarpoolBackup(tables: ModuleBackupTables, fromVersion: number, source: ModuleBackupSource): ModuleBackupTables {
  if (fromVersion !== 1 || !source.coreSection) throw new HttpError(400, `Carpool backup version ${fromVersion} cannot be restored by this Carpool release`);
  const schema = source.backupSchemaVersion;
  const result: Record<string, Row[]> = {};
  for (const table of carpoolBackupTableNames) {
    const columns = carpoolCoreSectionColumns(table, schema);
    const rows = tables[table];
    if (!columns) {
      if (rows !== undefined) throw new HttpError(400, "Backup contains tables that are not owned by this Community-based application");
      result[table] = [];
      continue;
    }
    if (!Array.isArray(rows)) throw new HttpError(400, `Backup table ${table} is missing`);
    for (const row of rows) if (!row || typeof row !== "object" || Array.isArray(row) || columns.some((column) => !scalar(row[column])) || schema >= 31 && Object.keys(row).some((column) => !columns.includes(column))) throw new HttpError(400, `Backup table ${table} contains an invalid row`);
    result[table] = rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
  }
  if (Object.keys(tables).some((table) => !carpoolBackupTableNames.includes(table as CarpoolBackupTable))) throw new HttpError(400, "Backup contains tables that are not owned by this Community-based application");
  if (schema < 39) result.carpool_plans = result.carpool_plans!.map((row) => ({ ...row, time_zone: "UTC", outbound_departure_at: null, return_departure_at: null }));
  if (schema < 38) result.carpool_plans = result.carpool_plans!.map((row) => ({ ...row, group_settings_json: "[]", last_rebuild_json: null }));
  if (schema < 37) {
    result.carpool_plans = result.carpool_plans!.map((row) => ({ ...row, trip_scope: "both" }));
    result.carpool_people = result.carpool_people!.map((row) => ({ ...row, outbound_location_source: null, outbound_location_label: null, return_location_source: null, return_location_label: null }));
  }
  if (schema < 33) result.carpool_plans = result.carpool_plans!.map((row) => ({ ...row, meeting_id: null }));
  // Restore in the declared column order.
  return Object.fromEntries(carpoolBackupTableNames.map((table) => [table, result[table]!.map((row) => Object.fromEntries(carpoolBackupColumns[table].map((column) => [column, row[column]])))]));
}

const key = (row: Row, suffix = "") => `${String(row.installation_id)}:${String(row.plan_id)}:${String(row.id ?? row.rider_id)}${suffix}`;

export function validateCarpoolBackupTables(tables: CarpoolBackupTables) {
  if ((tables.carpool_settings?.length ?? 0) > 1) throw new HttpError(400, "Backup contains duplicate Carpool settings");
  for (const row of tables.carpool_settings ?? []) {
    if (row.installation_id !== "primary" || typeof row.radius_miles !== "number" || !Number.isFinite(row.radius_miles) || row.radius_miles < 0.5 || row.radius_miles > 250 || typeof row.preferred_radius_miles !== "number" || !Number.isFinite(row.preferred_radius_miles) || row.preferred_radius_miles < 0.5 || row.preferred_radius_miles > row.radius_miles || !Number.isSafeInteger(row.revision) || Number(row.revision) < 0) throw new HttpError(400, "Backup contains invalid Carpool settings");
  }
  for (const row of tables.carpool_plans) {
    carpoolMeetingId(row.meeting_id);
    try { validateCarpoolSchedule({ timeZone: row.time_zone, outboundDepartureAt: row.outbound_departure_at, returnDepartureAt: row.return_departure_at }, (row.trip_scope ?? "both") as CarpoolTripScope); } catch (error) { throw new HttpError(400, "Backup contains invalid Carpool trip timing: " + (error as Error).message); }
    if (row.trip_scope !== undefined && !["both", "outbound", "return"].includes(String(row.trip_scope))) throw new HttpError(400, "Backup contains invalid Carpool trip scope");
  }
  const plans = new Set(tables.carpool_plans.map((row) => `${String(row.installation_id)}:${String(row.id)}`));
  if (plans.size !== tables.carpool_plans.length) throw new HttpError(400, "Backup contains duplicate Carpool plans");
  const people = new Map(tables.carpool_people.map((row) => [key(row), row]));
  if (people.size !== tables.carpool_people.length) throw new HttpError(400, "Backup contains duplicate Carpool participants");
  const counts = new Map<string, number>();
  for (const row of tables.carpool_people) {
    for (const direction of ["outbound", "return"]) {
      const source = row[`${direction}_location_source`]; const label = row[`${direction}_location_label`];
      if (source !== undefined && source !== null && !["lookup", "manual", "no-match"].includes(String(source))) throw new HttpError(400, "Backup contains invalid Carpool location provenance");
      if (label !== undefined && label !== null && (typeof label !== "string" || label.length > 500)) throw new HttpError(400, "Backup contains invalid Carpool matched address");
      if (source === "no-match" && (row[`${direction}_lat`] !== null || row[`${direction}_lon`] !== null) || ["lookup", "manual"].includes(String(source)) && (row[`${direction}_lat`] === null || row[`${direction}_lon`] === null)) throw new HttpError(400, "Backup Carpool location provenance does not match its pin");
    }
    const plan = `${String(row.installation_id)}:${String(row.plan_id)}`; if (!plans.has(plan)) throw new HttpError(400, "Backup Carpool participant references a missing plan"); counts.set(plan, (counts.get(plan) ?? 0) + 1);
  }
  if ([...counts.values()].some((count) => count > 500)) throw new HttpError(400, "Backup Carpool plan contains too many participants");
  for (const row of tables.carpool_plans) {
    const rows = tables.carpool_people.filter(person => person.installation_id === row.installation_id && person.plan_id === row.id); const ids = new Set(rows.map(person => String(person.id)));
    const settings = parseGroupSettings(row.group_settings_json); if (settings.some(item => !ids.has(item.vehiclePersonId))) throw new HttpError(400, "Backup Carpool group settings refer to a missing participant");
    const snapshot = parseRebuildSnapshot(row.last_rebuild_json); if (snapshot && snapshot.revision > Number(row.revision)) throw new HttpError(400, "Backup Carpool rebuild recovery has a future revision");
    if (snapshot && snapshot.revision === row.revision) {
      if (snapshot.directions.some(trip => !carpoolDirections((row.trip_scope ?? "both") as CarpoolTripScope).includes(trip))) throw new HttpError(400, "Backup Carpool rebuild recovery refers to an unplanned direction");
      const people: CarpoolPerson[] = rows.map(person => ({ id: String(person.id), displayName: String(person.display_name), outbound: { status: person.outbound_status, address: person.outbound_address, latitude: person.outbound_lat, longitude: person.outbound_lon, seats: person.outbound_seats }, return: { status: person.return_status, address: person.return_address, latitude: person.return_lat, longitude: person.return_lon, seats: person.return_seats } } as CarpoolPerson));
      try { checkRebuildParticipants(snapshot, people); } catch { throw new HttpError(400, "Backup Carpool rebuild recovery is inconsistent with its participants"); }
    }
  }
  const assigned = new Set<string>(); const capacity = new Map<string, number>();
  for (const row of tables.carpool_assignments) {
    const direction = String(row.direction); const riderKey = `${String(row.installation_id)}:${String(row.plan_id)}:${String(row.rider_id)}`; const vehicleKey = `${String(row.installation_id)}:${String(row.plan_id)}:${String(row.vehicle_person_id)}`; const unique = `${direction}:${riderKey}`;
    if (assigned.has(unique)) throw new HttpError(400, "Backup contains duplicate Carpool assignments"); assigned.add(unique);
    const rider = people.get(riderKey); const vehicle = people.get(vehicleKey); if (!rider || !vehicle || riderKey === vehicleKey) throw new HttpError(400, "Backup Carpool assignment references an invalid participant");
    if (rider[`${direction}_status`] !== "needs-ride" || vehicle[`${direction}_status`] !== "offer") throw new HttpError(400, "Backup Carpool assignment uses an ineligible rider or car");
    const vehicleDirection = `${direction}:${vehicleKey}`; capacity.set(vehicleDirection, (capacity.get(vehicleDirection) ?? 0) + 1);
  }
  for (const [vehicleDirection, used] of capacity) { const separator = vehicleDirection.indexOf(":"); const direction = vehicleDirection.slice(0, separator); const vehicle = people.get(vehicleDirection.slice(separator + 1)); if (!vehicle || used > Number(vehicle[`${direction}_seats`] ?? 0)) throw new HttpError(400, "Backup Carpool assignment exceeds vehicle capacity"); }
  const unresolved = new Set<string>();
  for (const row of tables.carpool_unresolved) {
    const unique = `${String(row.direction)}:${String(row.installation_id)}:${String(row.plan_id)}:${String(row.rider_id)}`;
    if (unresolved.has(unique)) throw new HttpError(400, "Backup contains duplicate unresolved Carpool rides"); unresolved.add(unique);
    if (!people.has(`${String(row.installation_id)}:${String(row.plan_id)}:${String(row.rider_id)}`)) throw new HttpError(400, "Backup unresolved Carpool ride references a missing participant");
    if (assigned.has(unique)) throw new HttpError(400, "Backup marks a Carpool rider assigned and unresolved in the same direction");
  }
}

/**
 * Backup adapter. Geocoding credentials and location-resolution leases are non-portable: they are never exported, and
 * Core clears them on restore, so saved Geoapify keys must be entered again after recovery.
 */
export const carpoolBackupAdapter: ModuleBackupAdapter = Object.freeze({
  version: 2,
  tables: carpoolBackupColumns,
  normalize: normalizeCarpoolBackup,
  validate(tables: ModuleBackupTables) { validateCarpoolBackupTables(tables as unknown as CarpoolBackupTables); },
});
