import { Module } from '@nestjs/common';
import { dataBaseProviders } from './data-base.providers';

@Module({
    providers: [ 
        ...dataBaseProviders,
    ],
    exports: [
        ...dataBaseProviders
    ]

})
export class DataBaseModule {}
