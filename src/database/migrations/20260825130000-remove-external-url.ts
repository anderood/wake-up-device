import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

const devicesTable = "devices";

export const up: Migration = async ({ context }) => {
    const columns = await context.describeTable(devicesTable);

    if ("external_url" in columns) {
        await context.sequelize.query(
            "ALTER TABLE `devices` DROP COLUMN `external_url`"
        );
    }
};

export const down: Migration = async ({ context }) => {
    const columns = await context.describeTable(devicesTable);

    if (!("external_url" in columns)) {
        await context.addColumn(devicesTable, "external_url", {
            type: DataTypes.STRING(2048),
            allowNull: true
        });
    }
};
