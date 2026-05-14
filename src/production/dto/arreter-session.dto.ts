import { IsNumber, IsString, IsNotEmpty } from 'class-validator';

export class ArreterSessionDto {
  @IsNumber()
  ouvrierId: number;

  @IsString()
  @IsNotEmpty()
  reference: string;
}
