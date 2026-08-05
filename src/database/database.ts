import dotenv from "dotenv";
import { Sequelize } from "sequelize";

dotenv.config();

const databaseStorage = process.env.DB_STORAGE?.trim() || "wake-up-device.sqlite";

const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: databaseStorage
});

export default sequelize;
