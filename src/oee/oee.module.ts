import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OeeService } from './oee.service';
import { OeeController } from './oee.controller';
import { Production } from '../production/entities/production.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Production])],
  controllers: [OeeController],
  providers: [OeeService],
  exports: [OeeService],
})
export class OeeModule {}
