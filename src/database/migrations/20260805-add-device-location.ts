import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

const uniqueMacIndex = "devices_mac_address_unique";

export const up: Migration = async ({ context }) => {
    const columns = await context.describeTable("devices");

    if (!("location" in columns)) {
        await context.addColumn("devices", "location", {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: "Nao informado"
        });
    }

    const indexes = await context.showIndex("devices") as Array<{ name: string }>;

    if (!indexes.some((index) => index.name === uniqueMacIndex)) {
        await context.addIndex("devices", ["mac_address"], {
            name: uniqueMacIndex,
            unique: true
        });
    }
};

export const down: Migration = async ({ context }) => {
    const indexes = await context.showIndex("devices") as Array<{ name: string }>;

    if (indexes.some((index) => index.name === uniqueMacIndex)) {
        await context.removeIndex("devices", uniqueMacIndex);
    }

    const columns = await context.describeTable("devices");

    if ("location" in columns) {
        await context.removeColumn("devices", "location");
    }
};
