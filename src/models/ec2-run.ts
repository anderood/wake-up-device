import { DataTypes } from "sequelize";
import database from "../database/database.ts";

const ec2Run = database.define("ec2_run", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    idempotency_key: { type: DataTypes.STRING(255), allowNull: false },
    occurrence_key: { type: DataTypes.STRING(255), allowNull: true },
    source: { type: DataTypes.STRING(16), allowNull: false },
    mode: { type: DataTypes.STRING(16), allowNull: false },
    action: { type: DataTypes.STRING(16), allowNull: false },
    instance_id: { type: DataTypes.STRING(19), allowNull: false },
    region: { type: DataTypes.STRING(32), allowNull: false },
    config_revision: { type: DataTypes.INTEGER, allowNull: false },
    schedule_id: { type: DataTypes.INTEGER, allowNull: true },
    scheduled_date: { type: DataTypes.STRING(10), allowNull: true },
    scheduled_time: { type: DataTypes.STRING(5), allowNull: true },
    scheduled_at_utc: { type: DataTypes.STRING(40), allowNull: true },
    schedule_revision: { type: DataTypes.INTEGER, allowNull: true },
    actor_issuer: { type: DataTypes.STRING(512), allowNull: true },
    actor_subject: { type: DataTypes.STRING(512), allowNull: true },
    reconciles_run_id: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(32), allowNull: false },
    claim_token: { type: DataTypes.STRING(128), allowNull: true },
    requested_at: { type: DataTypes.STRING(40), allowNull: false },
    started_at: { type: DataTypes.STRING(40), allowNull: true },
    finished_at: { type: DataTypes.STRING(40), allowNull: true },
    observed_state: { type: DataTypes.STRING(32), allowNull: true },
    result: { type: DataTypes.TEXT, allowNull: true },
    error_code: { type: DataTypes.STRING(32), allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true }
}, { timestamps: false, tableName: "ec2_run" });

export default ec2Run;
