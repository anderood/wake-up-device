import { DataTypes } from "sequelize";
import database from "../database/database.ts";

const authSession = database.define("auth_session", {
    sid: { type: DataTypes.STRING(128), primaryKey: true, allowNull: false },
    issuer: { type: DataTypes.STRING(512), allowNull: false },
    subject: { type: DataTypes.STRING(512), allowNull: false },
    data: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.STRING(40), allowNull: false },
    last_access_at: { type: DataTypes.STRING(40), allowNull: false },
    expires_at: { type: DataTypes.STRING(40), allowNull: false }
}, { timestamps: false, tableName: "auth_session" });

export default authSession;
