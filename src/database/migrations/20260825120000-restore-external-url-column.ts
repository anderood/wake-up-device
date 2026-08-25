import { QueryTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

const devicesTable = "devices";
const revertedMigration = "20260824000000-add-external-access-settings.ts";

export const up: Migration = async ({ context }) => {
    const columns = await context.describeTable(devicesTable);

    // The reverted migration renamed external_url in already-persisted databases.
    if ("local_url" in columns && !("external_url" in columns)) {
        await context.sequelize.query(
            "ALTER TABLE `devices` RENAME COLUMN `local_url` TO `external_url`"
        );
    }
};

export const down: Migration = async ({ context }) => {
    const columns = await context.describeTable(devicesTable);
    const appliedMigrations = await context.sequelize.query<{ name: string }>(
        "SELECT `name` FROM `SequelizeMeta` WHERE `name` = :migration",
        {
            replacements: { migration: revertedMigration },
            type: QueryTypes.SELECT
        }
    );

    if (appliedMigrations.length > 0
        && "external_url" in columns
        && !("local_url" in columns)) {
        await context.sequelize.query(
            "ALTER TABLE `devices` RENAME COLUMN `external_url` TO `local_url`"
        );
    }
};
