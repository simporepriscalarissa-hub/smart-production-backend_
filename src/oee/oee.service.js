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
import { Production } from '../production/entities/production.entity';
let OeeService = class OeeService {
    constructor(productionRepository) {
        this.productionRepository = productionRepository;
    }
    async calculerOee() {
        const productions = await this.productionRepository.find();
        const totalProduit = productions.reduce((sum, p) => sum + p.quantiteProduite, 0);
        const totalConforme = productions.reduce((sum, p) => sum + p.quantiteConforme, 0);
        const qualite = totalProduit > 0 ? (totalConforme / totalProduit) * 100 : 0;
        const disponibilite = 85;
        const performance = 90;
        const oee = (disponibilite * performance * qualite) / 10000;
        return {
            disponibilite: disponibilite.toFixed(2) + '%',
            performance: performance.toFixed(2) + '%',
            qualite: qualite.toFixed(2) + '%',
            oee: oee.toFixed(2) + '%',
            totalProduit,
            totalConforme,
            totalNonConforme: totalProduit - totalConforme,
        };
    }
};
OeeService = __decorate([
    Injectable(),
    __param(0, InjectRepository(Production)),
    __metadata("design:paramtypes", [typeof (_a = typeof Repository !== "undefined" && Repository) === "function" ? _a : Object])
], OeeService);
export { OeeService };
