import { DataTypes } from "sequelize";
import database from "../database/database.ts";

const ec2Config = database.define("ec2_config", {
    id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    instance_id: { type: DataTypes.STRING(19), allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false },
    timezone: { type: DataTypes.STRING(64), allowNull: false },
    recovery_enabled: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    scheduler_cursor_utc: { type: DataTypes.TEXT, allowNull: true },
    revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    updated_at: { type: DataTypes.STRING(40), allowNull: false }
}, { timestamps: false, tableName: "ec2_config" });

export default ec2Config;
