import { Module } from '@nestjs/common';
import { AuthConstantsService } from './auth-constants.service';
import { DataBaseModule } from 'src/data-base/data-base.module';

@Module({
  imports: [DataBaseModule],
  providers: [AuthConstantsService],
  exports: [AuthConstantsService]
})
export class AuthModule {}
