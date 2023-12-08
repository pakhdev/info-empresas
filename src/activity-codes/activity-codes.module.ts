import { Module } from '@nestjs/common';
import { ActivityCodesService } from './activity-codes.service';
import { ActivityCodesController } from './activity-codes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityCode } from './entities/activity-code.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityCode])
  ],
  controllers: [ActivityCodesController],
  providers: [ActivityCodesService],
  exports: [ActivityCodesService]
})
export class ActivityCodesModule {}
