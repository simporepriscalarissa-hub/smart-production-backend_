import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, IsNull, Repository } from 'typeorm';
import { CreateProductionDto } from './dto/create-production.dto';
import { UpdateProductionDto } from './dto/update-production.dto';
import { ScanProductionDto } from './dto/scan-production.dto';
import { ArreterSessionDto } from './dto/arreter-session.dto';
import { Production } from './entities/production.entity';
import { EventsGateway } from '../events/events.gateway';
import { OeeService } from '../oee/oee.service';
import { ReferencesService } from '../references/references.service';

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(Production)
    private productionRepository: Repository<Production>,
    private eventsGateway: EventsGateway,
    private oeeService: OeeService,
    private referencesService: ReferencesService,
  ) {}

  async create(createProductionDto: CreateProductionDto) {
    const reference = await this.referencesService.findByCode(createProductionDto.referenceCode);
    if (!reference) {
      throw new BadRequestException(`Référence "${createProductionDto.referenceCode}" introuvable`);
    }

    const data: DeepPartial<Production> = {
      reference,
      quantiteProduite: createProductionDto.quantiteProduite,
      quantiteConforme: createProductionDto.quantiteConforme,
      quantiteNonConforme: createProductionDto.quantiteNonConforme,
      ouvrier: { id: createProductionDto.ouvrierId },
      dateDebut: createProductionDto.dateDebut
        ? new Date(createProductionDto.dateDebut)
        : new Date(),
      dateFin: createProductionDto.dateFin
        ? new Date(createProductionDto.dateFin)
        : new Date(),
    };
    const production = this.productionRepository.create(data);
    const saved = (await this.productionRepository.save(production)) as Production;

    const full = await this.productionRepository.findOne({
      where: { id: saved.id },
      relations: ['ouvrier', 'reference'],
    });

    this.eventsGateway.emitNouvelleProduction(full);

    const oeeData = await this.oeeService.calculerOee();
    this.eventsGateway.emitOEE(oeeData);

    return full;
  }

  async scanner(dto: ScanProductionDto) {
    const reference = await this.referencesService.findByCode(dto.referenceCode);
    if (!reference) {
      throw new BadRequestException(`Référence "${dto.referenceCode}" introuvable. Créez-la d'abord dans la gestion des références.`);
    }

    let session = await this.productionRepository.findOne({
      where: {
        reference: { id: reference.id },
        ouvrier: { id: dto.ouvrierId },
        dateFin: IsNull(),
      },
      relations: ['ouvrier', 'reference'],
    });

    if (!session) {
      const newData: DeepPartial<Production> = {
        reference,
        ouvrier: { id: dto.ouvrierId },
        quantiteProduite: 1,
        quantiteConforme: dto.estConforme ? 1 : 0,
        quantiteNonConforme: dto.estConforme ? 0 : 1,
        dateDebut: new Date(),
      };
      session = this.productionRepository.create(newData);
    } else {
      session.quantiteProduite += 1;
      dto.estConforme
        ? (session.quantiteConforme += 1)
        : (session.quantiteNonConforme += 1);
    }

    const saved = (await this.productionRepository.save(session)) as Production;

    const full = await this.productionRepository.findOne({
      where: { id: saved.id },
      relations: ['ouvrier', 'reference'],
    });

    this.eventsGateway.emitNouvelleProduction(full);

    const oeeData = await this.oeeService.calculerOee();
    this.eventsGateway.emitOEE(oeeData);

    return full;
  }

  async arreterSession(dto: ArreterSessionDto) {
    const reference = await this.referencesService.findByCode(dto.reference);

    const whereClause: any = {
      ouvrier: { id: dto.ouvrierId },
      dateFin: IsNull(),
    };
    if (reference) {
      whereClause.reference = { id: reference.id };
    }

    const session = await this.productionRepository.findOne({
      where: whereClause,
      relations: ['ouvrier', 'reference'],
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
      relations: ['ouvrier', 'reference'],
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: number) {
    return this.productionRepository.findOne({
      where: { id },
      relations: ['ouvrier', 'reference'],
    });
  }

  async update(id: number, updateProductionDto: UpdateProductionDto) {
    await this.productionRepository.update(id, updateProductionDto);
    return this.productionRepository.findOne({
      where: { id },
      relations: ['ouvrier', 'reference'],
    });
  }

  async remove(id: number) {
    await this.productionRepository.delete(id);
    return { message: `Production ${id} supprimée avec succès` };
  }
}
