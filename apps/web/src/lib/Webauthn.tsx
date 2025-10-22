import type { AuthProvider, AuthResult, OwnerId } from "@evolu/common";
import {
  AUTH_DEFAULT_OPTIONS,
  createOwner,
  createOwnerSecret,
  createRandomBytes,
} from "@evolu/common";

// Lightweight WebAuthn-like polyfill using localStorage.
// Mirrors the API shape of SensitiveInfo.ts (React Native),
// but for the web without relying on sodium. Uses existing crypto from @evolu/common.

const randomBytes = createRandomBytes();
const STORAGE_PREFIX = "evoluAuth:";

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

export const authProvider: AuthProvider = {
  login: async ({ ownerId, options }): Promise<AuthResult | null> => {
    const storage = getStorage();
    if (!storage) return null;

    const raw = storage.getItem(buildKey(ownerId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as AuthResult;
    } catch {
      return null;
    }
  },

  register: async ({ username, options }): Promise<AuthResult | null> => {
    const storage = getStorage();
    if (!storage) return null;

    const secret = createOwnerSecret({ randomBytes });
    const owner = createOwner(secret);

    const record: AuthResult = { username, owner };
    storage.setItem(buildKey(owner.id), JSON.stringify(record));

    return record;
  },

  unregister: async ({ ownerId, options }): Promise<void> => {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(buildKey(ownerId));
  },

  getOwnerIds: async ({ options }): Promise<OwnerId[]> => {
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
