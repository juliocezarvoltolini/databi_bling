import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './logger/winston.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    snapshot: true,
    bufferLogs: true,
  });

  app.enableCors({
    origin: '*', // Libera para qualquer origem (pode restringir se quiser)
  });

  app.useLogger(logger);
  await app.listen(3000);
}

bootstrap();
