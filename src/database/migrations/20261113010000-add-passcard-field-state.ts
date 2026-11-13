import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

const fieldsTable = "passcardsfields";

export const up: Migration = async ({ context }) => {
    const tables = await context.showAllTables();
    if (!tables.includes(fieldsTable)) {
        return;
    }

    const description = await context.describeTable(fieldsTable);

    if (!description.field_status) {
        await context.addColumn(fieldsTable, "field_status", {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        });
    }

    if (!description.position) {
        await context.addColumn(fieldsTable, "position", {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        });
    }
};

export const down: Migration = async ({ context }) => {
    const tables = await context.showAllTables();
    if (!tables.includes(fieldsTable)) {
        return;
    }

    const description = await context.describeTable(fieldsTable);

    if (description.position) {
        await context.removeColumn(fieldsTable, "position");
    }

    if (description.field_status) {
        await context.removeColumn(fieldsTable, "field_status");
    }
};
