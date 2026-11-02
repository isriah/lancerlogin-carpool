// The parts of @lancerlogin/module-sdk/api that Carpool logic uses at runtime, copied from LancerLogin Core
// (apps/api/src/http-error.ts and apps/api/src/core-roster-projection.ts). Core provides the real SDK in a composed build;
// this stand-in lets the plugin's own tests run without a Core checkout.
export class HttpError extends Error {
  constructor(status, message, details, code, extra) {
    super(message);
    this.status = status;
    this.details = details;
    if (code !== undefined) this.code = code;
    if (extra !== undefined) this.extra = extra;
  }
}

/** Core's stable, installation-scoped roster projection for optional modules. */
export function listActiveRosterIdentities(db, installationId) {
  return db.prepare("SELECT id,external_id AS externalId,first_name AS firstName,last_name AS lastName,email FROM members WHERE installation_id=? AND active=1 ORDER BY last_name,first_name,id LIMIT 500").bind(installationId).all();
}

export async function activeRosterIdentity(db, installationId, memberId) {
  return db.prepare("SELECT id,external_id AS externalId,first_name AS firstName,last_name AS lastName,email FROM members WHERE installation_id=? AND id=? AND active=1").bind(installationId, memberId).first();
}
