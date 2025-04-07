import { Injectable, LoggerService } from '@nestjs/common';
import { Logger } from 'winston';
import { buildWinstonLogger } from './winston.logger';


@Injectable()
export class WinstonLoggerService implements LoggerService {
    private readonly logger: Logger;

    constructor() {
        this.logger = buildWinstonLogger();
    }

    log(message: any, context?: string) {
        this.logger.info(message, { context });
    }

    error(message: any, trace?: string, context?: string) {
        this.logger.error(message, { context, stack: trace });
    }

    warn(message: any, context?: string) {
        this.logger.warn(message, { context });
    }

    debug(message: any, context?: string) {
        this.logger.debug(message, { context });
    }

    verbose(message: any, context?: string) {
        this.logger.verbose(message, { context });
    }
}
