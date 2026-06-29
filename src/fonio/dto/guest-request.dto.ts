import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { RequestType } from '@prisma/client';

export class GuestRequestDto {
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

  @IsOptional()
  @IsString()
  verificationToken?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  additionalGuests?: number;
}
