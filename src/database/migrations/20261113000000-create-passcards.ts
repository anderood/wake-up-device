import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

const passcardsTable = "passcards";
const fieldsTable = "passcardsfields";
const passcardsUserIndex = "passcards_user_id";
const fieldsPasscardIndex = "passcardsfields_passcard_id";

export const up: Migration = async ({ context }) => {
    const tables = await context.showAllTables();

    if (!tables.includes(passcardsTable)) {
        await context.createTable(passcardsTable, {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false
            },
            date_created: {
                type: DataTypes.DATE,
                allowNull: false
            },
            user_created: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            date_updated: {
                type: DataTypes.DATE,
                allowNull: false
            },
            user_updated: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            title: {
                type: DataTypes.STRING(255),
                allowNull: false
            },
            status: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1
            },
            obs: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            groups: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            client_id: {
                type: DataTypes.INTEGER,
                allowNull: true
            }
        });
    }

    if (!tables.includes(fieldsTable)) {
        await context.createTable(fieldsTable, {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false
            },
            date_created: {
                type: DataTypes.DATE,
                allowNull: false
            },
            user_created: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            date_updated: {
                type: DataTypes.DATE,
                allowNull: false
            },
            user_updated: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            type: {
                type: DataTypes.STRING(255),
                allowNull: false
            },
            value: {
                type: DataTypes.TEXT,
                allowNull: false,
                defaultValue: ""
            },
            value_e: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            status: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1
            },
            passcard_id: {
                type: DataTypes.INTEGER,
                allowNull: false
            }
        });
    }

    const passcardIndexes = await context.showIndex(passcardsTable) as Array<{ name: string }>;
    if (!passcardIndexes.some((index) => index.name === passcardsUserIndex)) {
        await context.addIndex(passcardsTable, ["user_id"], { name: passcardsUserIndex });
    }

    const fieldIndexes = await context.showIndex(fieldsTable) as Array<{ name: string }>;
    if (!fieldIndexes.some((index) => index.name === fieldsPasscardIndex)) {
        await context.addIndex(fieldsTable, ["passcard_id"], { name: fieldsPasscardIndex });
    }
};

export const down: Migration = async ({ context }) => {
    const tables = await context.showAllTables();

    if (tables.includes(fieldsTable)) {
        await context.dropTable(fieldsTable);
    }

    if (tables.includes(passcardsTable)) {
        await context.dropTable(passcardsTable);
    }
};
