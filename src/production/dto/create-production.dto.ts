import { IsString, IsNotEmpty, IsNumber, Min, IsDateString, IsOptional } from 'class-validator';

export class CreateProductionDto {
  @IsNumber()
  ouvrierId: number;

  @IsString()
  @IsNotEmpty()
  referenceCode: string; // code de la référence (ex: "REF001")

  @IsNumber()
  @Min(0)
  quantiteProduite: number;

  @IsNumber()
  @Min(0)
  quantiteConforme: number;

  @IsNumber()
  @Min(0)
  quantiteNonConforme: number;

  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @IsOptional()
  @IsDateString()
  dateFin?: string;
}
