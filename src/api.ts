// Carpool's Worker contribution. Handlers receive Core's module context and the module-scoped database; plugins never
// see the Worker environment, so Geoapify lookups use only the API key saved (encrypted) in Carpool settings.
import { createMeetingReferenceAccess, defineApiModule } from "@lancerlogin/module-sdk/api";
import { carpoolRoute, createCarpoolPlan } from "./api/carpool-api.ts";
import { carpoolBackupAdapter } from "./api/carpool-backup.ts";
import { carpoolCleanupSteps } from "./api/carpool-lifecycle.ts";
import { carpoolSetupPredicates, carpoolSetupStepValid } from "./api/carpool-module-setup.ts";
import { carpoolSettingsRoute, readCarpoolGeocoder } from "./api/carpool-settings.ts";

const api = defineApiModule({
  moduleId: "carpool",
  routes: {
    async "/module-setup/carpool"(context) {
      if (context.url.pathname !== "/module-setup/carpool/plan" || context.request.method !== "POST") return undefined;
      const principal = await context.requireRole(["admin"]);
      return context.respond(await createCarpoolPlan(context.db, principal.userId, await context.json()), 201);
    },
    async "/admin/carpool"(context) {
      if (context.url.pathname === "/admin/carpool/settings") {
        const principal = await context.requireRole(["admin"]);
        return context.respond(await carpoolSettingsRoute(context.db, principal.userId, context.request, await context.body(), context.services.credentials));
      }
      if (!context.url.pathname.startsWith("/admin/carpool/")) return undefined;
      const principal = await context.requireRole(["admin", "operator"]);
      const meetingAccess = await createMeetingReferenceAccess(context.db, principal.userId);
      const geocoder = await readCarpoolGeocoder(context.db, context.services.credentials);
      const routed = await carpoolRoute(context.db, principal.userId, context.request, await context.body(2_000_000), geocoder, meetingAccess);
      return context.respond(routed.body, routed.status);
    },
  },
  setup: { predicates: carpoolSetupPredicates, stepValid: carpoolSetupStepValid },
  cleanup: { steps: carpoolCleanupSteps },
  backup: carpoolBackupAdapter,
});

export default api;
