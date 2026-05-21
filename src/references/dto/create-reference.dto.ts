import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateReferenceDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  libelle: string;

  @IsNumber()
  @Min(1)
  tempsCycle: number;
}
