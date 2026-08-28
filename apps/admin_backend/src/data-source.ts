import 'dotenv/config';
import { DataSource } from 'typeorm';
import { resolve } from 'path';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
  synchronize: false,
  migrations: [resolve(__dirname, 'migrations', '!(*.spec).{ts,js}')],
});
