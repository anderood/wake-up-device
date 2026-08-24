import Sequelize from "sequelize";
import database from "../database/database.ts";

const appSettings = database.define(
    "app_settings",
    {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        external_ip_address: {
            type: Sequelize.STRING(15),
            allowNull: false
        }
    },
    {
        tableName: "app_settings",
        createdAt: false,
        updatedAt: false
    }
);

export default appSettings;
