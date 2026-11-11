import { DataTypes } from "sequelize";
import type { Migration } from "../migrate.ts";

const devicesTable = "devices";
const schedulesTable = "device_schedules";
const schedulerNameIndex = "device_schedules_scheduler_name_unique";

export const up: Migration = async ({ context }) => {
    const deviceColumns = await context.describeTable(devicesTable);

    if (!("ec2_instance_id" in deviceColumns)) {
        await context.addColumn(devicesTable, "ec2_instance_id", {
            type: DataTypes.STRING(19),
            allowNull: true
        });
    }

    if (!("aws_region" in deviceColumns)) {
        await context.addColumn(devicesTable, "aws_region", {
            type: DataTypes.STRING(32),
            allowNull: true
        });
    }

    const tables = await context.showAllTables();

    if (!tables.includes(schedulesTable)) {
        await context.createTable(schedulesTable, {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false
            },
            device_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: devicesTable,
                    key: "id"
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE"
            },
            action: {
                type: DataTypes.STRING(5),
                allowNull: false
            },
            expression: {
                type: DataTypes.STRING(128),
                allowNull: false
            },
            timezone: {
                type: DataTypes.STRING(64),
                allowNull: false,
                defaultValue: "America/Sao_Paulo"
            },
            enabled: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1
            },
            scheduler_name: {
                type: DataTypes.STRING(64),
                allowNull: true
            },
            scheduler_arn: {
                type: DataTypes.STRING(512),
                allowNull: true
            },
            sync_status: {
                type: DataTypes.STRING(16),
                allowNull: false,
                defaultValue: "pending"
            },
            last_sync_error: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            },
            updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW
            }
        });
    }

    const indexes = await context.showIndex(schedulesTable) as Array<{ name: string }>;

    if (!indexes.some((index) => index.name === schedulerNameIndex)) {
        await context.addIndex(schedulesTable, ["scheduler_name"], {
            name: schedulerNameIndex,
            unique: true
        });
    }

    if (!indexes.some((index) => index.name === "device_schedules_device_id")) {
        await context.addIndex(schedulesTable, ["device_id"], {
            name: "device_schedules_device_id"
        });
    }
};

export const down: Migration = async ({ context }) => {
    const tables = await context.showAllTables();

    if (tables.includes(schedulesTable)) {
        await context.dropTable(schedulesTable);
    }

    const deviceColumns = await context.describeTable(devicesTable);

    if ("aws_region" in deviceColumns) {
        await context.sequelize.query(
            "ALTER TABLE `devices` DROP COLUMN `aws_region`"
        );
    }

    if ("ec2_instance_id" in deviceColumns) {
        await context.sequelize.query(
            "ALTER TABLE `devices` DROP COLUMN `ec2_instance_id`"
        );
    }
};
