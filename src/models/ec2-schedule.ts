import { DataTypes } from "sequelize";
import database from "../database/database.ts";

const ec2Schedule = database.define("ec2_schedule", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    action: { type: DataTypes.STRING(10), allowNull: false },
    weekday: { type: DataTypes.INTEGER, allowNull: false },
    local_time: { type: DataTypes.STRING(5), allowNull: false },
    enabled: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    updated_at: { type: DataTypes.STRING(40), allowNull: false }
}, { timestamps: false, tableName: "ec2_schedule" });

export default ec2Schedule;
