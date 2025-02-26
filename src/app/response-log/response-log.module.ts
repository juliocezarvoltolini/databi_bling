import { Module } from '@nestjs/common';
import { ResponseLogService } from './response-log.service';
import { DataBaseModule } from 'src/data-base/data-base.module';

@Module({
  imports: [DataBaseModule],
  providers: [ResponseLogService],
  exports: [ResponseLogService],
})
export class ResponseLogModule {}
