import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { normalizeDateInput } from '../../common/utils/date-input.util';
import { parseReservationIdInput } from '../../common/utils/reservation-id.util';

function parseOptionalInt(value: unknown): number | undefined {
  return parseReservationIdInput(value);
}

export class GuestVerifyDto {
  @IsOptional()
  @Transform(({ value }) => parseOptionalInt(value))
  @IsInt()
  reservationId?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @Transform(({ value }) => normalizeDateInput(value))
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrivalDate!: string;

  @Transform(({ value }) => normalizeDateInput(value))
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  departureDate!: string;

  @IsOptional()
  @IsString()
  listingName?: string;

  @IsOptional()
  @IsString()
  callId?: string;
}
