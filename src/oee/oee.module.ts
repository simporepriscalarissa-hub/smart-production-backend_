import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OeeService } from './oee.service';
import { OeeController } from './oee.controller';
import { Production } from '../production/entities/production.entity';
import { Reference } from '../references/entities/reference.entity';
import { Qualite } from '../qualite/entities/qualite.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Production, Reference, Qualite])],
  controllers: [OeeController],
  providers: [OeeService],
  exports: [OeeService],
})
export class OeeModule {}
