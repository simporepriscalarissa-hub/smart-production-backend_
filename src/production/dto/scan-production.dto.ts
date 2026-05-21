import { IsNumber, IsBoolean, IsString, IsNotEmpty } from 'class-validator';

export class ScanProductionDto {
  @IsNumber()
  ouvrierId: number;

  @IsString()
  @IsNotEmpty()
  referenceCode: string; // code de la référence (ex: "REF001")

  @IsBoolean()
  estConforme: boolean;
}
