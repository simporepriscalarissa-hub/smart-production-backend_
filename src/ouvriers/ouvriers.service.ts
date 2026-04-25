import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateOuvrierDto } from './dto/create-ouvrier.dto';
import { UpdateOuvrierDto } from './dto/update-ouvrier.dto';
import { Ouvrier } from './entities/ouvrier.entity';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class OuvriersService {
  constructor(
    @InjectRepository(Ouvrier)
    private ouvriersRepository: Repository<Ouvrier>,
    private eventsGateway: EventsGateway,
  ) {}

  create(createOuvrierDto: CreateOuvrierDto) {
    const ouvrier = this.ouvriersRepository.create(createOuvrierDto);
    return this.ouvriersRepository.save(ouvrier);
  }

  findAll(departement?: string) {
    if (departement) {
      return this.ouvriersRepository.find({ where: { departement } });
    }
    return this.ouvriersRepository.find();
  }

  findOne(id: number) {
    return this.ouvriersRepository.findOne({ where: { id } });
  }

  findByRfid(rfid: string) {
    const cleanRfid = rfid.trim().toUpperCase();
    return this.ouvriersRepository.findOne({ where: { rfid: cleanRfid } });
  }

  async update(id: number, updateOuvrierDto: UpdateOuvrierDto) {
    await this.ouvriersRepository.update(id, updateOuvrierDto);
    return this.ouvriersRepository.findOne({ where: { id } });
  }

  async remove(id: number) {
    await this.ouvriersRepository.delete(id);
    return { message: `Ouvrier ${id} supprimé avec succès` };
  }

  async marquerPresence(rfid: string) {
    const cleanRfid = rfid.trim().toUpperCase();
    const ouvrier = await this.ouvriersRepository.findOne({ where: { rfid: cleanRfid } });
    if (!ouvrier) return null;
    ouvrier.dernierePresence = new Date();
    ouvrier.statut = 'Actif';
    const saved = await this.ouvriersRepository.save(ouvrier);

    // Émettre en temps réel
    this.eventsGateway.emitPresenceOuvrier({
      id: saved.id,
      nom: saved.nom,
      prenom: saved.prenom,
      departement: saved.departement,
      dernierePresence: saved.dernierePresence,
    });

    return saved;
  }
  async findLastSession(): Promise<Ouvrier | null> {
    return this.ouvriersRepository.findOne({
      where: { statut: 'Actif' },
      order: { dernierePresence: 'DESC' },
    });
  }

async findByBadge(badgeRFID: string): Promise<Ouvrier | null> {
  return await this.ouvriersRepository.findOne({ 
    where: { badgeRFID: badgeRFID } 
  });
}
  estActifAujourdhui(ouvrier: Ouvrier): boolean {
    if (!ouvrier.dernierePresence) return false;
    const aujourd = new Date();
    const presence = new Date(ouvrier.dernierePresence);
    return (
      presence.getDate() === aujourd.getDate() &&
      presence.getMonth() === aujourd.getMonth() &&
      presence.getFullYear() === aujourd.getFullYear()
    );
  }
}
