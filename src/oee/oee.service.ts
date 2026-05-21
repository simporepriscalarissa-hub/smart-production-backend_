import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Production } from '../production/entities/production.entity';

@Injectable()
export class OeeService {
  constructor(
    @InjectRepository(Production)
    private productionRepository: Repository<Production>,
  ) {}

  async calculerOee() {
    const debutJournee = new Date();
    debutJournee.setHours(0, 0, 0, 0);

    const productions = await this.productionRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.reference', 'reference')
      .where('p.dateDebut >= :debut', { debut: debutJournee })
      .getMany();

    const totalProduit = productions.reduce((sum, p) => sum + p.quantiteProduite, 0);
    const totalConforme = productions.reduce((sum, p) => sum + p.quantiteConforme, 0);
    const totalNonConforme = totalProduit - totalConforme;

    const now = new Date();

    // Temps planifié et pièces théoriques — utilise le tempsCycle de chaque référence
    let tempsPlanifieTotalSec = 0;
    let piecesTheoriquesAttendues = 0;

    for (const p of productions) {
      const debut = p.dateDebut ? new Date(p.dateDebut) : null;
      if (!debut) continue;
      const fin = p.dateFin ? new Date(p.dateFin) : now;
      const dureeSec = (fin.getTime() - debut.getTime()) / 1000;
      tempsPlanifieTotalSec += dureeSec;

      const tempsCycle = p.reference?.tempsCycle ?? 60; // fallback 60s si pas de référence
      piecesTheoriquesAttendues += dureeSec / tempsCycle;
    }

    const disponibilite = 100;

    const performanceRaw =
      piecesTheoriquesAttendues > 0
        ? (totalProduit / piecesTheoriquesAttendues) * 100
        : 0;
    const performance = Math.min(performanceRaw, 100);

    const qualite = totalProduit > 0 ? (totalConforme / totalProduit) * 100 : 0;

    const oee = (disponibilite * performance * qualite) / 10000;

    return {
      disponibilite: parseFloat(disponibilite.toFixed(2)),
      performance: parseFloat(performance.toFixed(2)),
      qualite: parseFloat(qualite.toFixed(2)),
      oee: parseFloat(oee.toFixed(2)),
      totalProduit,
      totalConforme,
      totalNonConforme,
    };
  }
}
