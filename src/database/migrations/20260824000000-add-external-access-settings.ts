import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

const devicesTable = "devices";
const settingsTable = "app_settings";

export const up: Migration = async ({ context }) => {
    const deviceColumns = await context.describeTable(devicesTable);

    if ("external_url" in deviceColumns && !("local_url" in deviceColumns)) {
        await context.sequelize.query(
            "ALTER TABLE `devices` RENAME COLUMN `external_url` TO `local_url`"
        );
    }

    const tables = await context.showAllTables();

    if (!tables.includes(settingsTable)) {
        await context.createTable(settingsTable, {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                allowNull: false
            },
            external_ip_address: {
                type: DataTypes.STRING(15),
                allowNull: false
            }
        });
    }
};

export const down: Migration = async ({ context }) => {
    const tables = await context.showAllTables();

    if (tables.includes(settingsTable)) {
        await context.dropTable(settingsTable);
    }

    const deviceColumns = await context.describeTable(devicesTable);

    if ("local_url" in deviceColumns && !("external_url" in deviceColumns)) {
        await context.sequelize.query(
            "ALTER TABLE `devices` RENAME COLUMN `local_url` TO `external_url`"
        );
    }
};
