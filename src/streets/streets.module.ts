import { Module } from '@nestjs/common';
import { StreetsService } from './streets.service';
import { StreetsController } from './streets.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Street } from './entities/streets.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Street])
  ],
  controllers: [StreetsController],
  providers: [StreetsService],
  exports: [StreetsService]
})
export class StreetsModule {}
