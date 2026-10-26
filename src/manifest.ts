// Carpool module definition. It keeps the ID, contract, setup version, capabilities, routes, tables and cleanup targets
// it had as a first-party module, so existing lifecycle rows, assignments and retained data stay valid.
import type { ModuleDefinition } from "@lancerlogin/module-sdk";

const manifest = {
  id: "carpool",
  label: "Carpool",
  description: "Independent outbound and return ride planning with optional roster and event references.",
  contractVersion: 1,
  available: true,
  dependencies: [],
  capabilities: [{ id: "carpool.manage", label: "Manage Carpool", operator: true }],
  navigation: [{ label: "Carpool", path: "/carpool" }],
  settings: [{ label: "Carpool", path: "/settings/carpool" }],
  setup: { version: 1, steps: [{ id: "workspace", label: "First Carpool plan", required: true }] },
  jobs: [],
  discordCommands: [],
  reportDatasets: [],
  apiRoutes: [
    { path: "/module-setup/carpool", match: "prefix", access: "setup" },
    { path: "/admin/carpool", match: "prefix", access: "workspace" },
  ],
  tablePrefix: "carpool_",
  persistence: {
    tables: ["carpool_settings", "carpool_geocoding_credentials", "carpool_location_resolution", "carpool_plans", "carpool_people", "carpool_assignments", "carpool_unresolved", "carpool_import_profiles", "carpool_location_cache"],
    sharedFields: [],
    transientAuthority: [],
  },
  // Version 1 is the format Core exported while Carpool was first-party; version 2 is the plugin's own backup section.
  backup: { version: 2, nonPortableTables: ["carpool_geocoding_credentials", "carpool_location_resolution"], tables: ["carpool_settings", "carpool_plans", "carpool_people", "carpool_assignments", "carpool_unresolved", "carpool_import_profiles", "carpool_location_cache"] },
  lifecycle: { cleanupTargets: ["carpool_geocoding_credentials", "carpool_location_resolution", "carpool_settings", "carpool_assignments", "carpool_unresolved", "carpool_people", "carpool_plans", "carpool_import_profiles", "carpool_location_cache", "platform_module_setup_progress:carpool", "platform_module_assignments:carpool"] },
  deletedData: ["Carpool plans and optional event snapshots", "Participants, locations, vehicles, assignments, imports, and unresolved ride reasons"],
} as const satisfies ModuleDefinition;

export default manifest;
