var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, } from 'typeorm';
import { Ouvrier } from '../../ouvriers/entities/ouvrier.entity';
let Production = class Production {
};
__decorate([
    PrimaryGeneratedColumn(),
    __metadata("design:type", Number)
], Production.prototype, "id", void 0);
__decorate([
    ManyToOne(() => Ouvrier),
    __metadata("design:type", Ouvrier)
], Production.prototype, "ouvrier", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Production.prototype, "reference", void 0);
__decorate([
    Column({ default: 0 }),
    __metadata("design:type", Number)
], Production.prototype, "quantiteProduite", void 0);
__decorate([
    Column({ default: 0 }),
    __metadata("design:type", Number)
], Production.prototype, "quantiteConforme", void 0);
__decorate([
    Column({ default: 0 }),
    __metadata("design:type", Number)
], Production.prototype, "quantiteNonConforme", void 0);
__decorate([
    CreateDateColumn(),
    __metadata("design:type", Date)
], Production.prototype, "createdAt", void 0);
Production = __decorate([
    Entity()
], Production);
export { Production };
