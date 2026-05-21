import { PartialType } from '@nestjs/mapped-types';
import { CreateOeeDto } from './create-oee.dto';
export class UpdateOeeDto extends PartialType(CreateOeeDto) {
}
