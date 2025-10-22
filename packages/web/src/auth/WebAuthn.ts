import { set, get, del, keys } from "idb-keyval";
import type { AuthProvider, AuthResult, OwnerId } from "@evolu/common";
import { createOwner, createOwnerSecret, createRandomBytes } from "@evolu/common";
import {
  createCredentialAndKey,
  decryptAuthResult,
  encryptAuthResult,
  getKeyViaAssertion,
  hasWebAuthn,
  parseStoredRecord,
  serializeStoredRecord,
} from "../lib/webauthn.js";

const randomBytes = createRandomBytes();

export const authProvider: AuthProvider = {
  login: async ({ ownerId }) => {
    const stored = await get<string>(ownerId);
    if (!stored) return null;
    const record = parseStoredRecord(stored);
    if (!record) return null;

    const key = await getKeyViaAssertion(record.credentialId, record.salt);
    if (!key) return null;

    return decryptAuthResult(record.nonce, record.ciphertext, key);
  },

  register: async ({ username }) => {
    const secret = createOwnerSecret({ randomBytes });
    const owner = createOwner(secret);

    // owner.id is Base64Url; use as user.id material
    const result = hasWebAuthn()
      ? await createCredentialAndKey(username, owner.id)
      : null;

    if (!result) {
      await set(owner.id, JSON.stringify({ username, owner } satisfies AuthResult));
      return { owner, username };
    }

    const { credentialId, encryptionKey, salt } = result;

    const { nonce, ciphertext } = encryptAuthResult({ username, owner }, encryptionKey);
    await set(owner.id, serializeStoredRecord({ credentialId, salt, nonce, ciphertext }));
    return { owner, username };
  },

  unregister: async ({ ownerId }) => {
    await del(ownerId);
  },

  getOwnerIds: async () => {
    const accountKeys = await keys();
    return accountKeys.map((id) => id.toString() as OwnerId).filter(Boolean);
  },
};
