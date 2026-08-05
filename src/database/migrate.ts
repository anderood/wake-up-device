import type { QueryInterface } from "sequelize";
import { fileURLToPath } from "node:url";
import { SequelizeStorage, Umzug } from "umzug";
import database from "./database.ts";

const migrator = new Umzug<QueryInterface>({
    migrations: {
        glob: ["*.ts", {
            cwd: fileURLToPath(new URL("./migrations", import.meta.url))
        }]
    },
    context: database.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize: database }),
    logger: console
});

export type Migration = typeof migrator._types.migration;

try {
    await migrator.up();
} finally {
    await database.close();
}
