import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepartementsService } from './departements.service';
import { DepartementsController } from './departements.controller';
import { Departement } from './entities/departements.entity';
import { Ouvrier } from '../ouvriers/entities/ouvrier.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Departement, Ouvrier])],
  controllers: [DepartementsController],
  providers: [DepartementsService],
})
export class DepartementsModule {}
