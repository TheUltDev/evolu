import type { AuthProvider, AuthResult, OwnerId } from "@evolu/common";
import {
  createOwner,
  createOwnerSecret,
  createRandomBytes,
  createSymmetricCrypto,
  uint8ArrayToBase64Url,
  base64UrlToUint8Array,
  EncryptionKey,
  Entropy32,
} from "@evolu/common";

// WebAuthn-backed polyfill that encrypts AuthResult using a key derived
// via the WebAuthn PRF extension when available. Falls back gracefully.

const randomBytes = createRandomBytes();
const symmetricCrypto = createSymmetricCrypto({ randomBytes });

const STORAGE_PREFIX = "evoluAuth:";

type Base64Url = string;

interface StoredRecordV1 {
  readonly version: 1;
  readonly credentialId: Base64Url;
  readonly salt: Base64Url; // PRF salt used to derive key
  readonly nonce: Base64Url;
  readonly ciphertext: Base64Url;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function buildKey(ownerId: string): string {
  return `${STORAGE_PREFIX}${ownerId}`;
}

function hasWebAuthn(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials &&
    typeof (window as any).PublicKeyCredential !== "undefined"
  );
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();

const createPrfSalt = (): Uint8Array => randomBytes.create(32);

const bytesFrom = (buf: ArrayBuffer): Uint8Array => new Uint8Array(buf);

const toEncryptionKey = (bytes: Uint8Array): typeof EncryptionKey.Type =>
  // If PRF returns something other than 32 bytes, pad/trim to 32.
  EncryptionKey.orThrow(
    (bytes.length === 32
      ? bytes
      : bytes.length > 32
        ? bytes.slice(0, 32)
        : (() => {
            const out = new Uint8Array(32);
            out.set(bytes);
            return out;
          })()) as Entropy32,
  );

async function createCredentialAndKey(username: string, userIdBytes: Uint8Array): Promise<
  | { credentialId: Uint8Array; encryptionKey: typeof EncryptionKey.Type; salt: Uint8Array }
  | null
> {
  if (!hasWebAuthn()) return null;

  const challenge = randomBytes.create(32);
  const salt = createPrfSalt();

  const publicKey: PublicKeyCredentialCreationOptions & { extensions?: any } = {
    challenge,
    rp: { name: "Evolu", id: window.location.hostname },
    user: { id: userIdBytes, name: username, displayName: username },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256 (fallback)
    ],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    attestation: "none",
    extensions: { prf: { eval: { first: salt } } },
  } as any;

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) return null;

  const credId = bytesFrom(credential.rawId);
  const exts = (credential as any).getClientExtensionResults?.() ?? {};
  const prf = exts?.prf;
  const prfBytes: Uint8Array | null = prf?.results?.first
    ? new Uint8Array(prf.results.first)
    : null;

  if (!prfBytes) {
    // If PRF not available, we can't derive a device-gated secret; fallback to a random one.
    const fallbackKey = toEncryptionKey(randomBytes.create(32));
    return { credentialId: credId, encryptionKey: fallbackKey, salt };
  }

  return { credentialId: credId, encryptionKey: toEncryptionKey(prfBytes), salt };
}

async function getKeyViaAssertion(credentialId: Uint8Array, salt: Uint8Array): Promise<typeof EncryptionKey.Type | null> {
  if (!hasWebAuthn()) return null;

  const challenge = randomBytes.create(32);
  const publicKey: PublicKeyCredentialRequestOptions & { extensions?: any } = {
    challenge,
    allowCredentials: [
      {
        type: "public-key",
        id: credentialId,
        transports: ["internal", "hybrid", "usb", "nfc", "ble"],
      },
    ],
    userVerification: "required",
    extensions: { prf: { eval: { first: salt } } },
  } as any;

  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!assertion) return null;
  const exts = (assertion as any).getClientExtensionResults?.() ?? {};
  const prf = exts?.prf;
  const prfBytes: Uint8Array | null = prf?.results?.first
    ? new Uint8Array(prf.results.first)
    : null;

  if (!prfBytes) return null;
  return toEncryptionKey(prfBytes);
}

function encryptAuthResult(data: AuthResult, encryptionKey: typeof EncryptionKey.Type): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const plaintext = encoder.encode(JSON.stringify(data));
  return symmetricCrypto.encrypt(plaintext, encryptionKey);
}

function decryptAuthResult(nonce: Uint8Array, ciphertext: Uint8Array, encryptionKey: typeof EncryptionKey.Type): AuthResult | null {
  const res = symmetricCrypto.decrypt(ciphertext, encryptionKey, nonce);
  if (!res.ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(res.value)) as AuthResult;
  } catch {
    return null;
  }
}

export const authProvider: AuthProvider = {
  login: async ({ ownerId }) => {
    const storage = getStorage();
    if (!storage) return null;

    const raw = storage.getItem(buildKey(ownerId));
    if (!raw) return null;
    const stored = safeJsonParse<StoredRecordV1>(raw);
    if (!stored || stored.version !== 1) return null;

    const credentialId = base64UrlToUint8Array(stored.credentialId);
    const salt = base64UrlToUint8Array(stored.salt);
    const nonce = base64UrlToUint8Array(stored.nonce);
    const ciphertext = base64UrlToUint8Array(stored.ciphertext);

    // Try to derive key via WebAuthn PRF
    const key = await getKeyViaAssertion(credentialId, salt);
    if (key) {
      return decryptAuthResult(nonce, ciphertext, key);
    }

    // Fallback: no PRF available or assertion cancelled. No unlock possible.
    return null;
  },

  register: async ({ username }) => {
    const storage = getStorage();
    if (!storage) return null;

    // Create owner first in order to use its id as stable user.id
    const secret = createOwnerSecret({ randomBytes });
    const owner = createOwner(secret);

    const ownerIdBytes = base64UrlToUint8Array(owner.id as unknown as string);

    // Create a WebAuthn credential and derive an encryption key
    const result = await createCredentialAndKey(username, ownerIdBytes);

    if (!result) {
      // As a last resort, store unencrypted (not preferred, but keeps UX functional)
      const record: AuthResult = { username, owner };
      storage.setItem(buildKey(owner.id), JSON.stringify(record));
      return record;
    }

    const { credentialId, encryptionKey, salt } = result;

    const { nonce, ciphertext } = encryptAuthResult({ username, owner }, encryptionKey);

    const stored: StoredRecordV1 = {
      version: 1,
      credentialId: uint8ArrayToBase64Url(credentialId),
      salt: uint8ArrayToBase64Url(salt),
      nonce: uint8ArrayToBase64Url(nonce),
      ciphertext: uint8ArrayToBase64Url(ciphertext),
    };

    storage.setItem(buildKey(owner.id), JSON.stringify(stored));
    return { owner, username };
  },

  unregister: async ({ ownerId }) => {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(buildKey(ownerId));
  },

  getOwnerIds: async () => {
    const storage = getStorage();
    if (!storage) return [] as OwnerId[];

    const ids: OwnerId[] = [] as OwnerId[];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      if (key.startsWith(STORAGE_PREFIX)) {
        const id = key.slice(STORAGE_PREFIX.length) as OwnerId;
        if (id) ids.push(id);
      }
    }
    return ids;
  },
};
