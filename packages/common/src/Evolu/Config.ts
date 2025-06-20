import { ConsoleConfig } from "../Console.js";
import { getOrThrow } from "../Result.js";
import { Mnemonic, SimpleName } from "../Type.js";
import type { DbIndexesBuilder } from "./Kysely.js";

export interface Config extends ConsoleConfig {
  /**
   * The name of Evolu instances. Evolu is multitenant - it can run more
   * instances concurrently. Every Evolu instance has to have its own unique
   * name. Database files are separated and invisible to each other.
   *
   * The default value is: `Evolu`.
   *
   * ### Example
   *
   * ```ts
   * // name: getOrThrow(SimpleName.from("MyApp"))
   * ```
   */
  readonly name: SimpleName;

  /**
   * URL for Evolu sync and backup server.
   *
   * The default value is `https://free.evoluhq.com`.
   */
  readonly syncUrl: string;

  /**
   * URL to reload browser tabs after reset or restore.
   *
   * The default value is `/`.
   */
  readonly reloadUrl: string;

  /**
   * Maximum physical clock drift allowed in ms.
   *
   * The default value is 5 * 60 * 1000 (5 minutes).
   */
  readonly maxDrift: number;

  /**
   * Use the `indexes` option to define SQLite indexes.
   *
   * Table and column names are not typed because Kysely doesn't support it.
   *
   * https://medium.com/@JasonWyatt/squeezing-performance-from-sqlite-indexes-indexes-c4e175f3c346
   *
   * ### Example
   *
   * ```ts
   * const evolu = createEvolu(evoluReactDeps)(Schema, {
   *   indexes: (create) => [
   *     create("todoCreatedAt").on("todo").column("createdAt"),
   *     create("todoCategoryCreatedAt")
   *       .on("todoCategory")
   *       .column("createdAt"),
   *   ],
   * });
   * ```
   */
  readonly indexes?: DbIndexesBuilder;

  /**
   * Use this option to create Evolu with the specified mnemonic. If omitted,
   * the mnemonic will be autogenerated. That should be the default behavior
   * until special UX requirements are needed (e.g., multitenancy).
   */
  readonly mnemonic?: Mnemonic;
}

export interface ConfigDep {
  readonly config: Config;
}

export const defaultConfig: Config = {
  name: getOrThrow(SimpleName.fromParent("Evolu")),
  syncUrl: "https://free.evoluhq.com",
  reloadUrl: "/",
  maxDrift: 5 * 60 * 1000,
  enableLogging: false,
};
