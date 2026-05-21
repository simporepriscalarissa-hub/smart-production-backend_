var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a;
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Production } from './entities/production.entity';
import { EventsGateway } from '../events/events.gateway';
let ProductionService = class ProductionService {
    constructor(productionRepository, eventsGateway) {
        this.productionRepository = productionRepository;
        this.eventsGateway = eventsGateway;
    }
    async create(createProductionDto) {
        const production = this.productionRepository.create({
            reference: createProductionDto.reference,
            quantiteProduite: createProductionDto.quantiteProduite,
            quantiteConforme: createProductionDto.quantiteConforme,
            quantiteNonConforme: createProductionDto.quantiteNonConforme,
            ouvrier: { id: createProductionDto.ouvrierId },
        });
        const saved = await this.productionRepository.save(production);
        // Récupérer avec les relations pour le WebSocket
        const full = await this.productionRepository.findOne({
            where: { id: saved.id },
            relations: ['ouvrier'],
        });
        // Émettre en temps réel
        this.eventsGateway.emitNouvelleProduction(full);
        // Émettre OEE mis à jour
        const oeeData = await this.calculerOEE();
        this.eventsGateway.emitOEE(oeeData);
        return full;
    }
    findAll() {
        return this.productionRepository.find({
            relations: ['ouvrier'],
            order: { createdAt: 'DESC' },
        });
    }
    findOne(id) {
        return this.productionRepository.findOne({
            where: { id },
            relations: ['ouvrier'],
        });
    }
    async update(id, updateProductionDto) {
        await this.productionRepository.update(id, updateProductionDto);
        return this.productionRepository.findOne({
            where: { id },
            relations: ['ouvrier'],
        });
    }
    async remove(id) {
        await this.productionRepository.delete(id);
        return { message: `Production ${id} supprimée avec succès` };
    }
    async calculerOEE() {
        const productions = await this.productionRepository.find();
        const totalProduit = productions.reduce((acc, p) => acc + p.quantiteProduite, 0);
        const totalConforme = productions.reduce((acc, p) => acc + p.quantiteConforme, 0);
        const totalNonConforme = productions.reduce((acc, p) => acc + p.quantiteNonConforme, 0);
        const qualite = totalProduit > 0 ? (totalConforme / totalProduit) * 100 : 0;
        return {
            totalProduit,
            totalConforme,
            totalNonConforme,
            qualite: `${qualite.toFixed(1)}%`,
            oee: `${(qualite * 0.9).toFixed(1)}%`,
        };
    }
};
ProductionService = __decorate([
    Injectable(),
    __param(0, InjectRepository(Production)),
    __metadata("design:paramtypes", [typeof (_a = typeof Repository !== "undefined" && Repository) === "function" ? _a : Object, EventsGateway])
], ProductionService);
export { ProductionService };
