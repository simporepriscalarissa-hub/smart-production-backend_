import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { OuvriersService } from './ouvriers.service';
import { QualiteService } from '../qualite/qualite.service'; // Import important
import { CreateOuvrierDto } from './dto/create-ouvrier.dto';
import { UpdateOuvrierDto } from './dto/update-ouvrier.dto';
import { EventsGateway } from 'src/events/events.gateway';

@Controller('ouvriers')
export class OuvriersController {
  constructor(
    private readonly ouvriersService: OuvriersService,
    private readonly qualiteService: QualiteService, // Injection pour le lien RFID-IA
    private readonly eventsGateway: EventsGateway,
  ) {}

  // --- LOGIQUE RFID (Utilisée par ton Arduino ESP32) ---

  @Post('presence/:rfid')
  async registerPresence(@Param('rfid') rfid: string) {
    console.log(`📡 Scan RFID reçu du Pi: [${rfid}]`);
    const ouvrier = await this.ouvriersService.findByRfid(rfid);
    
    if (!ouvrier) {
      throw new NotFoundException('Badge non reconnu dans la base');
    }

    // 1. On informe le QualiteService pour que l'IA sache qui travaille
    this.qualiteService.setOuvrierActuel(ouvrier.id);

    // 2. On marque la présence en BDD
    await this.ouvriersService.marquerPresence(rfid);

    // 3. On envoie l'info au Dashboard (Frontend) en temps réel
    this.eventsGateway.server.emit('ouvrier_actif', ouvrier);

    return { 
      status: 'success', 
      message: "Présence validée", 
      ouvrier: `${ouvrier.prenom} ${ouvrier.nom}` 
    };
  }

  @Get('rfid/:rfid')
  async findByRfid(@Param('rfid') rfid: string) {
    const ouvrier = await this.ouvriersService.findByRfid(rfid);
    if (!ouvrier) throw new NotFoundException('Badge inconnu');
    return ouvrier;
  }

  // Appelé par le script Pi (detect_and_send.py / gateway_pi.py)
  @Get('last-session')
  async getLastSession() {
    const ouvrier = await this.ouvriersService.findLastSession();
    if (!ouvrier) throw new NotFoundException('Aucun ouvrier actif');
    return ouvrier;
  }

  // --- CRUD CLASSIQUE (Utilisé par ton Dashboard) ---

  @Post()
  create(@Body() createOuvrierDto: CreateOuvrierDto) {
    return this.ouvriersService.create(createOuvrierDto);
  }

  @Get()
  findAll(@Query('departement') departement?: string) {
    return this.ouvriersService.findAll(departement);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ouvriersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOuvrierDto: UpdateOuvrierDto) {
    return this.ouvriersService.update(+id, updateOuvrierDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ouvriersService.remove(+id);
  }
}