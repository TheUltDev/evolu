import type { AuthResult, OwnerId } from "@evolu/common";
import {
  base64UrlToUint8Array,
  createRandomBytes,
  createSymmetricCrypto,
  EncryptionKey,
  Entropy32,
  uint8ArrayToBase64Url,
} from "@evolu/common";

const randomBytes = createRandomBytes();
const symmetricCrypto = createSymmetricCrypto({ randomBytes });
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface StoredRecordV1 {
  readonly version: 1;
  readonly credentialId: string; // Base64Url
  readonly salt: string; // Base64Url
  readonly nonce: string; // Base64Url
  readonly ciphertext: string; // Base64Url
}

export function hasWebAuthn(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials &&
    typeof (window as any).PublicKeyCredential !== "undefined"
  );
}

const toEncryptionKey = (bytes: Uint8Array): typeof EncryptionKey.Type =>
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

export async function createCredentialAndKey(
  username: string,
  ownerId: OwnerId,
): Promise<{ credentialId: Uint8Array; encryptionKey: typeof EncryptionKey.Type; salt: Uint8Array } | null> {
  if (!hasWebAuthn()) return null;

  const challenge = randomBytes.create(32);
  const salt = randomBytes.create(32);

  const userIdBytes = base64UrlToUint8Array(ownerId as unknown as string);

  const publicKey: PublicKeyCredentialCreationOptions & { extensions?: any } = {
    challenge,
    rp: { name: "Evolu", id: window.location.hostname },
    user: { id: userIdBytes, name: username, displayName: username },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
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

  const credId = new Uint8Array(credential.rawId);
  const exts = (credential as any).getClientExtensionResults?.() ?? {};
  const prf = exts?.prf;
  const prfBytes: Uint8Array | null = prf?.results?.first ? new Uint8Array(prf.results.first) : null;

  if (!prfBytes) {
    const fallbackKey = toEncryptionKey(randomBytes.create(32));
    return { credentialId: credId, encryptionKey: fallbackKey, salt };
  }

  return { credentialId: credId, encryptionKey: toEncryptionKey(prfBytes), salt };
}

export async function getKeyViaAssertion(
  credentialId: Uint8Array,
  salt: Uint8Array,
): Promise<typeof EncryptionKey.Type | null> {
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
  const prfBytes: Uint8Array | null = prf?.results?.first ? new Uint8Array(prf.results.first) : null;
  if (!prfBytes) return null;
  return toEncryptionKey(prfBytes);
}

export function encryptAuthResult(
  data: AuthResult,
  encryptionKey: typeof EncryptionKey.Type,
): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const plaintext = textEncoder.encode(JSON.stringify(data));
  return symmetricCrypto.encrypt(plaintext, encryptionKey);
}

export function decryptAuthResult(
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  encryptionKey: typeof EncryptionKey.Type,
): AuthResult | null {
  const res = symmetricCrypto.decrypt(ciphertext, encryptionKey, nonce);
  if (!res.ok) return null;
  try {
    return JSON.parse(textDecoder.decode(res.value)) as AuthResult;
  } catch {
    return null;
  }
}

export function parseStoredRecord(raw: string):
  | { credentialId: Uint8Array; salt: Uint8Array; nonce: Uint8Array; ciphertext: Uint8Array }
  | null {
  try {
    const parsed = JSON.parse(raw) as StoredRecordV1 | null;
    if (!parsed || parsed.version !== 1) return null;
    return {
      credentialId: base64UrlToUint8Array(parsed.credentialId),
      salt: base64UrlToUint8Array(parsed.salt),
      nonce: base64UrlToUint8Array(parsed.nonce),
      ciphertext: base64UrlToUint8Array(parsed.ciphertext),
    };
  } catch {
    return null;
  }
}

export function serializeStoredRecord(input: {
  credentialId: Uint8Array;
  salt: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}): string {
  const record: StoredRecordV1 = {
    version: 1,
    credentialId: uint8ArrayToBase64Url(input.credentialId),
    salt: uint8ArrayToBase64Url(input.salt),
    nonce: uint8ArrayToBase64Url(input.nonce),
    ciphertext: uint8ArrayToBase64Url(input.ciphertext),
  };
  return JSON.stringify(record);
}
