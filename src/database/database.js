import dotenv from 'dotenv';
import { Sequelize  } from 'sequelize';

dotenv.config();

export default sequelize = new Sequelize(

    process.env.DB_DATABASE,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_DATABASE,
        dialect: 'mysql',
        port: process.env.DB_PORT || 3306
    }
);