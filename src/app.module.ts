import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreetsModule } from './streets/streets.module';
import { PostalCodesModule } from './postal-codes/postal-codes.module';
import { CompaniesModule } from './companies/companies.module';
import { ActivityCodesModule } from './activity-codes/activity-codes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env'
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.MYSQL_HOST,
      port: +process.env.MYSQL_PORT,
      username: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DB_NAME,
      autoLoadEntities: true,
      synchronize: true,
    }),
    StreetsModule,
    PostalCodesModule,
    CompaniesModule,
    ActivityCodesModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
