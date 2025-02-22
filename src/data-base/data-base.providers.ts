import { DataSource } from "typeorm"

export const dataBaseProviders = [
    {
        provide: 'DATA_SOURCE',
        useFactory: async () => {
            const dataSource = new DataSource({
                type: 'postgres',
                host: '172.18.16.1',
                port: 5432,
                username: 'postgres',
                password: 'Via7216',
                database: 'databi',
                entities: [
                    __dirname + '/../**/*.entity{.ts,.js}',
                ],
                synchronize: true,
                logging: false
            });

            return dataSource.initialize()
        }
    }
]