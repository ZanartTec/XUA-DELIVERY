import knex, { Knex } from "knex";

const connectionConfig = process.env.DATABASE_URL;
if (!connectionConfig) {
  throw new Error("FATAL: DATABASE_URL não definido. Defina a variável de ambiente antes de iniciar.");
}

const config: Knex.Config = {
  client: "pg",
  connection: connectionConfig,
  pool: {
    min: 2,
    max: 10,
  },
};

const db: Knex = knex(config);

export default db;
