import { Database, type Statement } from "bun:sqlite";

import * as Cache from "effect/Cache";
import * as Config from "effect/Config";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { identity } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as ServiceMap from "effect/ServiceMap";
import * as Stream from "effect/Stream";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import * as Client from "effect/unstable/sql/SqlClient";
import type { Connection } from "effect/unstable/sql/SqlConnection";
import { SqlError } from "effect/unstable/sql/SqlError";
import * as StatementCompiler from "effect/unstable/sql/Statement";

const ATTR_DB_SYSTEM_NAME = "db.system.name";

export const TypeId: TypeId = "~local/sqlite-bun/SqliteClient";

export type TypeId = "~local/sqlite-bun/SqliteClient";

export const SqliteClient = ServiceMap.Service<Client.SqlClient>("t3/persistence/BunSqliteClient");

export interface SqliteClientConfig {
  readonly filename: string;
  readonly readonly?: boolean | undefined;
  readonly prepareCacheSize?: number | undefined;
  readonly prepareCacheTTL?: Duration.Input | undefined;
  readonly spanAttributes?: Record<string, unknown> | undefined;
  readonly transformResultNames?: ((str: string) => string) | undefined;
  readonly transformQueryNames?: ((str: string) => string) | undefined;
}

const makeWithDatabase = (
  options: SqliteClientConfig,
  openDatabase: () => Database,
): Effect.Effect<Client.SqlClient, never, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function* () {
    const compiler = StatementCompiler.makeCompilerSqlite(options.transformQueryNames);
    const transformRows = options.transformResultNames
      ? StatementCompiler.defaultTransforms(options.transformResultNames).array
      : undefined;

    const makeConnection = Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const db = openDatabase();
      yield* Scope.addFinalizer(
        scope,
        Effect.sync(() => db.close()),
      );

      const statementReaderCache = new WeakMap<Statement, boolean>();
      const hasRows = (statement: Statement): boolean => {
        const cached = statementReaderCache.get(statement);
        if (cached !== undefined) {
          return cached;
        }
        const value = statement.columnNames.length > 0;
        statementReaderCache.set(statement, value);
        return value;
      };

      const prepareCache = yield* Cache.make({
        capacity: options.prepareCacheSize ?? 200,
        timeToLive: options.prepareCacheTTL ?? Duration.minutes(10),
        lookup: (sql: string) =>
          Effect.try({
            try: () => db.prepare(sql),
            catch: (cause) => new SqlError({ cause, message: "Failed to prepare statement" }),
          }),
      });

      const runStatement = (
        statement: Statement,
        params: ReadonlyArray<unknown>,
        raw: boolean,
      ) =>
        Effect.withFiber<ReadonlyArray<any>, SqlError>((fiber) => {
          statement.safeIntegers?.(Boolean(ServiceMap.get(fiber.services, Client.SafeIntegers)));
          try {
            if (hasRows(statement)) {
              return Effect.succeed(statement.all(...(params as any)));
            }
            const result = statement.run(...(params as any));
            return Effect.succeed(raw ? (result as unknown as ReadonlyArray<any>) : []);
          } catch (cause) {
            return Effect.fail(new SqlError({ cause, message: "Failed to execute statement" }));
          }
        });

      const run = (sql: string, params: ReadonlyArray<unknown>, raw = false) =>
        Effect.flatMap(Cache.get(prepareCache, sql), (statement) =>
          runStatement(statement, params, raw),
        );

      const runValues = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.flatMap(Cache.get(prepareCache, sql), (statement) =>
          Effect.try({
            try: () => statement.values(...(params as any)),
            catch: (cause) => new SqlError({ cause, message: "Failed to execute statement" }),
          }),
        );

      return identity<Connection>({
        execute(sql, params, rowTransform) {
          return rowTransform ? Effect.map(run(sql, params), rowTransform) : run(sql, params);
        },
        executeRaw(sql, params) {
          return run(sql, params, true);
        },
        executeValues(sql, params) {
          return runValues(sql, params);
        },
        executeUnprepared(sql, params, rowTransform) {
          const effect = runStatement(db.prepare(sql), params ?? [], false);
          return rowTransform ? Effect.map(effect, rowTransform) : effect;
        },
        executeStream(_sql, _params) {
          return Stream.die("executeStream not implemented");
        },
      });
    });

    const semaphore = yield* Semaphore.make(1);
    const connection = yield* makeConnection;

    const acquirer = semaphore.withPermits(1)(Effect.succeed(connection));
    const transactionAcquirer = Effect.uninterruptibleMask((restore) => {
      const fiber = Fiber.getCurrent()!;
      const scope = ServiceMap.getUnsafe(fiber.services, Scope.Scope);
      return Effect.as(
        Effect.tap(restore(semaphore.take(1)), () =>
          Scope.addFinalizer(scope, semaphore.release(1)),
        ),
        connection,
      );
    });

    return yield* Client.make({
      acquirer,
      compiler,
      transactionAcquirer,
      spanAttributes: [
        ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
        [ATTR_DB_SYSTEM_NAME, "sqlite"],
      ],
      transformRows,
    });
  });

const make = (
  options: SqliteClientConfig,
): Effect.Effect<Client.SqlClient, never, Scope.Scope | Reactivity.Reactivity> =>
  makeWithDatabase(
    options,
    () =>
      new Database(options.filename, {
        readonly: options.readonly ?? false,
        readwrite: options.readonly === true ? false : true,
        create: options.readonly === true ? false : true,
      }),
  );

export const layerConfig = (
  config: Config.Wrap<SqliteClientConfig>,
): Layer.Layer<Client.SqlClient, Config.ConfigError> =>
  Layer.effectServices(
    Config.unwrap(config)
      .asEffect()
      .pipe(
        Effect.flatMap(make),
        Effect.map((client) =>
          ServiceMap.make(SqliteClient, client).pipe(ServiceMap.add(Client.SqlClient, client)),
        ),
      ),
  ).pipe(Layer.provide(Reactivity.layer));

export const layer = (config: SqliteClientConfig): Layer.Layer<Client.SqlClient> =>
  Layer.effectServices(
    Effect.map(make(config), (client) =>
      ServiceMap.make(SqliteClient, client).pipe(ServiceMap.add(Client.SqlClient, client)),
    ),
  ).pipe(Layer.provide(Reactivity.layer));
