import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Production } from '../production/entities/production.entity';
import { Qualite } from '../qualite/entities/qualite.entity';

@Injectable()
export class OeeService {
  constructor(
    @InjectRepository(Production)
    private productionRepository: Repository<Production>,
    @InjectRepository(Qualite)
    private qualiteRepository: Repository<Qualite>,
  ) {}

  async calculerOee() {
    const TEMPS_CYCLE_DEFAUT = 5.0;

    const debutJournee = new Date();
    debutJournee.setHours(0, 0, 0, 0);

    const productions = await this.productionRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.reference', 'reference')
      .where('p.dateDebut >= :debut OR p.dateDebut IS NULL', { debut: debutJournee })
      .getMany();

    const totalProduit = productions.reduce(
      (sum, p) => sum + p.quantiteProduite, 0,
    );

    // Qualité calculée depuis la table qualite (résultats IA réels)
    const totalConformeIA = await this.qualiteRepository.count({
      where: { statutIA: 'conforme' },
    });
    const totalNonConformeIA = await this.qualiteRepository.count({
      where: { statutIA: 'non_conforme' },
    });
    const totalIA = totalConformeIA + totalNonConformeIA;

    const now = new Date();
    let piecesTheoriquesAttendues = 0;

    for (const p of productions) {
      const tempsCycle = p.reference?.tempsCycle ?? TEMPS_CYCLE_DEFAUT;
      const debut = p.dateDebut ? new Date(p.dateDebut) : null;

      if (!debut) {
        piecesTheoriquesAttendues += p.quantiteProduite;
        continue;
      }

      const fin = p.dateFin ? new Date(p.dateFin) : now;
      const dureeSec = (fin.getTime() - debut.getTime()) / 1000;

      if (dureeSec < 1) {
        piecesTheoriquesAttendues += p.quantiteProduite;
      } else {
        piecesTheoriquesAttendues += dureeSec / tempsCycle;
      }
    }

    const disponibilite = 100;

    const performanceRaw =
      piecesTheoriquesAttendues > 0
        ? (totalProduit / piecesTheoriquesAttendues) * 100
        : 0;
    const performance = Math.min(performanceRaw, 100);

    // Priorité à la table qualite si elle contient des données, sinon fallback sur production
    const qualite =
      totalIA > 0
        ? (totalConformeIA / totalIA) * 100
        : totalProduit > 0
        ? (productions.reduce((s, p) => s + p.quantiteConforme, 0) / totalProduit) * 100
        : 100;

    const oee = (disponibilite * performance * qualite) / 10000;

    return {
      disponibilite: parseFloat(disponibilite.toFixed(2)),
      performance: parseFloat(performance.toFixed(2)),
      qualite: parseFloat(qualite.toFixed(2)),
      oee: parseFloat(oee.toFixed(2)),
      totalProduit,
      totalConforme: totalIA > 0 ? totalConformeIA : productions.reduce((s, p) => s + p.quantiteConforme, 0),
      totalNonConforme: totalIA > 0 ? totalNonConformeIA : productions.reduce((s, p) => s + p.quantiteNonConforme, 0),
    };
  }
}
