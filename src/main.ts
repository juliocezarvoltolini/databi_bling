import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './logger/winston.logger';



async function bootstrap() {


  const app = await NestFactory.create(
    AppModule,
    {
      snapshot: true,
      bufferLogs: true
    }
  );

  app.useLogger(logger);
  await app.listen(3000);

}


bootstrap();


