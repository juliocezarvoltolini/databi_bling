import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './logger/winston.logger';
import blingConstants from './integracao/bling/bling.constants';
import { AuthBlingService } from './integracao/bling/auth-bling.service';
import { TesteTask } from './task/interface/task.interface';


async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    { logger: logger }
  );
  await app.listen(3000);

}


bootstrap();


