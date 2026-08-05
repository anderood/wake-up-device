import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

export const up: Migration = async ({ context }) => {
    const columns = await context.describeTable("devices");

    if ("mac_address" in columns && columns.mac_address.allowNull === false) {
        await context.changeColumn("devices", "mac_address", {
            type: DataTypes.STRING(20),
            allowNull: true
        });
    }
};

export const down: Migration = async ({ context }) => {
    const columns = await context.describeTable("devices");

    if ("mac_address" in columns && columns.mac_address.allowNull === true) {
        await context.changeColumn("devices", "mac_address", {
            type: DataTypes.STRING(20),
            allowNull: false
        });
    }
};
