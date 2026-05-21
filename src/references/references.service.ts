import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reference } from './entities/reference.entity';
import { CreateReferenceDto } from './dto/create-reference.dto';
import { UpdateReferenceDto } from './dto/update-reference.dto';

@Injectable()
export class ReferencesService {
  constructor(
    @InjectRepository(Reference)
    private referenceRepository: Repository<Reference>,
  ) {}

  async create(dto: CreateReferenceDto): Promise<Reference> {
    const existing = await this.referenceRepository.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`La référence "${dto.code}" existe déjà`);
    const ref = this.referenceRepository.create(dto);
    return this.referenceRepository.save(ref);
  }

  findAll(): Promise<Reference[]> {
    return this.referenceRepository.find({ order: { code: 'ASC' } });
  }

  async findOne(id: number): Promise<Reference> {
    const ref = await this.referenceRepository.findOne({ where: { id } });
    if (!ref) throw new NotFoundException(`Référence #${id} introuvable`);
    return ref;
  }

  async findByCode(code: string): Promise<Reference | null> {
    return this.referenceRepository.findOne({ where: { code } });
  }

  async update(id: number, dto: UpdateReferenceDto): Promise<Reference> {
    await this.findOne(id);
    await this.referenceRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: number): Promise<{ message: string }> {
    await this.findOne(id);
    await this.referenceRepository.delete(id);
    return { message: `Référence #${id} supprimée` };
  }
}
