import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Departement } from './entities/departements.entity';
import { Ouvrier } from '../ouvriers/entities/ouvrier.entity';

@Injectable()
export class DepartementsService {
  constructor(
    @InjectRepository(Departement)
    private departementsRepository: Repository<Departement>,
    @InjectRepository(Ouvrier)
    private ouvriersRepository: Repository<Ouvrier>,
  ) {}

  create(data: Partial<Departement>) {
    const dept = this.departementsRepository.create(data);
    return this.departementsRepository.save(dept);
  }

  async findAll() {
    const depts = await this.departementsRepository.find();
    
    // Pour chaque département, compter le nombre d'ouvriers dont le champ 'departement' correspond au nom du département
    const deptsWithCount = await Promise.all(
      depts.map(async (dept) => {
        const count = await this.ouvriersRepository.count({
          where: { departement: dept.nom }
        });
        return {
          ...dept,
          nombreOuvriers: count
        };
      })
    );
    
    return deptsWithCount;
  }

  async remove(id: number) {
    await this.departementsRepository.delete(id);
    return { message: `Département ${id} supprimé` };
  }
}
