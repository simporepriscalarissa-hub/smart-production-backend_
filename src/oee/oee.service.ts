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
    const TEMPS_CYCLE_DEFAUT = 5.0; // secondes par pièce (utilisé si pas de référence)

    const debutJournee = new Date();
    debutJournee.setHours(0, 0, 0, 0);

    const productions = await this.productionRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.reference', 'reference')
      .where('p.dateDebut >= :debut', { debut: debutJournee })
      .getMany();

    const totalProduit = productions.reduce(
      (sum, p) => sum + p.quantiteProduite, 0,
    );
    const totalConforme = productions.reduce(
      (sum, p) => sum + p.quantiteConforme, 0,
    );

    const now = new Date();

    let tempsPlanifieTotalSec = 0;
    let piecesTheoriquesAttendues = 0;

    for (const p of productions) {
      const debut = p.dateDebut ? new Date(p.dateDebut) : null;
      if (!debut) continue;
      const fin = p.dateFin ? new Date(p.dateFin) : now;
      const dureeSec = (fin.getTime() - debut.getTime()) / 1000;
      tempsPlanifieTotalSec += dureeSec;

      // Utilise le tempsCycle de la référence, sinon la constante par défaut
      const tempsCycle = p.reference?.tempsCycle ?? TEMPS_CYCLE_DEFAUT;
      piecesTheoriquesAttendues += dureeSec / tempsCycle;
    }

    const disponibilite = 100;

    const performanceRaw =
      piecesTheoriquesAttendues > 0
        ? (totalProduit / piecesTheoriquesAttendues) * 100
        : 0;
    const performance = Math.min(performanceRaw, 100);

    const qualite =
      totalProduit > 0 ? (totalConforme / totalProduit) * 100 : 100;

    const oee = (disponibilite * performance * qualite) / 10000;

    return {
      disponibilite: parseFloat(disponibilite.toFixed(2)),
      performance: parseFloat(performance.toFixed(2)),
      qualite: parseFloat(qualite.toFixed(2)),
      oee: parseFloat(oee.toFixed(2)),
      totalProduit,
      totalConforme,
      totalNonConforme: totalProduit - totalConforme,
    };
  }
}
