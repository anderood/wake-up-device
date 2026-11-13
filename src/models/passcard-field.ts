import Sequelize from "sequelize";
import database from "../database/database.ts";

const passcardFields = database.define(
    "passcardsfields",
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
        type: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        value: {
            type: Sequelize.TEXT,
            allowNull: false,
            defaultValue: ""
        },
        value_e: {
            type: Sequelize.TEXT,
            allowNull: true
        },
        status: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        field_status: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        position: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        passcard_id: {
            type: Sequelize.INTEGER,
            allowNull: false
        }
    },
    {
        tableName: "passcardsfields",
        createdAt: false,
        updatedAt: false
    }
);

export default passcardFields;
