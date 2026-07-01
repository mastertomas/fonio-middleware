import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { parseQueryBoolean } from '../../common/utils/query-boolean.util';

export class AvailabilityQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsString()
  checkIn!: string;

  @IsString()
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests!: number;

  @IsOptional()
  @Transform(({ value }) => parseQueryBoolean(value))
  @IsBoolean()
  pets?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @IsString()
  roomType?: string;

  @IsOptional()
  @Transform(({ value }) => parseQueryBoolean(value))
  @IsBoolean()
  availableOnly?: boolean;
}
