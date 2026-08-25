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
            type: Sequelize.STRING(20),
            allowNull: false
        },
        type: {
            type: Sequelize.STRING(20),
            allowNull: true
        },
        location: {
            type: Sequelize.STRING(50),
            allowNull: false,
            defaultValue: "Nao informado"
        },
        external_url: {
            type: Sequelize.STRING(2048),
            allowNull: true
        },
        mac_address:{
            type: Sequelize.STRING(20),
            allowNull: true,
            unique: true
        },
        ip_address: {
            type: Sequelize.STRING(15),
            allowNull: true
        },
        status: {
            type: Sequelize.INTEGER,
            allowNull: false
        }
    },{
        createdAt:false,
        updatedAt:false
    }
);

export default devices;
