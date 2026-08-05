import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

export const up: Migration = async ({ context }) => {
    const columns = await context.describeTable("devices");

    if (!("ip_address" in columns)) {
        await context.addColumn("devices", "ip_address", {
            type: DataTypes.STRING(15),
            allowNull: true
        });
    }
};

export const down: Migration = async ({ context }) => {
    const columns = await context.describeTable("devices");

    if ("ip_address" in columns) {
        await context.removeColumn("devices", "ip_address");
    }
};
