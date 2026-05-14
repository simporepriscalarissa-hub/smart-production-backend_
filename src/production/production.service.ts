import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CreateProductionDto } from './dto/create-production.dto';
import { UpdateProductionDto } from './dto/update-production.dto';
import { ScanProductionDto } from './dto/scan-production.dto';
import { ArreterSessionDto } from './dto/arreter-session.dto';
import { Production } from './entities/production.entity';
import { EventsGateway } from '../events/events.gateway';
import { OeeService } from '../oee/oee.service';

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(Production)
    private productionRepository: Repository<Production>,
    private eventsGateway: EventsGateway,
    private oeeService: OeeService,
  ) {}

  async create(createProductionDto: CreateProductionDto) {
    const production = this.productionRepository.create({
      reference: createProductionDto.reference,
      quantiteProduite: createProductionDto.quantiteProduite,
      quantiteConforme: createProductionDto.quantiteConforme,
      quantiteNonConforme: createProductionDto.quantiteNonConforme,
      ouvrier: { id: createProductionDto.ouvrierId },
      dateDebut: createProductionDto.dateDebut
        ? new Date(createProductionDto.dateDebut)
        : null,
      dateFin: createProductionDto.dateFin
        ? new Date(createProductionDto.dateFin)
        : null,
    });
    const saved = await this.productionRepository.save(production);

    const full = await this.productionRepository.findOne({
      where: { id: saved.id },
      relations: ['ouvrier'],
    });

    this.eventsGateway.emitNouvelleProduction(full);

    const oeeData = await this.oeeService.calculerOee();
    this.eventsGateway.emitOEE(oeeData);

    return full;
  }

  // POST /production/scan — incrémente la session active ou en ouvre une nouvelle
  async scanner(dto: ScanProductionDto) {
    let session = await this.productionRepository.findOne({
      where: {
        reference: dto.reference,
        ouvrier: { id: dto.ouvrierId },
        dateFin: IsNull(),
      },
      relations: ['ouvrier'],
    });

    if (!session) {
      session = this.productionRepository.create({
        reference: dto.reference,
        ouvrier: { id: dto.ouvrierId },
        quantiteProduite: 1,
        quantiteConforme: dto.estConforme ? 1 : 0,
        quantiteNonConforme: dto.estConforme ? 0 : 1,
        dateDebut: new Date(),
      });
    } else {
      session.quantiteProduite += 1;
      dto.estConforme
        ? (session.quantiteConforme += 1)
        : (session.quantiteNonConforme += 1);
    }

    const saved = await this.productionRepository.save(session);

    const full = await this.productionRepository.findOne({
      where: { id: saved.id },
      relations: ['ouvrier'],
    });

    this.eventsGateway.emitNouvelleProduction(full);

    const oeeData = await this.oeeService.calculerOee();
    this.eventsGateway.emitOEE(oeeData);

    return full;
  }

  // POST /production/arreter — clôture la session active et émet l'OEE final
  async arreterSession(dto: ArreterSessionDto) {
    const session = await this.productionRepository.findOne({
      where: {
        reference: dto.reference,
        ouvrier: { id: dto.ouvrierId },
        dateFin: IsNull(),
      },
      relations: ['ouvrier'],
    });

    if (!session) {
      throw new NotFoundException(
        `Aucune session active trouvée pour la référence "${dto.reference}"`,
      );
    }

    session.dateFin = new Date();
    const saved = await this.productionRepository.save(session);

    const oeeData = await this.oeeService.calculerOee();
    this.eventsGateway.emitOEE(oeeData);

    return { message: 'Session arrêtée avec succès', session: saved, oee: oeeData };
  }

  findAll() {
    return this.productionRepository.find({
      relations: ['ouvrier'],
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: number) {
    return this.productionRepository.findOne({
      where: { id },
      relations: ['ouvrier'],
    });
  }

  async update(id: number, updateProductionDto: UpdateProductionDto) {
    await this.productionRepository.update(id, updateProductionDto);
    return this.productionRepository.findOne({
      where: { id },
      relations: ['ouvrier'],
    });
  }

  async remove(id: number) {
    await this.productionRepository.delete(id);
    return { message: `Production ${id} supprimée avec succès` };
  }
}
