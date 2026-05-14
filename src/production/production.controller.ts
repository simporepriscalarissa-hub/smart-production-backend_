import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ProductionService } from './production.service';
import { CreateProductionDto } from './dto/create-production.dto';
import { UpdateProductionDto } from './dto/update-production.dto';
import { ScanProductionDto } from './dto/scan-production.dto';
import { ArreterSessionDto } from './dto/arreter-session.dto';

@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Post()
  create(@Body() createProductionDto: CreateProductionDto) {
    return this.productionService.create(createProductionDto);
  }

  // Scan d'une pièce : incrémente la session active ou en ouvre une nouvelle,
  // puis émet l'OEE recalculé sur le canal WebSocket 'oee_update'
  @Post('scan')
  scanner(@Body() dto: ScanProductionDto) {
    return this.productionService.scanner(dto);
  }

  // Clôture de session : pose dateFin, émet l'OEE final sur 'oee_update'
  @Post('arreter')
  arreterSession(@Body() dto: ArreterSessionDto) {
    return this.productionService.arreterSession(dto);
  }

  @Get()
  findAll() {
    return this.productionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productionService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProductionDto: UpdateProductionDto,
  ) {
    return this.productionService.update(+id, updateProductionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productionService.remove(+id);
  }
}
