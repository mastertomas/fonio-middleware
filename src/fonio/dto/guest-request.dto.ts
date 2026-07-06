import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { RequestType } from '@prisma/client';

function parseRequiredInt(value: unknown): number {
  if (value === '' || value === null || value === undefined) {
    return Number.NaN;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export class GuestRequestDto {
  @Transform(({ value }) => parseRequiredInt(value))
  @IsInt()
  reservationId!: number;

  @IsEnum(RequestType)
  requestType!: RequestType;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  callId?: string;

  @IsString()
  @IsNotEmpty()
  verificationToken!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  additionalGuests?: number;
}
