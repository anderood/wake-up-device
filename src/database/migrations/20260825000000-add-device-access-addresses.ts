import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

const devicesTable = "devices";

export const up: Migration = async ({ context }) => {
    const columns = await context.describeTable(devicesTable);

    if (!("external_ip_address" in columns)) {
        await context.addColumn(devicesTable, "external_ip_address", {
            type: DataTypes.STRING(15),
            allowNull: true
        });
    }

    if (!("access_port" in columns)) {
        await context.addColumn(devicesTable, "access_port", {
            type: DataTypes.INTEGER,
            allowNull: true
        });
    }
};

export const down: Migration = async ({ context }) => {
    const columns = await context.describeTable(devicesTable);

    if ("access_port" in columns) {
        await context.sequelize.query(
            "ALTER TABLE `devices` DROP COLUMN `access_port`"
        );
    }

    if ("external_ip_address" in columns) {
        await context.sequelize.query(
            "ALTER TABLE `devices` DROP COLUMN `external_ip_address`"
        );
    }
};
