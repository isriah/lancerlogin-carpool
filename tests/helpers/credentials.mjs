// Core's module credential service (services.credentials), copied from LancerLogin Core's apps/api/src/integration-crypto.ts:
// AES-GCM with the installation's 32-byte integration key, which module code never sees.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const encode = (value) => btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const decode = (value) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), (character) => character.charCodeAt(0));

async function keyFrom(secret) {
  const bytes = decode(secret);
  if (bytes.length !== 32) throw new Error("INTEGRATION_KEY must contain exactly 32 random bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function decryptIntegration(ciphertext, iv, secret) {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, await keyFrom(secret), decode(ciphertext));
  return JSON.parse(decoder.decode(plaintext));
}

export function moduleCredentials(secret) {
  const key = () => { if (!secret) throw new Error("Integration encryption is not configured"); return secret; };
  return Object.freeze({
    available: Boolean(secret),
    async encrypt(value) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(key()), encoder.encode(JSON.stringify(value))));
      return { ciphertext: encode(ciphertext), iv: encode(iv) };
    },
    decrypt: async (ciphertext, iv) => decryptIntegration(ciphertext, iv, key()),
  });
}
