import Sequelize from "sequelize";
import database from "../database/database.ts";

const devices = database.define(

    "devices", 
    {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        name: {
            type: Sequelize.CHAR(20),
            allowNull: false
        },
        type: {
            type: Sequelize.CHAR(20),
            allowNull: true
        },
        mac_address:{
            type: Sequelize.CHAR(20),
            allowNull: false
        },
        status: {
            type: Sequelize.TINYINT,
            allowNull: false
        }
    }
);

export default devices;
