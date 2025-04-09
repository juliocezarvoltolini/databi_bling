import { Module } from '@nestjs/common';
import { dataBaseProviders } from './data-base.providers';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [...dataBaseProviders],
  exports: [...dataBaseProviders],
})
export class DataBaseModule {}
