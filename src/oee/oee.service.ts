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
    const TEMPS_CYCLE_THEORIQUE = 5.0; // secondes par pièce

    const productions = await this.productionRepository.find();

    const totalProduit = productions.reduce(
      (sum, p) => sum + p.quantiteProduite,
      0,
    );
    const totalConforme = productions.reduce(
      (sum, p) => sum + p.quantiteConforme,
      0,
    );

    // Temps planifié total en secondes (somme sur toutes les sessions)
    const now = new Date();
    const tempsPlanifieTotalSec = productions.reduce((sum, p) => {
      const debut = p.dateDebut ? new Date(p.dateDebut) : null;
      if (!debut) return sum;
      const fin = p.dateFin ? new Date(p.dateFin) : now;
      return sum + (fin.getTime() - debut.getTime()) / 1000;
    }, 0);

    const piecesTheoriquesAttendues =
      tempsPlanifieTotalSec > 0
        ? tempsPlanifieTotalSec / TEMPS_CYCLE_THEORIQUE
        : 0;

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
