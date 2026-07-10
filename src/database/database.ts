import dotenv from "dotenv";
import { Sequelize } from "sequelize";

dotenv.config();

const databaseName = process.env.DB_DATABASE ?? "";
const databaseUser = process.env.DB_USER ?? "";
const databasePassword = process.env.DB_PASSWORD ?? "";
const databaseHost = process.env.DB_HOST ?? "127.0.0.1";
const databasePort = Number(process.env.DB_PORT ?? 3306);

const sequelize = new Sequelize(
    databaseName,
    databaseUser,
    databasePassword,
    {
        host: databaseHost,
        dialect: "mysql",
        port: databasePort
    }
);

export default sequelize;
