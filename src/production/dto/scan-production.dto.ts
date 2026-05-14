import { IsNumber, IsBoolean, IsString, IsNotEmpty } from 'class-validator';

export class ScanProductionDto {
  @IsNumber()
  ouvrierId: number;

  @IsString()
  @IsNotEmpty()
  reference: string;

  @IsBoolean()
  estConforme: boolean;
}
