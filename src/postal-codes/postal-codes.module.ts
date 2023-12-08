import { Module } from '@nestjs/common';
import { PostalCodesService } from './postal-codes.service';
import { PostalCodesController } from './postal-codes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostalCode } from './entities/postal-code.entity';
import { StreetsModule } from 'src/streets/streets.module';
import { ActivityCodesModule } from 'src/activity-codes/activity-codes.module';
import { CompaniesModule } from 'src/companies/companies.module';
import { PostalCodeDifficultActivityCode } from './entities/postal-code-difficult-activity-code.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PostalCode, PostalCodeDifficultActivityCode]),
    StreetsModule,
    ActivityCodesModule,
    CompaniesModule
  ],
  controllers: [PostalCodesController],
  providers: [PostalCodesService]
})
export class PostalCodesModule {}
