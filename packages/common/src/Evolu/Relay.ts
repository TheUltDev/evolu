import { isNonEmptyReadonlyArray } from "../Array.js";
import { ConsoleConfig } from "../Console.js";
import { TimingSafeEqualDep } from "../Crypto.js";
import { ok, Result } from "../Result.js";
import { sql, SqliteError } from "../Sqlite.js";
import { SimpleName } from "../Type.js";
import { OwnerId, WriteKey } from "./Owner.js";
import { EncryptedDbChange, Storage } from "./Protocol.js";
import {
  createSqliteStorageBase,
  CreateSqliteStorageBaseOptions,
  SqliteStorageDeps,
} from "./Storage.js";
import { timestampToBinaryTimestamp } from "./Timestamp.js";

export interface Relay extends Disposable {}

export interface RelayConfig extends ConsoleConfig {
  readonly name?: SimpleName;
}

export type RelaySqliteStorageDeps = SqliteStorageDeps & TimingSafeEqualDep;

export const createRelayStorage =
  (deps: RelaySqliteStorageDeps) =>
  (options: CreateSqliteStorageBaseOptions): Result<Storage, SqliteError> => {
    const sqliteStorageBase = createSqliteStorageBase(deps)(options);
    if (!sqliteStorageBase.ok) return sqliteStorageBase;

    for (const query of [
      sql`
        create table if not exists evolu_writeKey (
          "ownerId" blob not null,
          "writeKey" blob not null,
          primary key ("ownerId")
        )
        strict;
      `,

      sql`
        create table if not exists evolu_message (
          "ownerId" blob not null,
          "timestamp" blob not null,
          "change" blob not null,
          primary key ("ownerId", "timestamp")
        )
        strict;
      `,
    ]) {
      const result = deps.sqlite.exec(query);
      if (!result.ok) return result;
    }

    return ok({
      ...sqliteStorageBase.value,

      /**
       * Lazily authorizes the initiator's {@link WriteKey} for the given
       * {@link OwnerId}.
       *
       * - If the {@link OwnerId} does not exist, it is created and associated with
       *   the provided write key.
       * - If the {@link OwnerId} exists, the provided write key is compared to the
       *   stored key.
       */
      validateWriteKey: (ownerId, writeKey) => {
        const selectWriteKey = deps.sqlite.exec<{ writeKey: WriteKey }>(sql`
          select writeKey
          from evolu_writeKey
          where ownerId = ${ownerId};
        `);
        if (!selectWriteKey.ok) {
          options.onStorageError(selectWriteKey.error);
          return false;
        }

        const { rows } = selectWriteKey.value;

        if (!isNonEmptyReadonlyArray(rows)) {
          const insertWriteKey = deps.sqlite.exec(sql`
            insert into evolu_writeKey (ownerId, writeKey)
            values (${ownerId}, ${writeKey});
          `);
          if (!insertWriteKey.ok) {
            options.onStorageError(insertWriteKey.error);
            return false;
          }

          return true;
        }

        return deps.timingSafeEqual(rows[0].writeKey, writeKey);
      },

      writeMessages: (ownerId, messages) => {
        const result = deps.sqlite.transaction(() => {
          for (const message of messages) {
            const insertTimestampResult =
              sqliteStorageBase.value.insertTimestamp(
                ownerId,
                timestampToBinaryTimestamp(message.timestamp),
              );
            if (!insertTimestampResult.ok) return insertTimestampResult;

            const insertMessage = deps.sqlite.exec(sql`
              insert into evolu_message ("ownerId", "timestamp", "change")
              values
                (
                  ${ownerId},
                  ${timestampToBinaryTimestamp(message.timestamp)},
                  ${message.change}
                )
              on conflict do nothing;
            `);
            if (!insertMessage.ok) return insertMessage;
          }
          return ok();
        });

        if (!result.ok) {
          options.onStorageError(result.error);
          return false;
        }

        return true;
      },

      readDbChange: (ownerId, timestamp) => {
        const result = deps.sqlite.exec<{
          change: EncryptedDbChange;
        }>(sql`
          select "change"
          from evolu_message
          where "ownerId" = ${ownerId} and "timestamp" = ${timestamp};
        `);
        if (!result.ok) {
          options.onStorageError(result.error);
          return null;
        }

        return result.value.rows[0]?.change;
      },
    });
  };
