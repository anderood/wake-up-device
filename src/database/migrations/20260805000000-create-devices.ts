import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

const devicesTable = "devices";
const uniqueMacIndex = "devices_mac_address_unique";

export const up: Migration = async ({ context }) => {
    const tables = await context.showAllTables();

    if (!tables.includes(devicesTable)) {
        await context.createTable(devicesTable, {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false
            },
            name: {
                type: DataTypes.STRING(20),
                allowNull: false
            },
            type: {
                type: DataTypes.STRING(20),
                allowNull: true
            },
            location: {
                type: DataTypes.STRING(50),
                allowNull: false,
                defaultValue: "Nao informado"
            },
            external_url: {
                type: DataTypes.STRING(2048),
                allowNull: true
            },
            mac_address: {
                type: DataTypes.STRING(20),
                allowNull: true
            },
            ip_address: {
                type: DataTypes.STRING(15),
                allowNull: true
            },
            status: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1
            }
        });
    }

    const indexes = await context.showIndex(devicesTable) as Array<{ name: string }>;

    if (!indexes.some((index) => index.name === uniqueMacIndex)) {
        await context.addIndex(devicesTable, ["mac_address"], {
            name: uniqueMacIndex,
            unique: true
        });
    }
};

export const down: Migration = async ({ context }) => {
    const tables = await context.showAllTables();

    if (tables.includes(devicesTable)) {
        await context.dropTable(devicesTable);
    }
};
