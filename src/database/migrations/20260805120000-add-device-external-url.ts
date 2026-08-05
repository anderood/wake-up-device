import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

export const up: Migration = async ({ context }) => {
    const columns = await context.describeTable("devices");

    if (!("external_url" in columns)) {
        await context.addColumn("devices", "external_url", {
            type: DataTypes.STRING(2048),
            allowNull: true
        });
    }
};

export const down: Migration = async ({ context }) => {
    const columns = await context.describeTable("devices");

    if ("external_url" in columns) {
        await context.removeColumn("devices", "external_url");
    }
};
