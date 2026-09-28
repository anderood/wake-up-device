import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

const devicesTable = "devices";

export const up: Migration = async ({ context }) => {
    const columns = await context.describeTable(devicesTable);

    if ("location" in columns) {
        await context.sequelize.query(
            "ALTER TABLE `devices` DROP COLUMN `location`"
        );
    }
};

export const down: Migration = async ({ context }) => {
    const columns = await context.describeTable(devicesTable);

    if (!("location" in columns)) {
        await context.addColumn(devicesTable, "location", {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: "Nao informado"
        });
    }
};
