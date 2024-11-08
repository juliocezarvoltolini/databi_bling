import { Module } from '@nestjs/common';
import { AuthBlingService } from './auth-bling.service';
import { DataBaseModule } from 'src/data-base/data-base.module';
import { EmpresaService } from 'src/empresa/empresa.service';
import { EmpresaModule } from 'src/empresa/empresa.module';
import { AuthModule } from 'src/auth-constants/auth-constants.module';

@Module({
    imports: [DataBaseModule, EmpresaModule, AuthModule],
    providers: [AuthBlingService],
    exports: [AuthBlingService]
})
export class BlingModule {}
