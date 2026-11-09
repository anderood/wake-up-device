import { DataTypes } from "sequelize";
import database from "../database/database.ts";

const ec2Transition = database.define("ec2_transition", {
    instance_id: { type: DataTypes.STRING(19), primaryKey: true, allowNull: false },
    state: { type: DataTypes.STRING(32), allowNull: false },
    run_id: { type: DataTypes.INTEGER, allowNull: false },
    updated_at: { type: DataTypes.STRING(40), allowNull: false }
}, { timestamps: false, tableName: "ec2_transition" });

export default ec2Transition;
