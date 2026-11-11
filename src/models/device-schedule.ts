import Sequelize from "sequelize";
import database from "../database/database.ts";

const deviceSchedules = database.define(
    "device_schedules",
    {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        device_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        action: {
            type: Sequelize.STRING(5),
            allowNull: false
        },
        expression: {
            type: Sequelize.STRING(128),
            allowNull: false
        },
        timezone: {
            type: Sequelize.STRING(64),
            allowNull: false
        },
        enabled: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        scheduler_name: {
            type: Sequelize.STRING(64),
            allowNull: true,
            unique: true
        },
        scheduler_arn: {
            type: Sequelize.STRING(512),
            allowNull: true
        },
        sync_status: {
            type: Sequelize.STRING(16),
            allowNull: false,
            defaultValue: "pending"
        },
        last_sync_error: {
            type: Sequelize.TEXT,
            allowNull: true
        },
        created_at: {
            type: Sequelize.DATE,
            allowNull: false
        },
        updated_at: {
            type: Sequelize.DATE,
            allowNull: false
        }
    },
    {
        createdAt: "created_at",
        updatedAt: "updated_at"
    }
);

export default deviceSchedules;
