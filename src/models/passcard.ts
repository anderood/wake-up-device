import Sequelize from "sequelize";
import database from "../database/database.ts";

const passcards = database.define(
    "passcards",
    {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        date_created: {
            type: Sequelize.DATE,
            allowNull: false
        },
        user_created: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        date_updated: {
            type: Sequelize.DATE,
            allowNull: false
        },
        user_updated: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        title: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        status: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        obs: {
            type: Sequelize.TEXT,
            allowNull: true
        },
        groups: {
            type: Sequelize.TEXT,
            allowNull: true
        },
        user_id: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        client_id: {
            type: Sequelize.INTEGER,
            allowNull: true
        }
    },
    {
        tableName: "passcards",
        createdAt: false,
        updatedAt: false
    }
);

export default passcards;
